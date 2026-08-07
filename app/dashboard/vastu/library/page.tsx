import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";
import { ROOM_TYPES, ROOM_RULES } from "@/lib/vastu/rules";
import { ZONE_NAMES, ZONE_THEME } from "@/lib/vastu/zones";
import { GUIDANCE_SECTIONS } from "@/lib/vastu/guidance-content";

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

        {GUIDANCE_SECTIONS.map((section) => (
          <Section key={section.title} title={section.title}>
            {section.paragraphs.map((p, i) => (
              <p key={i} className={i > 0 ? "mt-2" : undefined}>
                {p}
              </p>
            ))}
          </Section>
        ))}

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
