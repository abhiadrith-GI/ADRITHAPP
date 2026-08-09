import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { floorLabel } from "@/types/database";
import { RingBackground } from "@/components/ring-background";
import { FOUNDATION_GROUPS, FLOOR_GROUPS } from "@/lib/quantity/stage-config";

export default async function QuantitiesProjectPage({
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
    .select("floor_number")
    .eq("project_id", projectId);

  const floorNumbers = Array.from(
    new Set((stagesData ?? []).filter((s) => s.floor_number !== null).map((s) => s.floor_number as number))
  ).sort((a, b) => a - b);

  const { data: existingCalcs } = await supabase
    .from("quantity_calculations")
    .select("stage_group_key, floor_number")
    .eq("project_id", projectId);

  const countMap = new Map<string, number>();
  for (const c of existingCalcs ?? []) {
    const k = `${c.stage_group_key}::${c.floor_number ?? "null"}`;
    countMap.set(k, (countMap.get(k) ?? 0) + 1);
  }
  const countFor = (key: string, floor: number | null) => countMap.get(`${key}::${floor ?? "null"}`) ?? 0;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />

      <div className="relative z-10 mx-auto max-w-md">
        <Link href="/dashboard/quantities" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Projects
        </Link>

        <h1 className="mb-1 mt-3 text-lg font-bold">{project.name}</h1>
        {project.location && (
          <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">{project.location}</p>
        )}

        <StageList
          title="Foundation"
          groups={FOUNDATION_GROUPS}
          floor={null}
          projectId={projectId}
          countFor={countFor}
        />

        {floorNumbers.map((floorNum) => (
          <StageList
            key={floorNum}
            title={floorLabel(floorNum)}
            groups={FLOOR_GROUPS}
            floor={floorNum}
            projectId={projectId}
            countFor={countFor}
          />
        ))}
      </div>
    </main>
  );
}

function StageList({
  title,
  groups,
  floor,
  projectId,
  countFor,
}: {
  title: string;
  groups: { key: string; label: string; kind: string }[];
  floor: number | null;
  projectId: string;
  countFor: (key: string, floor: number | null) => number;
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
        {title}
      </p>
      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const count = countFor(g.key, floor);
          const href = `/dashboard/quantities/${projectId}/${g.key}${floor !== null ? `?floor=${floor}` : ""}`;
          return (
            <Link
              key={g.key}
              href={href}
              className="flex items-center justify-between rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
            >
              <span className="text-sm">{g.label}</span>
              <span
                className={`font-mono text-[10px] uppercase ${
                  count > 0 ? "text-[var(--adrith-rust)]" : "text-[var(--adrith-dim-2)]"
                }`}
              >
                {count > 0 ? `${count} calc${count > 1 ? "s" : ""}` : "Not yet"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
