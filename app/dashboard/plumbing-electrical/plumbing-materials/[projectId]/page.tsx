import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { PLUMBING_ROOM_TYPES } from "@/lib/materials/plumbing-reference";

export default async function PlumbingMaterialsRoomPickerPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase.from("projects").select("id, name, created_by").eq("id", projectId).single();
  if (!project) notFound();

  const { data: lists } = await supabase
    .from("material_lists")
    .select("room_type, status")
    .eq("project_id", projectId)
    .eq("trade", "plumbing");

  // Same rule as Civil & RCC's own delete button - blocked entirely, no
  // override, once any stage on this project has been confirmed. Checked
  // here too since a project reached from this tool can still have real
  // QC sign-offs against it.
  const { data: stages } = await supabase.from("checklist_stages").select("status").eq("project_id", projectId);
  const hasAnySignOff = (stages ?? []).some((s) => s.status === "approved");

  const countFor = (room: string) => (lists ?? []).filter((l) => l.room_type === room).length;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/plumbing-electrical.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <Link href="/dashboard/plumbing-electrical/plumbing-materials" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Projects
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">{project.name}</h1>
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">
          Which room? Plumbing only has real content in wet rooms — a bedroom or hall genuinely has nothing to calculate here.
        </p>

        <div className="flex flex-col gap-2">
          {PLUMBING_ROOM_TYPES.map((room) => {
            const count = countFor(room);
            return (
              <Link
                key={room}
                href={`/dashboard/plumbing-electrical/plumbing-materials/${projectId}/${encodeURIComponent(room)}`}
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

        {project.created_by === user.id && (
          <DeleteProjectButton
            projectId={project.id}
            projectName={project.name}
            hasAnySignOff={hasAnySignOff}
            redirectTo="/dashboard/plumbing-electrical/plumbing-materials"
          />
        )}
      </div>
    </main>
  );
}
