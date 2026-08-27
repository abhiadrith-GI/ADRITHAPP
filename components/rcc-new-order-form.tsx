"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Material = {
  id: string;
  name: string;
  category: string;
  unit: string;
  customer_price: number;
  vendor_payout: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  rcc_work: "RCC Work",
  steel_work: "Steel Work",
  brick_work: "Brick Work",
  plastering: "Plastering",
};

export function NewOrderForm({ materials, userId }: { materials: Material[]; userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byCategory = materials.reduce<Record<string, Material[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  const selectedCount = Object.values(quantities).filter((v) => Number(v) > 0).length;

  async function submit() {
    setError(null);
    if (!projectName.trim() || !deliveryAddress.trim()) {
      setError("Project name and delivery address are both required.");
      return;
    }
    const lineItems = materials
      .map((m) => ({ material: m, qty: Number(quantities[m.id]) }))
      .filter((row) => Number.isFinite(row.qty) && row.qty > 0);

    if (lineItems.length === 0) {
      setError("Enter a quantity for at least one material.");
      return;
    }

    setSubmitting(true);
    const { data: order, error: orderError } = await supabase
      .from("rcc_material_orders")
      .insert({ user_id: userId, project_name: projectName.trim(), delivery_address: deliveryAddress.trim(), status: "placed" })
      .select("id")
      .single();

    if (orderError || !order) {
      setSubmitting(false);
      setError(orderError?.message ?? "Could not create the order.");
      return;
    }

    const { error: itemsError } = await supabase.from("rcc_material_order_items").insert(
      lineItems.map((row) => ({
        order_id: order.id,
        material_id: row.material.id,
        material_name: row.material.name,
        unit: row.material.unit,
        quantity_requested: row.qty,
        unit_customer_price: row.material.customer_price,
        unit_vendor_payout: row.material.vendor_payout,
      }))
    );

    setSubmitting(false);
    if (itemsError) {
      setError(itemsError.message);
      return;
    }
    router.push(`/dashboard/homecare/rcc-materials/${order.id}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <label className="text-xs text-[var(--adrith-dim-2)]">
          Project name
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. Subramanya dt, Thirthahalli"
            className="mt-1 w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm text-[var(--adrith-off-white)] outline-none"
          />
        </label>
        <label className="text-xs text-[var(--adrith-dim-2)]">
          Delivery address
          <textarea
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            rows={2}
            placeholder="Site address for delivery"
            className="mt-1 w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm text-[var(--adrith-off-white)] outline-none"
          />
        </label>
      </div>

      {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
        const rows = byCategory[key];
        if (!rows || rows.length === 0) return null;
        return (
          <div key={key}>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">{label}</p>
            <div className="flex flex-col gap-1.5">
              {rows.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2.5"
                >
                  <div>
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="ml-2 text-xs text-[var(--adrith-dim-2)]">
                      ₹{m.customer_price} / {m.unit}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={quantities[m.id] ?? ""}
                    onChange={(e) => setQuantities((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    placeholder="0"
                    className="w-20 rounded-md border border-white/20 bg-black px-2 py-1.5 text-right text-sm text-[var(--adrith-off-white)] outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={submit}
        className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
      >
        {submitting ? "Submitting…" : `Submit Order${selectedCount > 0 ? ` (${selectedCount} items)` : ""}`}
      </button>
    </div>
  );
}
