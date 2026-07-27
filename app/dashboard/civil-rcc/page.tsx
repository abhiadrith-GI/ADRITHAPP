import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Project } from "@/types/database";
import { RingBackground } from "@/components/ring-background";

/**
 * "Your Projects" vs "All Platform Projects" are deliberately two separate
 * queries, not one blended list — the same distinction discussed directly:
 * the sites you're actually the engineer on, versus the full register of
 * every site on the platform you happen to have oversight authority over.
 */
export default async function CivilRccPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .single();

  const { data: memberRows } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id);

  const memberProjectIds = (memberRows ?? []).map((r) => r.project_id);
  const orFilter =
    memberProjectIds.length > 0
      ? `id.in.(${memberProjectIds.join(",")}),created_by.eq.${user.id}`
      : `created_by.eq.${user.id}`;

  const { data: yourProjects } = await supabase
    .from("projects")
    .select("id, name, location, created_at, created_by, fee_exempt, requested_start_stage_key, start_stage_pending")
    .or(orFilter)
    .order("created_at", { ascending: false });

  let allProjects: Project[] | null = null;
  if (profile?.is_platform_admin) {
    const { data } = await supabase
      .from("projects")
      .select("id, name, location, created_at, created_by, fee_exempt, requested_start_stage_key, start_stage_pending")
      .order("created_at", { ascending: false });
    allProjects = data;
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />

      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/dashboard" className="font-mono text-xs text-[var(--adrith-dim-2)]">
            ← Tools
          </Link>
          <span className="font-mono text-xs text-[var(--adrith-rust)]">CIVIL &amp; RCC</span>
        </div>

        <ProjectSection title="Your Projects" projects={yourProjects} />

        {profile?.is_platform_admin && (
          <div className="mt-8">
            <ProjectSection title="All Platform Projects" projects={allProjects} />
          </div>
        )}

        <Link
          href="/dashboard/civil-rcc/new"
          className="mt-4 block rounded-xl border border-dashed border-white/25 px-4 py-3 text-center font-mono text-xs text-[var(--adrith-dim-2)]"
        >
          + Start a New Project
        </Link>
      </div>
    </main>
  );
}

function ProjectSection({
  title,
  projects,
}: {
  title: string;
  projects: Project[] | null;
}) {
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
        {title}
      </p>
      {projects && projects.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/civil-rcc/${p.id}`}
                className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
              >
                <p className="text-sm font-semibold">{p.name}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  {p.location && (
                    <p className="text-xs text-[var(--adrith-dim-2)]">{p.location}</p>
                  )}
                  {p.fee_exempt && (
                    <span className="rounded-full border border-[var(--adrith-rust)] px-1.5 py-0.5 text-[9px] text-[var(--adrith-rust)]">
                      Adrith Designs — Free
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
          No projects yet.
        </p>
      )}
    </div>
  );
}
