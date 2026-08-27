import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";
import { OrderDetail } from "@/components/rcc-order-detail";

export default async function RccMaterialOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  const isAdmin = profile?.is_platform_admin ?? false;

  const { data: order } = await supabase.from("rcc_material_orders").select("*").eq("id", orderId).single();
  if (!order) notFound();

  const { data: items } = await supabase
    .from("rcc_material_order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("material_name");

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/homecare.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard/homecare/rcc-materials" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← RCC Materials Supply
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">{order.project_name}</h1>
        <p className="mb-5 text-xs text-[var(--adrith-dim-2)]">{order.delivery_address}</p>

        <OrderDetail order={order} items={items ?? []} isAdmin={isAdmin} />
      </div>
    </main>
  );
}
