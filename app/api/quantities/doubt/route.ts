import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildQuantityDoubtSystemPrompt } from "@/lib/quantity/grounding";

export async function POST(req: NextRequest) {
  const { projectId, stageGroupKey, stageLabel, question } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!question || typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });
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
        system: buildQuantityDoubtSystemPrompt(stageLabel ?? stageGroupKey, stageGroupKey),
        messages: [{ role: "user", content: question.trim() }],
      }),
    });

    if (!aiResp.ok) {
      let detail = "";
      try {
        const errBody = await aiResp.json();
        detail = errBody?.error?.message ?? "";
      } catch {}
      return NextResponse.json({ error: `AI request failed (${aiResp.status}).${detail ? " " + detail : ""}` }, { status: 502 });
    }

    const aiData = await aiResp.json();
    const answer: string = aiData.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";

    // Insert AFTER a successful AI call - the rate-limit trigger checks
    // this table, so a failed AI call never costs someone one of their
    // daily questions. Same fairness principle as everywhere else.
    const { error: insertError } = await supabase.from("quantity_doubt_messages").insert({
      user_id: user.id,
      project_id: projectId,
      stage_group_key: stageGroupKey,
      question: question.trim(),
      answer,
    });

    if (insertError) {
      const limitHit = insertError.message?.includes("Daily question limit");
      return NextResponse.json(
        { error: limitHit ? "Daily question limit reached - please try again tomorrow." : "Got an answer but could not save it.", answer: limitHit ? undefined : answer },
        { status: limitHit ? 429 : 500 }
      );
    }

    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 500 });
  }
}
