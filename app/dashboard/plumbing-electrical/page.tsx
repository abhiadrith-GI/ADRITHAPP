import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";

export default async function PlumbingElectricalHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-[var(--adrith-off-white)]">
      <RingBackground cyPercent={0} />
      <div className="relative z-10 mx-auto max-w-md px-5 pb-16 pt-8">
        <Link href="/dashboard" className="text-xs text-[var(--adrith-dim-2)]">
          ← Tools
        </Link>
        <h1 className="mt-3 text-xl font-semibold">Plumbing &amp; Electrical</h1>
        <p className="mt-1 text-sm text-[var(--adrith-dim-2)]">
          All four bases are open now — standard heights, and material
          calculators for both trades, categorized room by room.
        </p>

        <p className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--adrith-dim)]">
          Standard heights
        </p>
        <div className="flex flex-col gap-2.5">
          <Link
            href="/dashboard/plumbing-electrical/standard-heights?trade=plumbing"
            className="rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4"
          >
            <p className="text-sm font-semibold">Plumbing Standard Heights</p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              Every fixture height, room by room — searchable, mm and inches together.
            </p>
          </Link>
          <Link
            href="/dashboard/plumbing-electrical/standard-heights?trade=electrical"
            className="rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4"
          >
            <p className="text-sm font-semibold">Electrical Standard Heights</p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              Switch, socket, and point heights — including real safety clearances.
            </p>
          </Link>
        </div>

        <p className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--adrith-dim)]">
          Material calculators
        </p>
        <div className="flex flex-col gap-2.5">
          <Link
            href="/dashboard/plumbing-electrical/plumbing-materials"
            className="rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4"
          >
            <p className="text-sm font-semibold">Plumbing Material Calculator</p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              Upload a photo, plan, or description of a wet room — get a
              real material list, no rates, editable until you finalize it.
            </p>
          </Link>
          <Link
            href="/dashboard/plumbing-electrical/electrical-materials"
            className="rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4"
          >
            <p className="text-sm font-semibold">Electrical Material Calculator</p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              Same principle, every room — wires, points, and fittings by
              what each space actually needs.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}

