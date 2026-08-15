import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";

export default async function VastuHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-[var(--adrith-off-white)]">
      <PageBackground src="/backgrounds/vastu.jpg" />
      <div className="relative z-10 mx-auto max-w-md px-5 pb-16 pt-8">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard" className="text-xs text-[var(--adrith-dim-2)]">
          ← Dashboard
        </Link>
        <h1 className="mt-3 text-xl font-semibold">Vastu Consultation</h1>
        <p className="mt-1 text-sm text-[var(--adrith-dim-2)]">
          Open to anyone logged in — no role restriction. General guidance,
          not a guaranteed outcome — see the checker for the full note.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/dashboard/vastu/checker"
            className="rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4"
          >
            <p className="text-sm font-semibold">Direction Checker</p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              Answer a few questions about your rooms, get a scored report with
              real, non-demolition remedies.
            </p>
          </Link>

          <Link
            href="/dashboard/vastu/ask"
            className="rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4"
          >
            <p className="text-sm font-semibold">Ask Vastu</p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              A real conversation — ask anything, share a photo if it helps,
              get grounded answers instead of a fixed questionnaire.
            </p>
          </Link>

          <Link
            href="/dashboard/vastu/library"
            className="rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4"
          >
            <p className="text-sm font-semibold">Guidance Library</p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              Browse room-by-room, construction-phase, and material guidance
              at your own pace — no questionnaire required.
            </p>
          </Link>

          <Link
            href="tel:+917259850990"
            className="rounded-xl border border-[var(--adrith-rust)] p-4"
          >
            <p className="text-sm font-semibold text-[var(--adrith-rust)]">
              Book a Real Consultation
            </p>
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              For a full read on your home, direct from us — the checker is a
              starting point, not a replacement for this.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
