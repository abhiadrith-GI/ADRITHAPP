import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import StageClient from "./stage-client";

export default async function StagePage({
  params,
}: {
  params: Promise<{ projectId: string; stageKey: string }>;
}) {
  const { projectId, stageKey } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();
  if (!project) notFound();

  const { data: stage } = await supabase
    .from("checklist_stages")
    .select("id, project_id, stage_key, display_name, order_index, status, unlocked_at, floor_number")
    .eq("project_id", projectId)
    .eq("stage_key", stageKey)
    .single();
  if (!stage) notFound();

  const { data: checkpoints } = await supabase
    .from("checkpoints")
    .select("id, stage_id, description, standard_reference, status, order_index")
    .eq("stage_id", stage.id)
    .order("order_index", { ascending: true });

  const checkpointIds = (checkpoints ?? []).map((c) => c.id);
  const { data: evidence } = checkpointIds.length
    ? await supabase
        .from("checkpoint_evidence")
        .select("id, checkpoint_id, storage_path, uploaded_by, uploaded_at, device_metadata")
        .in("checkpoint_id", checkpointIds)
        .order("uploaded_at", { ascending: true })
    : { data: [] };

  const { data: signOff } = await supabase
    .from("sign_offs")
    .select("id, confirmation_text, signed_at, role_at_signing")
    .eq("stage_id", stage.id)
    .maybeSingle();

  // Can this person sign off this stage? Only the project's nominated
  // designer (engineer or architect), matching the authority already
  // established for the group/chat feature — sign-off authority and group
  // admin are the same person, on purpose.
  const { data: membership } = await supabase
    .from("project_members")
    .select("is_project_designer, role_on_project")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <StageClient
      projectId={projectId}
      projectName={project.name}
      stage={stage}
      checkpoints={checkpoints ?? []}
      evidence={evidence ?? []}
      existingSignOff={signOff ?? null}
      canSignOff={Boolean(membership?.is_project_designer)}
      currentUserId={user.id}
      currentUserRole={profile?.role ?? "owner"}
    />
  );
}
