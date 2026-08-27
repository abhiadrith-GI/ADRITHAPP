import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";
import { FinishingNewOrderForm } from "@/components/finishing-new-order-form";

export default async function NewFinishingMaterialOrderPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: materials } = await supabase
    .from("finishing_materials")
    .select("id, name, category, unit, customer_price, vendor_payout")
    .eq("is_active", true)
    .order("category")
    .order("sort_order");

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/homecare.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard/homecare/finishing-materials" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Finishing Material Supply
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">New Order</h1>
        <p className="mb-5 text-sm text-[var(--adrith-dim-2)]">
          Enter what you need. We'll confirm availability with the vendor before payment opens up.
        </p>

        <FinishingNewOrderForm materials={materials ?? []} userId={user.id} />
      </div>
    </main>
  );
}
