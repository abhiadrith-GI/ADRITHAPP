import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const STATUS_LABELS: Record<string, string> = {
  locked: "Not started",
  in_progress: "In progress",
  submitted: "Submitted for review",
  approved: "Approved",
  rejected: "Rejected",
  not_tracked: "Not tracked",
};
const CHECKPOINT_LABELS: Record<string, string> = { pending: "Pending", pass: "Pass", fail: "Fail", flagged: "Flagged" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
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
    .select("id, display_name, status")
    .eq("project_id", projectId)
    .order("order_index");

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  page.drawText("Civil & RCC Quality Control Report", { x: margin, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 26;
  page.drawText(project.name, { x: margin, y, size: 13, font: bold });
  y -= 16;
  if (project.location) {
    page.drawText(project.location, { x: margin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 14;
  }
  page.drawText(`Generated ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 30;

  for (const stage of stages ?? []) {
    ensureSpace(50);
    page.drawText(stage.display_name, { x: margin, y, size: 13, font: bold });
    page.drawText(STATUS_LABELS[stage.status] ?? stage.status, {
      x: pageWidth - margin - 100,
      y,
      size: 10,
      font,
      color: rgb(0.7, 0.3, 0.1),
    });
    y -= 20;

    const { data: checkpoints } = await supabase
      .from("checkpoints")
      .select("id, description, status")
      .eq("stage_id", stage.id)
      .order("order_index");

    for (const cp of checkpoints ?? []) {
      ensureSpace(20);
      const { count } = await supabase
        .from("checkpoint_evidence")
        .select("id", { count: "exact", head: true })
        .eq("checkpoint_id", cp.id);

      page.drawText(`- ${cp.description}`, { x: margin + 10, y, size: 10, font, maxWidth: pageWidth - 2 * margin - 140 });
      page.drawText(`${CHECKPOINT_LABELS[cp.status] ?? cp.status} (${count ?? 0} photos)`, {
        x: pageWidth - margin - 130,
        y,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 16;
    }
    y -= 14;
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${project.name.replace(/[^a-z0-9]+/gi, "-")}-report.pdf"`,
    },
  });
}
