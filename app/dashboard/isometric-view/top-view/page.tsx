import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";
import { TopViewTool } from "./top-view-tool";

export default async function TopViewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: remaining } = await supabase.rpc("isometric_generations_remaining_today", {
    target_user_id: user.id,
    target_base: "top_view",
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-[var(--adrith-off-white)]">
      <RingBackground cyPercent={0} />
      <div className="relative z-10 mx-auto max-w-md px-5 pb-16 pt-8">
        <Link href="/dashboard/isometric-view" className="text-xs text-[var(--adrith-dim-2)]">
          ← Isometric View
        </Link>
        <h1 className="mt-3 text-xl font-semibold">Actual Top View</h1>
        <p className="mt-1 text-sm text-[var(--adrith-dim-2)]">
          CAD-exported vector PDFs only — an exact, unaltered reproduction, nothing else.
        </p>

        <TopViewTool remainingToday={remaining ?? 5} />
      </div>
    </main>
  );
}
