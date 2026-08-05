import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * First pass on a rasterized floor plan (already confirmed to come from a
 * genuine vector PDF, and already rendered client-side into a crisp
 * image - that step hasn't changed). A real plan sheet often shows more
 * than one floor at once, and this tool only ever turns ONE floor into a
 * 3D view per generation - so detecting which floors are actually present
 * is the first, necessary step, not an afterthought.
 */
export async function POST(req: NextRequest) {
  const { base64, mediaType } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // SECURITY: check the real daily limit before spending money on an AI
  // call, not just at the final database-save step - otherwise this
  // route itself could be hit directly, unlimited times, regardless of
  // whether any result ever gets saved.
  const { data: remaining } = await supabase.rpc("isometric_generations_remaining_today", {
    target_user_id: user.id,
    target_base: "top_view",
  });
  if ((remaining ?? 0) <= 0) {
    return NextResponse.json(
      { error: "You've used all 5 Top View generations for today — this resets tomorrow." },
      { status: 429 }
    );
  }

  // SECURITY: reserve the slot NOW, not after the AI call - a saved-count
  // check alone doesn't stop repeated calls that never reach the final
  // save step, since no row would ever exist to count. This insert is
  // itself protected by the same daily-limit trigger, so it correctly
  // fails once 5 are already reserved today.
  const { data: reservation, error: reserveError } = await supabase
    .from("isometric_generations")
    .insert({ user_id: user.id, base: "top_view", input_storage_path: "pending", status: "pending" })
    .select("id")
    .single();
  if (reserveError || !reservation) {
    return NextResponse.json(
      { error: "You've used all 5 Top View generations for today — this resets tomorrow." },
      { status: 429 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI analysis is not configured yet." }, { status: 503 });
  }

  try {
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              {
                type: "text",
                text:
                  `This is an architectural floor plan sheet. It may show one floor or several ` +
                  `(e.g. "Ground Floor" and "First Floor" side by side). Identify every distinct ` +
                  `floor actually shown, by whatever label appears on the page (e.g. "Ground ` +
                  `Floor", "First Floor", "Terrace") - do not guess floors that aren't actually ` +
                  `labeled or shown.\n\n` +
                  `Also ask up to 2 short questions ONLY about things genuinely needed to build a ` +
                  `3D view that can't be determined from the sheet - typically wall/floor height if ` +
                  `no such note exists on the plan. Do not ask about anything already visible. If ` +
                  `nothing needs asking, respond with an empty questions list.\n\n` +
                  `Respond with ONLY valid JSON, no other text: ` +
                  `{"floors_detected":["Ground Floor","First Floor"],"questions":["..."]}`,
              },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      let detail = "";
      try {
        const errBody = await aiResp.json();
        detail = errBody?.error?.message ?? "";
      } catch {}
      // Release the slot - a genuine system-side failure isn't a real
      // use of the tool and shouldn't cost the person one of their 5.
      await supabase.from("isometric_generations").delete().eq("id", reservation.id);
      return NextResponse.json(
        { error: `AI request failed (${aiResp.status}).${detail ? " " + detail : ""}` },
        { status: 502 }
      );
    }

    const aiData = await aiResp.json();
    const text: string =
      aiData.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ floors_detected: [], questions: [], generationId: reservation.id });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      floors_detected: Array.isArray(parsed.floors_detected) ? parsed.floors_detected : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 2) : [],
      generationId: reservation.id,
    });
  } catch (err) {
    await supabase.from("isometric_generations").delete().eq("id", reservation.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong studying this plan." },
      { status: 500 }
    );
  }
}
