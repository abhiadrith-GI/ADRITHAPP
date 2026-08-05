import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Generates the wall structure for exactly ONE floor from the plan
 * sheet, as real wall centerline segments in real feet - not room
 * percentages. This mirrors the actual technique proven correct in a
 * real SketchUp model built via the Trimble connector: real 5-inch
 * walls, real 9ft height, and a consistent corner rule (horizontal
 * walls own their corners at full length; vertical walls get trimmed
 * automatically by the renderer, not asked of the AI here).
 *
 * The AI's job is spatial understanding - where walls actually are,
 * what openings they have - not working out corner-joining arithmetic
 * itself. That trimming happens deterministically in the renderer.
 */
export async function POST(req: NextRequest) {
  const { base64, mediaType, floorLabel, questionsAndAnswers, generationId } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // SECURITY: require the reservation made by the study step, rather
  // than independently checking the remaining count here - the slot was
  // already reserved there. This also closes a direct bypass: calling
  // this route without ever having called /study, which an independent
  // recheck alone wouldn't catch, since no row would exist yet to count
  // against the limit either way.
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
                  `Work out this floor's real layout systematically, the way a real drafter would - ` +
                  `do this BEFORE writing any wall coordinates:\n` +
                  `1. Read every room's own labeled width x depth on the sheet. These are real ` +
                  `numbers - use them exactly, don't round or approximate them.\n` +
                  `2. Work out which rooms are actually adjacent to which, and on which side (left/` +
                  `right/above/below), from their real position on the sheet - not an assumed grid.\n` +
                  `3. Build one consistent set of coordinates room by room: place the first room, ` +
                  `then place each neighbor using ITS OWN labeled dimension, positioned to share a ` +
                  `wall with the room(s) it's actually next to. A small gap between labeled room ` +
                  `dimensions and the overall building footprint is normal and expected - that's wall ` +
                  `thickness, typically 4-6 inches for interior partitions and 8-10 inches for ` +
                  `exterior walls, not a mistake to paper over.\n` +
                  `4. Check your own work before finalizing: do the rooms along each side, added up, ` +
                  `land close to the plan's own overall width and depth? If they don't, you've ` +
                  `likely misread an adjacency or a dimension - look again before writing coordinates.\n` +
                  `Only estimate reasonable proportions where a dimension is genuinely not labeled ` +
                  `anywhere on the sheet.\n\n` +
                  `Describe every wall as a straight centerline segment in real feet - both the ` +
                  `outer perimeter walls and every interior partition between rooms. For each ` +
                  `segment, give its two endpoints (x,y in feet, with (0,0) at one corner of this ` +
                  `floor), and which side of the wall faces "into" the building interior (as a unit ` +
                  `direction: for a wall running left-right, inward is usually {"x":0,"y":1} or ` +
                  `{"x":0,"y":-1}; for a wall running up-down, inward is usually {"x":1,"y":0} or ` +
                  `{"x":-1,"y":0}).\n\n` +
                  `For each wall, note any single door or window opening on it: how far from the ` +
                  `first endpoint it starts and ends (as a fraction 0-1 of that wall's own length), ` +
                  `and its height band in feet (doors: 0 to about 6.75ft; windows: roughly 2.5ft to ` +
                  `6.5ft sill-to-head, adjust if the plan indicates otherwise). Leave openings out ` +
                  `entirely for walls with none.\n\n` +
                  `Also give each room's label and its approximate center point in feet, for placing ` +
                  `text - this doesn't need to be precise, just inside that room.\n\n` +
                  `Respond with ONLY valid JSON, no other text, in exactly this shape:\n` +
                  `{"floor_label":"${floorLabel}","overall_width_ft":0,"overall_depth_ft":0,` +
                  `"wall_height_ft":9,"walls":[{"ax":0,"ay":0,"bx":0,"by":0,` +
                  `"inward":{"x":0,"y":1},"opening":{"t0":0,"t1":0,"z0":0,"z1":0}}],` +
                  `"room_labels":[{"label":"e.g. Bedroom","x":0,"y":0}],` +
                  `"notes":"one short sentence a client would find genuinely helpful"}\n` +
                  `Omit "opening" entirely for a wall with no door or window.`,
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
      return NextResponse.json({ error: "Could not read a floor layout from this plan." }, { status: 502 });
    }

    const floorPlan = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ floorPlan, generationId: reservation.id });
  } catch (err) {
    await supabase.from("isometric_generations").delete().eq("id", reservation.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong analyzing this plan." },
      { status: 500 }
    );
  }
}
