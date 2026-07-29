import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { buildStartingStageOptions, floorLabel, type ChecklistStage } from "@/types/database";
import { RingBackground } from "@/components/ring-background";
import { PendingStartBanner } from "@/components/pending-start-banner";
import { AddMemberForm } from "@/components/add-member-form";
import { AddNextFloorButton } from "@/components/add-next-floor-button";
import { DeleteProjectButton } from "@/components/delete-project-button";

const STATUS_LABEL: Record<ChecklistStage["status"], string> = {
  locked: "Locked",
  in_progress: "Active",
  submitted: "Submitted",
  approved: "Signed Off",
  rejected: "Rejected",
  not_tracked: "Not Tracked",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, location, created_by, requested_start_stage_key, start_stage_pending, requested_floor_count")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  const { data: stagesData } = await supabase
    .from("checklist_stages")
    .select("id, project_id, stage_key, display_name, order_index, status, unlocked_at, floor_number")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });

  const stages = (stagesData as ChecklistStage[] | null) ?? [];

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("project_members")
      .select("is_project_designer")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single(),
  ]);
  const isDesignerOrAdmin = Boolean(membership?.is_project_designer) || Boolean(profile?.is_platform_admin);

  const requestedStageName =
    buildStartingStageOptions(project.requested_floor_count ?? 0).find(
      (s) => s.key === project.requested_start_stage_key
    )?.label ?? project.requested_start_stage_key ?? "";

  // Foundation (floor_number null) first, then each floor's stages grouped
  // together in order, matching how the whole thing is actually built.
  const foundationStages = stages.filter((s) => s.floor_number === null);
  const floorNumbers = Array.from(
    new Set(stages.filter((s) => s.floor_number !== null).map((s) => s.floor_number as number))
  ).sort((a, b) => a - b);

  const topFloor = floorNumbers.length > 0 ? floorNumbers[floorNumbers.length - 1] : null;
  const topFloorSlabBeam = stages.find(
    (s) => s.floor_number === topFloor && s.stage_key.endsWith("_slab_beam")
  );
  const canAddNextFloor = topFloorSlabBeam?.status === "approved";
  const hasAnySignOff = stages.some((s) => s.status === "approved");

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />

      <div className="relative z-10 mx-auto max-w-md">
        <Link href="/dashboard/civil-rcc" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Projects
        </Link>

        <h1 className="mb-1 mt-3 text-lg font-bold">{project.name}</h1>
        {project.location && (
          <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">{project.location}</p>
        )}

        {project.start_stage_pending && (
          <PendingStartBanner
            projectId={project.id}
            requestedStageName={requestedStageName}
            canApprove={isDesignerOrAdmin}
          />
        )}

        {foundationStages.length > 0 && (
          <StageGroup title="Foundation" stages={foundationStages} projectId={projectId} />
        )}

        {floorNumbers.map((floorNum) => (
          <StageGroup
            key={floorNum}
            title={floorLabel(floorNum)}
            stages={stages.filter((s) => s.floor_number === floorNum)}
            projectId={projectId}
          />
        ))}

        {topFloor !== null && (
          <AddNextFloorButton
            projectId={project.id}
            nextFloorLabel={floorLabel(topFloor + 1)}
            canAdd={isDesignerOrAdmin}
            readyToAdd={canAddNextFloor}
          />
        )}

        <div className="mt-10 border-t border-white/10 pt-6">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            Members
          </p>
          {project.created_by === user.id ? (
            <AddMemberForm projectId={project.id} />
          ) : (
            <p className="text-xs text-[var(--adrith-dim-2)]">
              Only this project&apos;s creator can add members.
            </p>
          )}
        </div>

        {project.created_by === user.id && (
          <DeleteProjectButton
            projectId={project.id}
            projectName={project.name}
            hasAnySignOff={hasAnySignOff}
          />
        )}
      </div>
    </main>
  );
}

function StageGroup({
  title,
  stages,
  projectId,
}: {
  title: string;
  stages: ChecklistStage[];
  projectId: string;
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
        {title}
      </p>
      <div className="flex flex-col">
        {stages.map((stage, i) => {
          const isLast = i === stages.length - 1;
          const clickable = stage.status !== "locked" && stage.status !== "not_tracked";
          const content = (
            <div className="flex items-center gap-3 pb-5">
              <div className="relative flex flex-col items-center self-stretch">
                <Node status={stage.status} />
                {!isLast && <span className="mt-1 w-0.5 flex-1 bg-white/20" aria-hidden />}
              </div>
              <div className="flex flex-1 items-center justify-between pt-0.5">
                <span
                  className={`text-sm ${
                    stage.status === "locked" || stage.status === "not_tracked"
                      ? "text-[var(--adrith-dim-2)]"
                      : ""
                  }`}
                >
                  {stage.display_name.includes("—")
                    ? stage.display_name.split("—")[1].trim()
                    : stage.display_name}
                </span>
                <span
                  className={`font-mono text-[10px] uppercase ${
                    stage.status === "approved" ? "text-[var(--adrith-rust)]" : "text-[var(--adrith-dim-2)]"
                  }`}
                >
                  {STATUS_LABEL[stage.status]}
                </span>
              </div>
            </div>
          );

          return clickable ? (
            <Link key={stage.id} href={`/dashboard/civil-rcc/${projectId}/${stage.stage_key}`}>
              {content}
            </Link>
          ) : (
            <div key={stage.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

function Node({ status }: { status: ChecklistStage["status"] }) {
  if (status === "approved") {
    return <span className="h-[18px] w-[18px] rounded-full bg-[var(--adrith-rust)]" />;
  }
  if (status === "locked") {
    return (
      <span className="h-[18px] w-[18px] rounded-full border-2 border-dashed border-white/30" />
    );
  }
  if (status === "not_tracked") {
    return <span className="h-[18px] w-[18px] rounded-full border border-white/15 bg-white/10" />;
  }
  return (
    <span className="h-[18px] w-[18px] rounded-full border-2 border-[var(--adrith-rust)]" />
  );
}
