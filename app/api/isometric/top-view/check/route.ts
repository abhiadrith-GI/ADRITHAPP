import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Looks at the text actually extracted from a confirmed-vector floor plan
 * PDF and flags anything that looks genuinely missing or unclear before
 * generation - room labels, dimensions, a scale reference. This is a
 * plain-language completeness check on what's readable in the plan, not
 * an architectural review — it never blocks generation, only surfaces
 * something worth a second look. If the AI call fails for any reason,
 * this fails open (no questions) rather than blocking the tool.
 */
export async function POST(req: NextRequest) {
  const { textSummary, vectorPathOps, textItemCount } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ questions: [] });
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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content:
              `This is the text extracted from a CAD floor plan PDF (${vectorPathOps} vector ` +
              `line/shape elements, ${textItemCount} text items found). Extracted text: ` +
              `"${textSummary.slice(0, 2000)}"\n\n` +
              `In plain language, list up to 3 short questions ONLY if something genuinely ` +
              `seems missing or unclear from what's readable here - for example, no room ` +
              `labels found at all, or no dimensions/scale reference found at all. Do not ` +
              `invent problems or comment on design quality. If nothing seems genuinely ` +
              `missing, respond with exactly: NONE\n\n` +
              `Respond with either NONE, or a numbered list of up to 3 short questions, ` +
              `nothing else.`,
          },
        ],
      }),
    });

    if (!aiResp.ok) return NextResponse.json({ questions: [] });

    const aiData = await aiResp.json();
    const text: string =
      aiData.content?.find((b: { type: string }) => b.type === "text")?.text?.trim() ?? "NONE";

    if (text === "NONE" || !text) {
      return NextResponse.json({ questions: [] });
    }

    const questions = text
      .split("\n")
      .map((line: string) => line.replace(/^\d+[.)]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    return NextResponse.json({ questions });
  } catch {
    return NextResponse.json({ questions: [] });
  }
}
