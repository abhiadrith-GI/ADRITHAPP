import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";
import { ELECTRICAL_ROOM_TYPES } from "@/lib/materials/electrical-reference";
import { MaterialCalculatorTool } from "@/components/material-calculator-tool";

export default async function ElectricalMaterialsRoomPage({ params }: { params: Promise<{ projectId: string; room: string }> }) {
  const { projectId, room: roomParam } = await params;
  const room = decodeURIComponent(roomParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!ELECTRICAL_ROOM_TYPES.includes(room as (typeof ELECTRICAL_ROOM_TYPES)[number])) notFound();

  const { data: project } = await supabase.from("projects").select("id, name").eq("id", projectId).single();
  if (!project) notFound();

  const { data: lists } = await supabase
    .from("material_lists")
    .select("id, status, created_at, items")
    .eq("project_id", projectId)
    .eq("trade", "electrical")
    .eq("room_type", room)
    .order("created_at", { ascending: false });

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />
      <div className="relative z-10 mx-auto max-w-md">
        <Link href={`/dashboard/plumbing-electrical/electrical-materials/${projectId}`} className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← {project.name}
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">{room}</h1>
        <p className="text-sm text-[var(--adrith-dim-2)]">Electrical materials</p>

        <MaterialCalculatorTool projectId={projectId} trade="electrical" roomType={room} initialLists={lists ?? []} />
      </div>
    </main>
  );
}
