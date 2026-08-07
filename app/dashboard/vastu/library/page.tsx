import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";
import { ROOM_TYPES, ROOM_RULES } from "@/lib/vastu/rules";
import { ZONE_NAMES, ZONE_THEME } from "@/lib/vastu/zones";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--adrith-rust)]">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-[var(--adrith-off-white)]">{children}</div>
    </section>
  );
}

export default async function VastuLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-[var(--adrith-off-white)]">
      <RingBackground cyPercent={0} />
      <div className="relative z-10 mx-auto max-w-md px-5 pb-16 pt-8">
        <Link href="/dashboard/vastu" className="text-xs text-[var(--adrith-dim-2)]">
          ← Vastu Consultation
        </Link>
        <h1 className="mt-3 text-xl font-semibold">Guidance Library</h1>
        <p className="mt-1 text-xs leading-relaxed text-[var(--adrith-dim-2)]">
          General Vastu guidance — a tradition, not a guaranteed outcome.
          Where a tip has a real, checkable reason behind it, we&apos;ve said
          so plainly. Where it&apos;s tradition without that backing, we&apos;ve
          said that too.
        </p>

        <Section title="Room by room">
          <div className="flex flex-col gap-3">
            {ROOM_TYPES.map((room) => {
              const r = ROOM_RULES[room];
              return (
                <div key={room} className="rounded-lg border border-white/10 p-3">
                  <p className="font-semibold">{r.label}</p>
                  <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
                    Ideal: {r.ideal.join(", ")}
                    {r.acceptable.length > 0 && ` · Acceptable: ${r.acceptable.join(", ")}`}
                    {r.avoid.length > 0 && ` · Avoid: ${r.avoid.map((a) => a.zone).join(", ")}`}
                  </p>
                  {r.realReason && <p className="mt-1.5 text-xs">{r.realReason}</p>}
                  <p className="mt-1.5 text-xs">
                    <span className="text-[var(--adrith-rust)]">If it isn&apos;t: </span>
                    {r.remedy}
                  </p>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="The sixteen directions">
          <p className="text-xs text-[var(--adrith-dim-2)]">
            Each of the 8 main directions splits into two finer zones — the
            checker works these out for you automatically.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {ZONE_NAMES.map((z) => (
              <div key={z} className="rounded-lg border border-white/10 px-2.5 py-2">
                <p className="text-xs font-semibold">{z}</p>
                <p className="text-[11px] text-[var(--adrith-dim-2)]">{ZONE_THEME[z]}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="A note for flats and apartments">
          Most homes we work on are flats, not standalone houses — worth
          addressing honestly. The mainstream view is that Vastu still
          applies inside a flat: you can&apos;t change the building&apos;s
          overall orientation, but your own kitchen, bedroom, and entrance
          placement, plus non-structural remedies like color, still count. A
          smaller number of practitioners argue the logic weakens somewhat in
          an apartment, since much of the reasoning assumes open sun and air
          on most sides. We lean toward the mainstream view, but it&apos;s
          worth knowing this isn&apos;t unanimous.
        </Section>

        <Section title="Building and construction">
          <p>
            <strong>Before ground is broken:</strong> a Bhoomi Pujan is
            traditional before excavation, timed against an auspicious date
            rather than picked at random. We can coordinate this as part of
            your project timeline.
          </p>
          <p className="mt-2">
            <strong>Shape and height:</strong> square or rectangular plots are
            favored; an odd number of floors is traditional; keep height in
            proportion with the surrounding neighborhood.
          </p>
          <p className="mt-2">
            <strong>The Southwest is traditionally built heavier</strong> —
            and there&apos;s a real reason behind part of this: in our
            climate, a taller Southwest genuinely shades the rest of the home
            from harsh afternoon sun.
          </p>
          <p className="mt-2">
            <strong>One tip that&apos;s pure practicality, not tradition:</strong>{" "}
            avoid a ceiling beam directly above a bed or sofa.
          </p>
          <p className="mt-2">
            <strong>Materials:</strong> wood — teak especially — is the
            traditional, preferred choice for doors and windows, and solid
            wood is favored over plastic or heavily processed materials
            generally.
          </p>
        </Section>

        <Section title="Water, sanitary, and electrical">
          <p>Overhead water tank: Southwest, elevated. Underground tank or borewell: Northeast or North.</p>
          <p className="mt-2">
            Septic tank: Northwest is standard. Two practical rules regardless
            of direction — at least 15 feet from any well or water tank, and
            never directly in front of the main entrance.
          </p>
          <p className="mt-2">
            Electrical (meter, inverter, generator): Southeast is standard,
            Northwest as a second choice — though a plain light switch is
            better placed wherever&apos;s safest to find in the dark than
            moved purely to satisfy the rule.
          </p>
        </Section>

        <Section title="Gardens">
          <p>
            Keep the Northeast light and open — lawn or small shrubs only.
            Holy basil does well in the North, Northeast, or East, or right
            by the entrance. Avoid planting a tree directly in front of the
            main entrance.
          </p>
          <p className="mt-2">
            One note that isn&apos;t just tradition: the Peepal tree is
            sacred and never cut, but its roots spread far enough to
            genuinely threaten a foundation — best kept well away from the
            house itself regardless.
          </p>
        </Section>

        <Section title="Where tradition meets real science">
          <p>
            Some of this has genuine, checkable backing: East-facing rooms
            really do get gentler morning light. A heavier Southwest really
            does provide real shade in our climate. That&apos;s not a
            coincidence — Vastu&apos;s origins are genuinely tied to real
            climate observation.
          </p>
          <p className="mt-2">
            Some of it is tradition without that same backing — the
            associations between a direction and your finances or
            relationships don&apos;t have a demonstrated physical mechanism
            the way sunlight does, and credentialed scientists have said so
            publicly. Both are worth knowing. They&apos;re just not the same
            kind of claim, and we won&apos;t pretend otherwise.
          </p>
        </Section>

        <div className="mt-8 rounded-xl border border-white/15 bg-[var(--adrith-card)] p-4">
          <p className="text-xs leading-relaxed text-[var(--adrith-dim-2)]">
            Every tip here is a starting point for a conversation with us —
            not a final verdict on your home. Most placements that
            aren&apos;t ideal have a workable remedy that doesn&apos;t
            involve demolition. Talk to us before changing anything.
          </p>
        </div>
      </div>
    </main>
  );
}
