"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type OrderItem = {
  id: string;
  material_id: string;
  material_name: string;
  unit: string;
  quantity_requested: number;
  quantity_confirmed: number | null;
  unit_customer_price: number;
  unit_vendor_payout: number;
};

type Order = {
  id: string;
  project_name: string;
  status: string;
  admin_note: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  placed: "Placed — awaiting confirmation",
  adjusted: "Quantities adjusted — review & approve",
  awaiting_payment: "Confirmed — payment pending",
  paid: "Paid — preparing delivery",
  complete: "Complete",
  cancelled: "Cancelled",
};

function total(items: OrderItem[], field: "quantity_requested" | "quantity_confirmed", priceField: "unit_customer_price" | "unit_vendor_payout") {
  return items.reduce((sum, it) => {
    const qty = field === "quantity_confirmed" ? it.quantity_confirmed ?? it.quantity_requested : it.quantity_requested;
    return sum + qty * it[priceField];
  }, 0);
}

export function OrderDetail({ order, items, isAdmin }: { order: Order; items: OrderItem[]; isAdmin: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(items.map((it) => [it.id, String(it.quantity_confirmed ?? it.quantity_requested)]))
  );

  async function refresh() {
    router.refresh();
  }

  async function confirmAsIs() {
    setBusy(true);
    setError(null);
    for (const it of items) {
      const { error: e } = await supabase
        .from("rcc_material_order_items")
        .update({ quantity_confirmed: it.quantity_requested })
        .eq("id", it.id);
      if (e) {
        setBusy(false);
        setError(e.message);
        return;
      }
    }
    const { error: e2 } = await supabase
      .from("rcc_material_orders")
      .update({ status: "awaiting_payment", confirmed_at: new Date().toISOString() })
      .eq("id", order.id);
    setBusy(false);
    if (e2) {
      setError(e2.message);
      return;
    }
    refresh();
  }

  async function confirmWithChanges() {
    setBusy(true);
    setError(null);
    for (const it of items) {
      const qty = Number(drafts[it.id]);
      if (!Number.isFinite(qty) || qty < 0) {
        setBusy(false);
        setError("Every confirmed quantity must be a valid, non-negative number.");
        return;
      }
      const { error: e } = await supabase.from("rcc_material_order_items").update({ quantity_confirmed: qty }).eq("id", it.id);
      if (e) {
        setBusy(false);
        setError(e.message);
        return;
      }
    }
    const { error: e2 } = await supabase
      .from("rcc_material_orders")
      .update({ status: "adjusted", confirmed_at: new Date().toISOString() })
      .eq("id", order.id);
    setBusy(false);
    if (e2) {
      setError(e2.message);
      return;
    }
    setAdjusting(false);
    refresh();
  }

  async function approveAdjustment() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from("rcc_material_orders").update({ status: "awaiting_payment" }).eq("id", order.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  async function markPaid() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("rcc_material_orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", order.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  async function markComplete() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("rcc_material_orders")
      .update({ status: "complete", completed_at: new Date().toISOString() })
      .eq("id", order.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  async function cancelOrder() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from("rcc_material_orders").update({ status: "cancelled" }).eq("id", order.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  const showConfirmed = order.status !== "placed";
  const customerTotal = total(items, showConfirmed ? "quantity_confirmed" : "quantity_requested", "unit_customer_price");

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-[var(--adrith-rust)] bg-[var(--adrith-card)] px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-rust)]">Status</p>
        <p className="mt-0.5 text-sm font-semibold">{STATUS_LABELS[order.status] ?? order.status}</p>
      </div>

      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Items</p>
        <div className="flex flex-col gap-1.5">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{it.material_name}</span>
                <span className="text-xs text-[var(--adrith-dim-2)]">₹{it.unit_customer_price}/{it.unit}</span>
              </div>
              {order.status === "placed" || !adjusting ? (
                <p className="mt-0.5 text-xs text-[var(--adrith-dim-2)]">
                  Requested: {it.quantity_requested} {it.unit}
                  {it.quantity_confirmed != null && it.quantity_confirmed !== it.quantity_requested && (
                    <span className="text-[var(--adrith-rust)]"> → Confirmed: {it.quantity_confirmed} {it.unit}</span>
                  )}
                </p>
              ) : (
                <label className="mt-1 flex items-center gap-2 text-xs text-[var(--adrith-dim-2)]">
                  Confirm qty:
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={drafts[it.id]}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [it.id]: e.target.value }))}
                    className="w-20 rounded-md border border-white/20 bg-black px-2 py-1 text-right text-sm text-[var(--adrith-off-white)]"
                  />
                </label>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-right text-sm font-semibold">Total: ₹{customerTotal.toFixed(2)}</p>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Customer action: approve an adjustment */}
      {!isAdmin && order.status === "adjusted" && (
        <button
          type="button"
          disabled={busy}
          onClick={approveAdjustment}
          className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? "…" : "Approve Adjusted Quantities"}
        </button>
      )}

      {/* Customer view: payment pending, no gateway yet */}
      {!isAdmin && order.status === "awaiting_payment" && (
        <div className="rounded-xl border border-dashed border-white/20 px-4 py-4 text-center">
          <p className="text-sm font-medium">Ready to pay</p>
          <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
            Online payment is being set up — Adrith will contact you directly to complete payment for now.
          </p>
        </div>
      )}

      {/* Admin actions */}
      {isAdmin && order.status === "placed" && !adjusting && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={confirmAsIs}
            className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
          >
            Confirm As Requested
          </button>
          <button
            type="button"
            onClick={() => setAdjusting(true)}
            className="rounded-xl border border-white/20 px-4 py-3 text-center text-sm text-[var(--adrith-off-white)]"
          >
            Confirm With Changes
          </button>
        </div>
      )}
      {isAdmin && order.status === "placed" && adjusting && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={confirmWithChanges}
            className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save Adjusted Quantities"}
          </button>
          <button
            type="button"
            onClick={() => setAdjusting(false)}
            className="rounded-xl border border-white/20 px-4 py-3 text-center text-sm text-[var(--adrith-dim-2)]"
          >
            Cancel
          </button>
        </div>
      )}
      {isAdmin && order.status === "awaiting_payment" && (
        <button
          type="button"
          disabled={busy}
          onClick={markPaid}
          className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
        >
          Mark Paid (collected outside the app)
        </button>
      )}
      {isAdmin && order.status === "paid" && (
        <button
          type="button"
          disabled={busy}
          onClick={markComplete}
          className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
        >
          Mark Delivered / Complete
        </button>
      )}
      {isAdmin && !["complete", "cancelled"].includes(order.status) && (
        <button
          type="button"
          disabled={busy}
          onClick={cancelOrder}
          className="text-center font-mono text-xs uppercase tracking-wider text-[var(--adrith-dim-2)] underline"
        >
          Cancel this order
        </button>
      )}
    </div>
  );
}
