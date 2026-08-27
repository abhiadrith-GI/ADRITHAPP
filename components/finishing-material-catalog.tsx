"use client";

import { useState } from "react";
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
  paints_finishes: "Paints & Finishes",
  doors_windows_wood_hardware: "Doors, Windows, Wood & Hardware",
  glass_glazing: "Glass & Glazing",
  tiles_flooring: "Tiles & Flooring",
  stainless_steel: "Stainless Steel",
  plumbing_electrical_fixtures: "Plumbing & Electrical Fixtures",
};

export function FinishingMaterialCatalog({ materials, isAdmin }: { materials: Material[]; isAdmin: boolean }) {
  const supabase = createClient();
  const [items, setItems] = useState(materials);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftCustomer, setDraftCustomer] = useState("");
  const [draftPayout, setDraftPayout] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byCategory = items.reduce<Record<string, Material[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  function startEdit(m: Material) {
    setEditingId(m.id);
    setDraftCustomer(String(m.customer_price));
    setDraftPayout(String(m.vendor_payout));
    setError(null);
  }

  async function saveEdit(id: string) {
    const customer_price = Number(draftCustomer);
    const vendor_payout = Number(draftPayout);
    if (!Number.isFinite(customer_price) || !Number.isFinite(vendor_payout) || customer_price < 0 || vendor_payout < 0) {
      setError("Enter valid, non-negative numbers for both prices.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("finishing_materials")
      .update({ customer_price, vendor_payout, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, customer_price, vendor_payout } : m)));
    setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-5">
      {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
        const rows = byCategory[key];
        if (!rows || rows.length === 0) return null;
        return (
          <div key={key}>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">{label}</p>
            <div className="flex flex-col gap-1.5">
              {rows.map((m) => (
                <div key={m.id} className="rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2.5">
                  {editingId === m.id ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium">{m.name}</span>
                      <div className="flex items-center gap-2">
                        <label className="flex-1 text-[11px] text-[var(--adrith-dim-2)]">
                          Customer price
                          <input
                            type="number"
                            value={draftCustomer}
                            onChange={(e) => setDraftCustomer(e.target.value)}
                            className="mt-0.5 w-full rounded border border-white/20 bg-black px-2 py-1 text-sm text-[var(--adrith-off-white)]"
                          />
                        </label>
                        <label className="flex-1 text-[11px] text-[var(--adrith-dim-2)]">
                          Vendor payout
                          <input
                            type="number"
                            value={draftPayout}
                            onChange={(e) => setDraftPayout(e.target.value)}
                            className="mt-0.5 w-full rounded border border-white/20 bg-black px-2 py-1 text-sm text-[var(--adrith-off-white)]"
                          />
                        </label>
                      </div>
                      {error && <p className="text-[11px] text-red-400">{error}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => saveEdit(m.id)}
                          className="rounded-md bg-[var(--adrith-rust)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-[var(--adrith-dim-2)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{m.name}</span>
                        <span className="ml-2 text-xs text-[var(--adrith-dim-2)]">/ {m.unit}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--adrith-rust)]">₹{m.customer_price}</span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => startEdit(m)}
                            className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-dim-2)] underline"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {isAdmin && editingId !== m.id && (
                    <p className="mt-0.5 text-[10px] text-[var(--adrith-dim-2)]">Vendor payout: ₹{m.vendor_payout}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
