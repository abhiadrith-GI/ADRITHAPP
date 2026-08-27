import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";
import { MaterialCatalog } from "@/components/rcc-material-catalog";

const STATUS_LABELS: Record<string, string> = {
  placed: "Placed — awaiting confirmation",
  adjusted: "Quantities adjusted — review & approve",
  awaiting_payment: "Ready — payment pending",
  paid: "Paid — preparing delivery",
  complete: "Complete",
  cancelled: "Cancelled",
};

export default async function RccMaterialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  const isAdmin = profile?.is_platform_admin ?? false;

  const { data: materials } = await supabase
    .from("rcc_materials")
    .select("id, name, category, unit, customer_price, vendor_payout")
    .eq("is_active", true)
    .order("category")
    .order("sort_order");

  const ordersQuery = supabase
    .from("rcc_material_orders")
    .select("id, project_name, status, created_at, user_id")
    .order("created_at", { ascending: false });
  const { data: orders } = isAdmin ? await ordersQuery : await ordersQuery.eq("user_id", user.id);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/civil-rcc.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard/homecare" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← HomeCare
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">RCC Materials Supply</h1>
        <p className="mb-5 text-sm text-[var(--adrith-dim-2)]">
          Cement, sand, gelly, steel, bricks & the small materials RCC/brick/plaster work needs. Enter what you need — payment happens after we confirm availability with the vendor.
        </p>

        <Link
          href="/dashboard/homecare/rcc-materials/new"
          className="mb-6 block rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black"
        >
          + New Order
        </Link>

        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
              {isAdmin ? "All Orders" : "Your Orders"}
            </p>
          </div>
          {orders && orders.length > 0 ? (
            <div className="flex flex-col gap-2">
              {orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/dashboard/homecare/rcc-materials/${o.id}`}
                  className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{o.project_name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-rust)]">
                      {new Date(o.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{STATUS_LABELS[o.status] ?? o.status}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
              No orders yet — start one above.
            </p>
          )}
        </div>

        <div className="border-t border-white/10 pt-5">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Catalog & Pricing</p>
          <MaterialCatalog materials={materials ?? []} isAdmin={isAdmin} />
        </div>
      </div>
    </main>
  );
}
