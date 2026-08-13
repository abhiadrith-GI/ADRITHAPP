import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { LandscapingSelectionTool } from "@/components/landscaping-selection-tool";

export default async function LandscapingSelectionPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase.from("projects").select("id, name").eq("id", projectId).single();
  if (!project) notFound();

  const { data: selection } = await supabase
    .from("landscaping_selections")
    .select("id, items, status, created_by")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let invites: { id: string; invited_email: string }[] = [];
  let quotations: { id: string; quote_details: string; created_at: string }[] = [];

  if (selection?.status === "finalized") {
    const [{ data: invitesData }, { data: quotesData }] = await Promise.all([
      supabase.from("landscaping_vendor_invites").select("id, vendor_id, profiles(full_name)").eq("selection_id", selection.id),
      supabase.from("landscaping_quotations").select("id, quote_details, created_at").eq("selection_id", selection.id),
    ]);
    invites = (invitesData ?? []).map((i: { id: string; profiles: { full_name: string }[] | null }) => ({
      id: i.id,
      invited_email: i.profiles?.[0]?.full_name ?? "Vendor",
    }));
    quotations = quotesData ?? [];
  }

  return (
    <LandscapingSelectionTool
      projectId={project.id}
      projectName={project.name}
      userId={user.id}
      initialSelection={selection ?? null}
      initialInvites={invites}
      initialQuotations={quotations}
    />
  );
}
