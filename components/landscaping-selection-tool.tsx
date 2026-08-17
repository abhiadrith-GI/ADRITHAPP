"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageBackground } from "@/components/page-background";
import { PLANT_ENTRIES, type PlantEntry } from "@/lib/landscaping/catalog-data";

type SelectionItem = { name: string; qty: string };

export function LandscapingSelectionTool({
  projectId,
  projectName,
  userId,
  initialSelection,
  initialInvites,
  initialQuotations,
}: {
  projectId: string;
  projectName: string;
  userId: string;
  initialSelection: { id: string; items: SelectionItem[]; status: "draft" | "finalized"; created_by: string } | null;
  initialInvites: { id: string; invited_email: string }[];
  initialQuotations: { id: string; quote_details: string; created_at: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [selectionId, setSelectionId] = useState(initialSelection?.id ?? null);
  const [status, setStatus] = useState<"draft" | "finalized" | null>(initialSelection?.status ?? null);
  const [items, setItems] = useState<SelectionItem[]>(initialSelection?.items ?? []);
  const [isOwnSelection] = useState(initialSelection ? initialSelection.created_by === userId : true);

  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendorEmail, setVendorEmail] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return PLANT_ENTRIES.filter((p) => `${p.name} ${p.keywords}`.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  function findEntry(name: string): PlantEntry | undefined {
    return PLANT_ENTRIES.find((p) => p.name === name);
  }

  async function persistItems(newItems: SelectionItem[]) {
    setSaving(true);
    setError(null);

    if (!selectionId) {
      const { data, error: insertError } = await supabase
        .from("landscaping_selections")
        .insert({ project_id: projectId, created_by: userId, items: newItems })
        .select("id")
        .single();
      setSaving(false);
      if (insertError || !data) {
        setError(insertError?.message ?? "Could not save.");
        return;
      }
      setSelectionId(data.id);
      setStatus("draft");
      setItems(newItems);
      return;
    }

    const { error: updateError } = await supabase.from("landscaping_selections").update({ items: newItems }).eq("id", selectionId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setItems(newItems);
  }

  function addItem(name: string) {
    if (items.some((i) => i.name === name)) return;
    persistItems([...items, { name, qty: "1" }]);
    setQuery("");
  }

  function updateQty(name: string, qty: string) {
    const next = items.map((i) => (i.name === name ? { ...i, qty } : i));
    setItems(next);
    persistItems(next);
  }

  function removeItem(name: string) {
    persistItems(items.filter((i) => i.name !== name));
  }

  async function handleFinalize() {
    if (!selectionId || items.length === 0) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("landscaping_selections")
      .update({ status: "finalized" })
      .eq("id", selectionId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStatus("finalized");
    router.refresh();
  }

  async function handleInviteVendor() {
    if (!selectionId || !vendorEmail.trim()) return;
    setSaving(true);
    setError(null);

    const { data, error: lookupError } = await supabase.rpc("find_user_by_email", {
      lookup_email: vendorEmail.trim(),
    });

    const match = Array.isArray(data) ? data[0] : data;

    if (lookupError || !match) {
      setSaving(false);
      setError("No ADRITH account found with that email.");
      return;
    }

    const { error: inviteError } = await supabase.from("landscaping_vendor_invites").insert({
      selection_id: selectionId,
      vendor_id: match.id,
      invited_by: userId,
    });

    setSaving(false);
    if (inviteError) {
      setError(inviteError.message);
      return;
    }
    setVendorEmail("");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/landscaping-gardening.jpg" />
      <div className="relative z-10 mx-auto max-w-md lg:max-w-4xl">
        <Link href="/dashboard/landscaping-gardening" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Landscaping &amp; Gardening
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">{projectName}</h1>

        {status === "finalized" ? (
          <p className="mb-4 text-xs text-[var(--adrith-rust)]">Finalized — locked, this list can no longer change.</p>
        ) : (
          <p className="mb-4 text-sm text-[var(--adrith-dim-2)]">Search the catalog and add what you want.</p>
        )}

        {status !== "finalized" && (
          <div className="relative mb-4 lg:max-w-md">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plants, grass…"
              className="w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm outline-none"
            />
            {matches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] shadow-lg">
                {matches.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => addItem(m.name)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                  >
                    {m.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                    )}
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)] sm:col-span-2 lg:col-span-3">
              Nothing added yet — search above.
            </p>
          ) : (
            items.map((item) => {
              const entry = findEntry(item.name);
              return (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {entry?.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                    )}
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {status !== "finalized" ? (
                      <>
                        <input
                          type="text"
                          value={item.qty}
                          onChange={(e) => updateQty(item.name, e.target.value)}
                          className="w-16 rounded border border-white/20 bg-transparent px-2 py-1 text-center text-xs"
                        />
                        <button type="button" onClick={() => removeItem(item.name)} className="text-xs text-red-400">
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--adrith-dim-2)]">{item.qty}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error && <p className="mb-4 text-xs text-red-400">{error}</p>}

        {status === "draft" && items.length > 0 && (
          <button
            type="button"
            onClick={handleFinalize}
            disabled={saving}
            className="mb-6 w-full rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black disabled:opacity-60"
          >
            {saving ? "…" : "Finalize this list"}
          </button>
        )}

        {status === "finalized" && isOwnSelection && (
          <div className="mb-6">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
              Connect with a vendor
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={vendorEmail}
                onChange={(e) => setVendorEmail(e.target.value)}
                placeholder="Vendor's ADRITH email"
                className="flex-1 rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleInviteVendor}
                disabled={saving || !vendorEmail.trim()}
                className="rounded-lg bg-[var(--adrith-rust)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                Invite
              </button>
            </div>

            {initialInvites.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {initialInvites.map((inv) => (
                  <p key={inv.id} className="text-xs text-[var(--adrith-dim-2)]">
                    Invited: {inv.invited_email}
                  </p>
                ))}
              </div>
            )}

            {initialQuotations.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Quotes received</p>
                {initialQuotations.map((q) => (
                  <div key={q.id} className="mb-2 rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2 text-sm">
                    {q.quote_details}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
