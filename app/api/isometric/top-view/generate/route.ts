import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Generates the wall structure for exactly ONE floor - as a hybrid, not
 * a single AI-vision guess. The client already extracted every real
 * wall-like line directly from the PDF's own vector data (exact
 * coordinates, no guessing) and found candidate boundary rectangles
 * geometrically. AI's job here is narrow and checkable: confirm or
 * correct which rectangle is the true building (a real plan sheet often
 * also shows a separate site/plot boundary, confirmed as a real,
 * recurring case), read the plan's own stated overall dimensions for
 * scale, and read each room's label and position. AI is never asked to
 * guess wall positions from scratch - that's exact, extracted data.
 */
export async function POST(req: NextRequest) {
  const {
    base64,
    mediaType,
    floorLabel,
    questionsAndAnswers,
    generationId,
    candidateBoundaries, // [{minXPct,maxXPct,minYPct,maxYPct}] - as % of image size
  } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!generationId) {
    return NextResponse.json({ error: "Missing generation reservation." }, { status: 400 });
  }
  const { data: reservation } = await supabase
    .from("isometric_generations")
    .select("id, status")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .eq("base", "top_view")
    .single();
  if (!reservation || reservation.status !== "pending") {
    return NextResponse.json({ error: "This reservation is invalid or already used." }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI analysis is not configured yet." }, { status: 503 });
  }

  const qaText: string = (questionsAndAnswers ?? [])
    .map((qa: { question: string; answer: string }) => `Q: ${qa.question}\nA: ${qa.answer || "(not answered)"}`)
    .join("\n");

  const candidatesText: string = Array.isArray(candidateBoundaries) && candidateBoundaries.length
    ? candidateBoundaries
        .map(
          (c: { minXPct: number; maxXPct: number; minYPct: number; maxYPct: number }, i: number) =>
            `Candidate ${String.fromCharCode(65 + i)}: spans ${c.minXPct.toFixed(0)}%-${c.maxXPct.toFixed(0)}% of the image width, ${c.minYPct.toFixed(0)}%-${c.maxYPct.toFixed(0)}% of the image height.`
        )
        .join("\n")
    : "";

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
        max_tokens: 2200,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              {
                type: "text",
                text:
                  `This floor plan sheet may show multiple floors. Focus ONLY on: ${floorLabel}. ` +
                  `Ignore any other floors shown on the same sheet.\n\n` +
                  (qaText ? `Additional context from the person:\n${qaText}\n\n` : "") +
                  (candidatesText
                    ? `The plan's own exact line data was already measured directly (not guessed), ` +
                      `finding these candidate rectangles:\n${candidatesText}\n\n` +
                      `Some plans show a site/property boundary as well as the actual building - if ` +
                      `so, these are usually two distinct rectangles, one clearly larger. Look at the ` +
                      `image and identify which candidate letter (if any) is the TRUE BUILDING outline ` +
                      `specifically - not a property line, plot boundary, or setback. If the true ` +
                      `building's actual outline doesn't match any candidate closely (e.g. real walls ` +
                      `were missed by automatic detection), instead describe the building's real ` +
                      `outline directly as approximate percentages of the image width/height, the same ` +
                      `way the candidates are described above.\n\n`
                    : "") +
                  `Read the plan's own overall stated width and depth if labeled anywhere (e.g. a ` +
                  `dimension line reading "21'"), and use that real number for scale - don't estimate ` +
                  `if a real number is visible. Read every room's own label and its real position.\n\n` +
                  `Respond with ONLY valid JSON, no other text, in exactly this shape:\n` +
                  `{"matched_candidate":"A" or null,"true_building_bounds":{"minXPct":0,"maxXPct":0,` +
                  `"minYPct":0,"maxYPct":0} or null,"overall_width_ft":0,"overall_depth_ft":0,` +
                  `"wall_height_ft":9,"room_labels":[{"label":"e.g. Bedroom","x_pct":0,"y_pct":0}],` +
                  `"notes":"one short sentence a client would find genuinely helpful"}\n` +
                  `Set "matched_candidate" to null and fill "true_building_bounds" only when no ` +
                  `candidate is a good match; otherwise set "true_building_bounds" to null.`,
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
      await supabase.from("isometric_generations").delete().eq("id", reservation.id);
      return NextResponse.json({ error: "Could not read this plan's real dimensions and labels." }, { status: 502 });
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ analysis, generationId: reservation.id });
  } catch (err) {
    await supabase.from("isometric_generations").delete().eq("id", reservation.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong analyzing this plan." },
      { status: 500 }
    );
  }
}
