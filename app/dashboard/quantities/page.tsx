import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Project } from "@/types/database";
import { RingBackground } from "@/components/ring-background";

export default async function QuantitiesHubPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id);

  const memberProjectIds = (memberRows ?? []).map((r) => r.project_id);
  const orFilter =
    memberProjectIds.length > 0
      ? `id.in.(${memberProjectIds.join(",")}),created_by.eq.${user.id}`
      : `created_by.eq.${user.id}`;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, location")
    .or(orFilter)
    .or("created_in_tool.eq.quantities,created_in_tool.is.null")
    .order("created_at", { ascending: false });

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />

      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/dashboard" className="font-mono text-xs text-[var(--adrith-dim-2)]">
            ← Tools
          </Link>
          <span className="font-mono text-xs text-[var(--adrith-rust)]">QUANTITIES</span>
        </div>

        <h1 className="mb-1 text-lg font-bold">RCC Quantity Calculation</h1>
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">
          Real dimensions in, material quantities out — for procurement and
          budgeting. Same projects and stages as Civil &amp; RCC Quality
          Control.
        </p>

        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            Your Projects
          </p>
          <Link
            href="/dashboard/quantities/new"
            className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-rust)]"
          >
            + New Project
          </Link>
        </div>
        {projects && projects.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {(projects as Pick<Project, "id" | "name" | "location">[]).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/quantities/${p.id}`}
                  className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
                >
                  <p className="text-sm font-semibold">{p.name}</p>
                  {p.location && (
                    <p className="mt-0.5 text-xs text-[var(--adrith-dim-2)]">{p.location}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
            No projects yet — start one above.
          </p>
        )}
      </div>
    </main>
  );
}
