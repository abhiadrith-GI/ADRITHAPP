import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";

export default async function TrustReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase.from("project_members").select("project_id").eq("user_id", user.id);
  const projectIds = (memberships ?? []).map((m) => m.project_id);

  let projects: { id: string; name: string; location: string | null }[] = [];
  if (projectIds.length > 0) {
    const { data: stagedProjectIds } = await supabase.from("checklist_stages").select("project_id").in("project_id", projectIds);
    const trackedIds = Array.from(new Set((stagedProjectIds ?? []).map((s) => s.project_id)));
    if (trackedIds.length > 0) {
      const { data } = await supabase.from("projects").select("id, name, location").in("id", trackedIds).order("name");
      projects = data ?? [];
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/civil-rcc.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Dashboard
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">Trust Reports</h1>
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">
          Honest, plain-language progress updates generated from your project's real Civil &amp; RCC checklist data — for
          checking in from anywhere, on your own schedule.
        </p>

        {projects.length > 0 ? (
          <div className="flex flex-col gap-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/trust-reports/${p.id}`}
                className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
              >
                <p className="text-sm font-semibold">{p.name}</p>
                {p.location && <p className="mt-0.5 text-xs text-[var(--adrith-dim-2)]">{p.location}</p>}
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
            No eligible projects yet — a project needs Civil &amp; RCC checklist tracking started before a report can be
            generated for it.
          </p>
        )}
      </div>
    </main>
  );
}
