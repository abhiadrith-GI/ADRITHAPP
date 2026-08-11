import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";
import { ELECTRICAL_ROOM_TYPES } from "@/lib/materials/electrical-reference";

export default async function ElectricalMaterialsRoomPickerPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase.from("projects").select("id, name").eq("id", projectId).single();
  if (!project) notFound();

  const { data: lists } = await supabase
    .from("material_lists")
    .select("room_type, status")
    .eq("project_id", projectId)
    .eq("trade", "electrical");

  const countFor = (room: string) => (lists ?? []).filter((l) => l.room_type === room).length;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />
      <div className="relative z-10 mx-auto max-w-md">
        <Link href="/dashboard/plumbing-electrical/electrical-materials" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Projects
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">{project.name}</h1>
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">Which room?</p>

        <div className="flex flex-col gap-2">
          {ELECTRICAL_ROOM_TYPES.map((room) => {
            const count = countFor(room);
            return (
              <Link
                key={room}
                href={`/dashboard/plumbing-electrical/electrical-materials/${projectId}/${encodeURIComponent(room)}`}
                className="flex items-center justify-between rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
              >
                <span className="text-sm">{room}</span>
                <span className={`font-mono text-[10px] uppercase ${count > 0 ? "text-[var(--adrith-rust)]" : "text-[var(--adrith-dim-2)]"}`}>
                  {count > 0 ? `${count} list${count > 1 ? "s" : ""}` : "Not yet"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
