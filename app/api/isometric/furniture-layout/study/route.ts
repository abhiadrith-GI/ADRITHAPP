import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * First pass, before any layout is generated: looks at the room and asks
 * about anything genuinely needed to plan it well - what the space is
 * really for if that's not obvious, its approximate real-world size if
 * not visible, and whether existing furniture needs to be worked around.
 * This applies to any room in a house - a kitchen, a living room, a
 * study, a bedroom - not assumed to be any one of them. Mirrors Base 1's
 * pattern: study first, ask, then generate - never generate on a first
 * guess.
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
  // call - this route can otherwise be hit directly, unlimited times.
  const { data: remaining } = await supabase.rpc("isometric_generations_remaining_today", {
    target_user_id: user.id,
    target_base: "furniture_layout",
  });
  if ((remaining ?? 0) <= 0) {
    return NextResponse.json(
      { error: "You've used all 5 Furniture Layout generations for today — this resets tomorrow." },
      { status: 429 }
    );
  }

  // SECURITY: reserve the slot NOW, before the AI call - a saved-count
  // check alone doesn't stop repeated calls that never reach the final
  // save step, since no row would exist yet to count against the limit.
  const { data: reservation, error: reserveError } = await supabase
    .from("isometric_generations")
    .insert({ user_id: user.id, base: "furniture_layout", input_storage_path: "pending", status: "pending" })
    .select("id")
    .single();
  if (reserveError || !reservation) {
    return NextResponse.json(
      { error: "You've used all 5 Furniture Layout generations for today — this resets tomorrow." },
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
                  `This is a room from somewhere in a house - it could be a bedroom, living room, ` +
                  `kitchen, dining room, study, or any other room. Do not assume which one without ` +
                  `looking - identify it from what's actually visible.\n\n` +
                  `Before planning any furniture arrangement, ask up to 3 short questions ONLY about ` +
                  `things that genuinely can't be determined from the image and would meaningfully ` +
                  `change the layout - for example: the room's approximate real-world size if no ` +
                  `scale is visible, whether existing furniture shown needs to stay or can be ` +
                  `replaced, or the room's intended use if that's genuinely ambiguous from what's ` +
                  `shown. Do not ask about things you can already see. If nothing genuinely needs ` +
                  `asking, respond with exactly: NONE\n\n` +
                  `Respond with ONLY valid JSON, no other text: ` +
                  `{"room_type_guess":"e.g. Living Room","questions":["...","..."]} - ` +
                  `or {"room_type_guess":"...","questions":[]} if nothing needs asking.`,
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
      return NextResponse.json({ room_type_guess: "Room", questions: [], generationId: reservation.id });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      room_type_guess: parsed.room_type_guess ?? "Room",
      questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : [],
      generationId: reservation.id,
    });
  } catch {
    return NextResponse.json({ room_type_guess: "Room", questions: [] });
  }
}
