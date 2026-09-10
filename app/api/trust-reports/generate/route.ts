import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You write construction progress updates for a family who often cannot visit the site themselves - many read these from abroad. Your only source of truth is the structured data you're given below; never invent details, dates, or causes that aren't in it.

Rules, all equally important:
- Be plainly honest about anything behind schedule, rejected, or flagged. Naming a real problem clearly, in one sentence, is what actually builds trust - vague positivity is what destroys it the moment someone visits in person and sees the truth for themselves.
- Never bury a real issue inside cheerful language, and never invent a cause for a delay you weren't given a reason for - it's fine to simply say the reason isn't recorded yet.
- Explain construction terms in plain words the first time you use them (e.g., "curing - letting the concrete harden properly before we build on top of it").
- Structure by stage, in construction order. For each stage, say what's done, what's happening now, and what's next - only using the checkpoint statuses and evidence counts you're given.
- Mention how many photos exist as evidence where you have that count, so the family knows real documentation exists, but do not describe what's actually visible in any photo - you were not given the images themselves.
- Keep it warm but not saccharine. A real update from someone who respects the reader's intelligence, not a marketing email.
- 200-350 words. No headers, no bullet points - written prose, like an email from someone who actually knows the project.`;

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "A project is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  if (!membership && !profile?.is_platform_admin) {
    return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });
  }

  const { data: project } = await supabase.from("projects").select("name, location").eq("id", projectId).single();
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { data: stages } = await supabase
    .from("checklist_stages")
    .select("id, display_name, status, floor_number, order_index")
    .eq("project_id", projectId)
    .order("order_index");

  const stageData = [];
  for (const stage of stages ?? []) {
    const { data: checkpoints } = await supabase
      .from("checkpoints")
      .select("id, description, status")
      .eq("stage_id", stage.id)
      .order("order_index");

    const checkpointsWithEvidence = [];
    for (const cp of checkpoints ?? []) {
      const { count } = await supabase
        .from("checkpoint_evidence")
        .select("id", { count: "exact", head: true })
        .eq("checkpoint_id", cp.id);
      checkpointsWithEvidence.push({ description: cp.description, status: cp.status, evidence_photo_count: count ?? 0 });
    }
    stageData.push({ stage: stage.display_name, stage_status: stage.status, checkpoints: checkpointsWithEvidence });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI report generation is not configured yet." }, { status: 503 });
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("trust_reports")
    .insert({ project_id: projectId, generated_by: user.id, status: "pending" })
    .select("id")
    .single();
  if (reservationError || !reservation) {
    const limitHit = reservationError?.message?.includes("already generated");
    return NextResponse.json(
      { error: limitHit ? reservationError!.message : reservationError?.message ?? "Could not start report generation." },
      { status: limitHit ? 429 : 500 }
    );
  }

  try {
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Project: ${project.name}${project.location ? ` (${project.location})` : ""}\n\nStage-by-stage data:\n${JSON.stringify(stageData, null, 2)}`,
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      await supabase.from("trust_reports").delete().eq("id", reservation.id);
      return NextResponse.json({ error: `AI request failed (${aiResp.status}).` }, { status: 502 });
    }

    const data = await aiResp.json();
    const reportText = data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
    if (!reportText) {
      await supabase.from("trust_reports").delete().eq("id", reservation.id);
      return NextResponse.json({ error: "The AI did not return a usable report." }, { status: 502 });
    }

    const { error: updateError } = await supabase
      .from("trust_reports")
      .update({ report_text: reportText, status: "done" })
      .eq("id", reservation.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ id: reservation.id, reportText });
  } catch (err) {
    await supabase.from("trust_reports").delete().eq("id", reservation.id);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 500 });
  }
}
