import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";

export default async function IsometricViewHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-[var(--adrith-off-white)]">
      <PageBackground src="/backgrounds/isometric-view.jpg" />
      <div className="relative z-10 mx-auto max-w-md px-5 pb-16 pt-8">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard" className="text-xs text-[var(--adrith-dim-2)]">
          ← Dashboard
        </Link>
        <h1 className="mt-3 text-xl font-semibold">Isometric View</h1>
        <p className="mt-1 text-sm text-[var(--adrith-dim-2)]">
          Open to anyone logged in — no role restriction.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/dashboard/isometric-view/top-view"
            className="rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4"
          >
            <p className="text-sm font-semibold">Top View</p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              Pick a floor from a CAD-exported PDF, get a clear 3D view of it. 5 per day.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
