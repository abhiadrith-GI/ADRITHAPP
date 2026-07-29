import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Generates the actual suggested arrangement - only called after the
 * study step, informed by whatever the person answered there. Works for
 * any room in a house, not just a bedroom: furniture "type" and "label"
 * are free-form, describing whatever actually belongs in this specific
 * room - a kitchen island, a dining table, a bookshelf, a wardrobe,
 * whatever fits what was actually identified.
 *
 * Clearance requirements are split deliberately: the universal ones
 * (walkway, door approach, general furniture spacing) are baked in as
 * hard numbers, sourced from NKBA/ASID-aligned residential circulation
 * standards - these apply almost regardless of room type. Anything more
 * room-specific (a kitchen work triangle, dining chair pull-out space) is
 * left to Claude's own real architectural knowledge, applied to whatever
 * room type was actually identified, rather than hard-coding a separate
 * rule for every possible room.
 */
export async function POST(req: NextRequest) {
  const { imageBase64, mediaType, roomTypeGuess, questionsAndAnswers } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
        max_tokens: 1600,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              {
                type: "text",
                text:
                  `This room was identified as: ${roomTypeGuess ?? "a room in a house"}. ` +
                  (qaText ? `Additional context from the person:\n${qaText}\n\n` : "") +
                  `Identify the room's actual shape, doors, and windows, then suggest ONE workable ` +
                  `furniture arrangement suited to what this room actually is - a bedroom needs a ` +
                  `bed and wardrobe; a kitchen needs work surfaces and an efficient work triangle; a ` +
                  `dining room needs a table with pull-out space for every chair; a living room needs ` +
                  `seating oriented for conversation or a screen; a study needs a desk with room to ` +
                  `sit and move a chair. Choose furniture and arrangement genuinely appropriate to ` +
                  `the actual room, not a generic template.\n\n` +
                  `These clearances are REQUIRED, not optional, regardless of room type:\n` +
                  `- Main walkway through the room: at least 36 inches wide\n` +
                  `- Both sides of every doorway: at least 36 inches kept clear, matching the door's own swing\n` +
                  `- Between major furniture pieces, and furniture to wall, where not a walkway: at least 18-24 inches\n` +
                  `Beyond these, apply real room-specific judgment - e.g. a kitchen's work triangle, ` +
                  `or 36 inches behind each dining chair for pull-out and passage.\n\n` +
                  `If exact real-world dimensions aren't visible or given above, estimate reasonable ` +
                  `relative proportions instead - never invent precise measurements you can't ` +
                  `actually support.\n\n` +
                  `Respond with ONLY valid JSON, no other text, in exactly this shape:\n` +
                  `{"room_label":"e.g. Kitchen","doors":[{"wall":"top|bottom|left|right",` +
                  `"position_pct":0-100,"width_pct":5-30}],"windows":[{"wall":"...",` +
                  `"position_pct":0-100,"width_pct":5-30}],"furniture":[{"type":"free-form, e.g. ` +
                  `kitchen_island, dining_table, sofa, bed, wardrobe, bookshelf, desk, chair",` +
                  `"label":"short label","x_pct":0-100,"y_pct":0-100,"width_pct":5-40,` +
                  `"depth_pct":5-40,"height_ft":approx real height in feet,"rotation_deg":0|90|180|270}],` +
                  `"notes":"one or two sentences on the arrangement logic and which clearances it respects"}`,
              },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      return NextResponse.json({ error: "The AI analysis request failed." }, { status: 502 });
    }

    const aiData = await aiResp.json();
    const text: string =
      aiData.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not read a layout from this image." }, { status: 502 });
    }

    const layout = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ layout });
  } catch {
    return NextResponse.json({ error: "Something went wrong analyzing this image." }, { status: 500 });
  }
}
