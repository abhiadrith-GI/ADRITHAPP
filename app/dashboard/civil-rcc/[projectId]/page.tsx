import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { ChecklistStage } from "@/types/database";

const STATUS_LABEL: Record<ChecklistStage["status"], string> = {
  locked: "Locked",
  in_progress: "Active",
  submitted: "Submitted",
  approved: "Signed Off",
  rejected: "Rejected",
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
    .select("id, name, location")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  const { data: stagesData } = await supabase
    .from("checklist_stages")
    .select("id, project_id, stage_key, display_name, order_index, status, unlocked_at")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });

  const stages = stagesData as ChecklistStage[] | null;

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Link href="/dashboard/civil-rcc" className="font-mono text-xs text-[var(--adrith-dim-2)]">
        ← Projects
      </Link>

      <h1 className="mb-1 mt-3 text-lg font-bold">{project.name}</h1>
      {project.location && (
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">{project.location}</p>
      )}

      <div className="flex flex-col">
        {(stages ?? []).map((stage, i) => {
          const isLast = i === (stages?.length ?? 0) - 1;
          const clickable = stage.status !== "locked";
          const content = (
            <div className="flex items-center gap-3 pb-5">
              <div className="relative flex flex-col items-center self-stretch">
                <Node status={stage.status} />
                {!isLast && (
                  <span className="mt-1 w-0.5 flex-1 bg-white/20" aria-hidden />
                )}
              </div>
              <div className="flex flex-1 items-center justify-between pt-0.5">
                <span
                  className={`text-sm ${
                    stage.status === "locked" ? "text-[var(--adrith-dim-2)]" : ""
                  }`}
                >
                  {stage.display_name}
                </span>
                <span
                  className={`font-mono text-[10px] uppercase ${
                    stage.status === "approved"
                      ? "text-[var(--adrith-rust)]"
                      : "text-[var(--adrith-dim-2)]"
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
    </main>
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
  return (
    <span className="h-[18px] w-[18px] rounded-full border-2 border-[var(--adrith-rust)]" />
  );
}
