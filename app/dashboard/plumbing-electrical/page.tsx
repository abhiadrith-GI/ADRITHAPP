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
          Standard installation heights are open now. Material lists and
          quotations are fully specified and still to come.
        </p>

        <p className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--adrith-dim)]">
          Open now
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
          Specified, not yet open
        </p>
        <div className="flex flex-col gap-2.5">
          <div className="rounded-xl border border-white/10 bg-[var(--adrith-card)]/50 p-4">
            <p className="text-sm font-semibold text-[var(--adrith-dim-2)]">
              Plumbing Material Calculator
            </p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              A real material specification list — pipe sizes, fixture counts,
              fittings — for procurement and shop quotations. Fully designed:
              no rates ever, editable until you finalize it, then permanently
              locked. Waiting on its own dedicated research pass before any
              number in it can be trusted, the same standard the heights
              above already got.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[var(--adrith-card)]/50 p-4">
            <p className="text-sm font-semibold text-[var(--adrith-dim-2)]">
              Electrical Material Calculator
            </p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              Same principle, extended to wires, switches, and lighting.
              Also waiting on that same dedicated research pass.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
