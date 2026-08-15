import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";
import { LandscapingCatalogSearch } from "@/components/landscaping-catalog-search";

export default async function LandscapingGardeningPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase.from("project_members").select("project_id").eq("user_id", user.id);
  const memberProjectIds = (memberRows ?? []).map((r) => r.project_id);
  const orFilter =
    memberProjectIds.length > 0
      ? `id.in.(${memberProjectIds.join(",")}),created_by.eq.${user.id}`
      : `created_by.eq.${user.id}`;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, location")
    .or(orFilter)
    .or("created_in_tool.eq.landscaping_gardening,created_in_tool.is.null")
    .order("created_at", { ascending: false });

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/landscaping-gardening.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Dashboard
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">Landscaping &amp; Gardening</h1>
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">
          Browse plants, lawns &amp; garden styles below. Pick items for a project and connect with a real vendor to buy — same as the Material Calculators.
        </p>

        <a
          href="tel:+917259850990"
          className="mb-6 block rounded-xl border border-[var(--adrith-rust)] bg-[var(--adrith-card)] px-4 py-3 text-center text-sm font-semibold text-[var(--adrith-rust)]"
        >
          Design consultation — call +91 72598 50990
        </a>

        <LandscapingCatalogSearch />

        <div className="mt-6 border-t border-white/10 pt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
              Your Selections
            </p>
            <Link
              href="/dashboard/landscaping-gardening/new"
              className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-rust)]"
            >
              + New Project
            </Link>
          </div>

          {projects && projects.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/landscaping-gardening/${p.id}`}
                    className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
                  >
                    <p className="text-sm font-semibold">{p.name}</p>
                    {p.location && <p className="mt-0.5 text-xs text-[var(--adrith-dim-2)]">{p.location}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
              No projects yet — start one above to pick items and connect with a vendor.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
