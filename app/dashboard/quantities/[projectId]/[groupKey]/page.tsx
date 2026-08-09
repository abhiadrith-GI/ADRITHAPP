import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";
import { findGroup } from "@/lib/quantity/stage-config";
import { QuantityCalcTool } from "./quantity-calc-tool";

export default async function QuantityCalcPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; groupKey: string }>;
  searchParams: Promise<{ floor?: string }>;
}) {
  const { projectId, groupKey } = await params;
  const { floor: floorParam } = await searchParams;
  const floor = floorParam !== undefined ? parseInt(floorParam, 10) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();
  if (!project) notFound();

  const group = findGroup(groupKey, floor);
  if (!group) notFound();

  const { data: history } = await supabase
    .from("quantity_calculations")
    .select("id, inputs, outputs, photo_storage_path, created_at")
    .eq("project_id", projectId)
    .eq("stage_group_key", groupKey)
    .eq("floor_number", floor)
    .order("created_at", { ascending: false });

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />

      <div className="relative z-10 mx-auto max-w-md">
        <Link href={`/dashboard/quantities/${projectId}`} className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← {project.name}
        </Link>

        <h1 className="mb-1 mt-3 text-lg font-bold">
          {group.label}
          {floor !== null && (floor === 0 ? " — Ground Floor" : ` — ${floor === 1 ? "1st" : floor === 2 ? "2nd" : floor === 3 ? "3rd" : `${floor}th`} Floor`)}
        </h1>

        <QuantityCalcTool
          projectId={projectId}
          groupKey={groupKey}
          stageLabel={group.label}
          floor={floor}
          group={group}
          history={history ?? []}
        />
      </div>
    </main>
  );
}
