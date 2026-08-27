import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";

const BASES = [
  {
    name: "RCC Materials Supply",
    description: "Cement, sand, gelly, steel, bricks & the small materials RCC/brick/plaster work needs",
    href: "/dashboard/homecare/rcc-materials",
    open: true,
  },
  {
    name: "Finishing Material Supply",
    description: "Paints, doors & windows, glass, tiles, stainless steel, plumbing & electrical fixtures",
    href: "/dashboard/homecare/finishing-materials",
    open: true,
  },
  {
    name: "Finished House Services",
    description: "Plumbing, electrical, waterproofing, painting, masonry, carpentry, pest control, deep cleaning",
    href: "/dashboard/homecare/finished-house-services",
    open: true,
  },
];

export default async function HomeCarePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/homecare.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Dashboard
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">HomeCare</h1>
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">
          Materials, labour, and maintenance — one platform across the whole life of a house. Starting with materials.
        </p>

        <div className="flex flex-col gap-2.5">
          {BASES.map((b) =>
            b.open ? (
              <Link
                key={b.name}
                href={b.href}
                className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{b.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-rust)]">Open →</span>
                </div>
                <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{b.description}</p>
              </Link>
            ) : (
              <div
                key={b.name}
                className="rounded-xl border border-dashed border-white/15 px-4 py-3.5 opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{b.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-dim-2)]">Soon</span>
                </div>
                <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{b.description}</p>
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}
