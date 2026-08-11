import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./logout-button";
import { AdrithLogo } from "@/components/adrith-logo";
import { RingBackground } from "@/components/ring-background";
import { ToolIcon, type ToolIconName } from "@/components/tool-icons";

type Tool = {
  name: string;
  description: string;
  icon: ToolIconName;
  href: string;
  status: "open" | "soon";
};

// Order and status as last confirmed. Civil & RCC, Isometric View, and
// Vastu Consultation's direction checker now have real, working flows
// behind them — everything else is fully specified but not yet built, and
// says so honestly rather than pretending otherwise. Vastu's PDF/photo
// input path is a deliberate next addition, not built yet — the
// questionnaire path works standalone in the meantime.
const TOOLS: Tool[] = [
  {
    name: "Isometric View",
    description: "Exact top view from CAD, turned into a clear 3D view",
    icon: "isometric",
    href: "/dashboard/isometric-view",
    status: "open",
  },
  {
    name: "Vastu Consultation",
    description: "Direction & practical guidance",
    icon: "vastu",
    href: "/dashboard/vastu",
    status: "open",
  },
  {
    name: "Civil & RCC Quality Control",
    description: "Foundation to finishing, stage by stage",
    icon: "checklist",
    href: "/dashboard/civil-rcc",
    status: "open",
  },
  {
    name: "RCC Quantity Calculation",
    description: "Material quantities for the same real projects and stages",
    icon: "calculator",
    href: "/dashboard/quantities",
    status: "open",
  },
  {
    name: "Plumbing & Electrical",
    description: "Standard heights now open; material lists coming",
    icon: "droplet",
    href: "/dashboard/plumbing-electrical",
    status: "open",
  },
  {
    name: "Color & Flooring",
    description: "Palettes, finishes & flooring options",
    icon: "paint",
    href: "/dashboard/color-flooring",
    status: "soon",
  },
  {
    name: "Completed Projects",
    description: "Portfolio showcase, browsable by everyone",
    icon: "building",
    href: "/dashboard/completed-projects",
    status: "soon",
  },
];

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />

      <div className="relative z-10 mx-auto flex max-w-md items-center justify-between">
        <div className="flex items-center gap-2">
          <AdrithLogo className="h-6 w-6" />
          <span className="text-sm font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <div className="flex items-center gap-3">
          {profile?.role !== "shop_owner" && (
            <Link href="/dashboard/firm" className="text-xs text-[var(--adrith-dim-2)]">
              Firm
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>

      <p className="relative z-10 mx-auto mt-1 max-w-md text-xs text-[var(--adrith-dim-2)]">
        {profile?.full_name} · <span className="capitalize">{profile?.role}</span>
        {profile?.is_platform_admin && (
          <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">
            Platform Admin
          </span>
        )}
        {profile?.role !== "owner" &&
          profile?.role !== "student" &&
          !profile?.is_platform_admin &&
          !profile?.license_verified && (
            <span className="ml-2 rounded-full border border-[var(--adrith-rust)] px-2 py-0.5 text-[10px] text-[var(--adrith-rust)]">
              License not yet verified
            </span>
          )}
        {profile?.role !== "shop_owner" && !profile?.firm_id && (
          <Link
            href="/dashboard/firm"
            className="ml-2 rounded-full border border-[var(--adrith-rust)] px-2 py-0.5 text-[10px] text-[var(--adrith-rust)]"
          >
            Set up your firm →
          </Link>
        )}
      </p>

      <div className="relative z-10 mx-auto mt-6 max-w-md">
        <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
          <span>Your Tools</span>
          <span>{TOOLS.length} tools</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {TOOLS.map((tool) => (
            <Link
              key={tool.name}
              href={tool.status === "open" ? tool.href : "#"}
              aria-disabled={tool.status !== "open"}
              className={`flex min-h-[104px] flex-col gap-2 rounded-2xl border-[2.2px] border-white/20 bg-[var(--adrith-card)] p-3 ${
                tool.status !== "open" ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border-[2.2px] border-white/25 bg-black">
                <ToolIcon name={tool.icon} className="h-[56%] w-[56%]" />
              </div>
              <span
                className={`font-mono text-[10px] uppercase tracking-wide ${
                  tool.status === "open" ? "text-[var(--adrith-rust)]" : "text-[var(--adrith-dim-2)]"
                }`}
              >
                {tool.status === "open" ? "Open →" : "Soon"}
              </span>
              <span className="mt-auto text-[11px] font-semibold leading-tight">
                {tool.name}
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-3 text-center font-mono text-[9px] text-[var(--adrith-dim-2)]">
          + more tools added over time
        </p>
      </div>

      <ContactSection />
    </main>
  );
}

function ContactSection() {
  return (
    <div className="relative z-10 mx-auto mt-8 max-w-md border-t border-white/10 pt-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-dim)]">
        Contact
      </p>
      <div className="flex flex-col gap-2 text-sm">
        <a href="tel:+917259850990" className="flex items-center gap-2">
          <span aria-hidden>📞</span> +91 72598 50990
        </a>
        <a
          href="https://wa.me/917259850990"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2"
        >
          <span aria-hidden>💬</span> WhatsApp
        </a>
        <a
          href="https://youtube.com/@adrithdesigns"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2"
        >
          <span aria-hidden>▶️</span> YouTube — @adrithdesigns
        </a>
      </div>
    </div>
  );
}
