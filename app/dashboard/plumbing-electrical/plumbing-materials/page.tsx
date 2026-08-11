import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";

export default async function PlumbingMaterialsProjectPickerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase.from("project_members").select("project_id").eq("user_id", user.id);
  const memberProjectIds = (memberRows ?? []).map((r) => r.project_id);
  const orFilter = memberProjectIds.length > 0 ? `id.in.(${memberProjectIds.join(",")}),created_by.eq.${user.id}` : `created_by.eq.${user.id}`;

  const { data: projects } = await supabase.from("projects").select("id, name, location").or(orFilter).order("created_at", { ascending: false });

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />
      <div className="relative z-10 mx-auto max-w-md">
        <Link href="/dashboard/plumbing-electrical" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Plumbing &amp; Electrical
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">Plumbing Material Calculator</h1>
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">Pick a project to start.</p>

        {projects && projects.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/plumbing-electrical/plumbing-materials/${p.id}`} className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3">
                  <p className="text-sm font-semibold">{p.name}</p>
                  {p.location && <p className="mt-0.5 text-xs text-[var(--adrith-dim-2)]">{p.location}</p>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
            No projects yet — start one from Civil &amp; RCC first.
          </p>
        )}
      </div>
    </main>
  );
}
