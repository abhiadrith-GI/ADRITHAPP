"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MaterialItem } from "@/lib/materials/types";

type ConversationTurn = { role: "user" | "assistant"; content: string };

type ListSummary = { id: string; status: "draft" | "finalized"; created_at: string; items: MaterialItem[] };

type Step = "history" | "input" | "clarifying" | "editing";

export function MaterialCalculatorTool({
  projectId,
  trade,
  roomType,
  initialLists,
}: {
  projectId: string;
  trade: "plumbing" | "electrical";
  roomType: string;
  initialLists: ListSummary[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("history");
  const lists = initialLists;

  const [description, setDescription] = useState("");
  const [pendingImage, setPendingImage] = useState<{ base64: string; mediaType: string; previewUrl: string } | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [activeItems, setActiveItems] = useState<MaterialItem[]>([]);
  const [activeStatus, setActiveStatus] = useState<"draft" | "finalized">("draft");
  const [saving, setSaving] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPendingImage({ base64: result.split(",")[1], mediaType: file.type, previewUrl: URL.createObjectURL(file) });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function submitAnalysis(isAnswerToQuestion: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/materials/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          trade,
          roomType,
          imageBase64: isAnswerToQuestion ? undefined : pendingImage?.base64,
          imageMediaType: isAnswerToQuestion ? undefined : pendingImage?.mediaType,
          description: isAnswerToQuestion ? answer : description,
          conversationHistory: isAnswerToQuestion ? conversationHistory : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }
      if (data.type === "clarifying_question") {
        setClarifyingQuestion(data.question);
        setConversationHistory(data.conversationHistory);
        setAnswer("");
        setStep("clarifying");
      } else {
        setActiveListId(data.materialListId);
        setActiveItems(data.items);
        setActiveStatus("draft");
        setClarifyingQuestion(null);
        setStep("editing");
        router.refresh();
      }
    } catch {
      setError("Could not reach the server — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function openExisting(list: ListSummary) {
    setActiveListId(list.id);
    setActiveItems(list.items);
    setActiveStatus(list.status);
    setStep("editing");
  }

  function updateItem(index: number, field: keyof MaterialItem, value: string) {
    setActiveItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function removeItem(index: number) {
    setActiveItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlankItem() {
    setActiveItems((prev) => [...prev, { name: "", quantity: "", description: "", confidence: "estimated" }]);
  }

  async function saveDraft() {
    if (!activeListId) return;
    setSaving(true);
    const { error: updateError } = await supabase.from("material_lists").update({ items: activeItems }).eq("id", activeListId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function finalizeList() {
    if (!activeListId) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error: updateError } = await supabase
      .from("material_lists")
      .update({ items: activeItems, status: "finalized", finalized_by: user.id, finalized_at: new Date().toISOString() })
      .eq("id", activeListId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setActiveStatus("finalized");
    router.refresh();
  }

  async function sendInvite() {
    if (!activeListId || !inviteEmail.trim()) return;
    setInviteStatus("Looking up…");
    const { data: found, error: lookupError } = await supabase.rpc("find_user_by_email", { lookup_email: inviteEmail.trim() });
    if (lookupError || !found || found.length === 0) {
      setInviteStatus("No ADRITH account found with that email.");
      return;
    }
    const shopOwner = found[0];
    if (shopOwner.role !== "shop_owner") {
      setInviteStatus("That account isn't registered as a Shop Owner.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error: inviteError } = await supabase.from("material_list_shop_invites").insert({
      material_list_id: activeListId,
      shop_owner_id: shopOwner.id,
      invited_by: user.id,
    });
    setInviteStatus(inviteError ? inviteError.message : `Shared with ${shopOwner.full_name}.`);
    setInviteEmail("");
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {step === "history" && (
        <>
          {lists.length > 0 ? (
            <div className="flex flex-col gap-2">
              {lists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => openExisting(l)}
                  className="flex items-center justify-between rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3 text-left"
                >
                  <span className="text-sm">{new Date(l.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className={`font-mono text-[10px] uppercase ${l.status === "finalized" ? "text-[var(--adrith-rust)]" : "text-[var(--adrith-dim-2)]"}`}>
                    {l.status === "finalized" ? "Finalized" : "Draft"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--adrith-dim-2)]">No lists yet for this room.</p>
          )}
          <button onClick={() => setStep("input")} className="rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black">
            + New list
          </button>
        </>
      )}

      {step === "input" && (
        <>
          <p className="text-sm text-[var(--adrith-dim-2)]">
            Upload a photo or plan, or just describe what&apos;s needed — the AI will ask if anything&apos;s unclear before giving a final list.
          </p>
          <label className="block cursor-pointer rounded-lg border border-dashed border-white/25 px-3 py-4 text-center text-xs text-[var(--adrith-dim-2)]">
            <input type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            {pendingImage ? "Photo attached — tap to change" : "Attach a photo or plan"}
          </label>
          {pendingImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingImage.previewUrl} alt="Attached" className="h-32 w-full rounded-lg object-cover" />
          )}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Or describe the room — fixtures planned, layout, anything relevant…"
            rows={3}
            className="rounded-lg border border-white/20 bg-[var(--adrith-card)] p-3 text-sm outline-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={() => submitAnalysis(false)}
            disabled={loading || (!pendingImage && !description.trim())}
            className="rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black disabled:opacity-40"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </>
      )}

      {step === "clarifying" && (
        <>
          <div className="rounded-lg border border-[var(--adrith-rust)] bg-[var(--adrith-card)] p-4">
            <p className="text-xs font-semibold text-[var(--adrith-rust)]">One question first</p>
            <p className="mt-1 text-sm">{clarifyingQuestion}</p>
          </div>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer…"
            rows={2}
            className="rounded-lg border border-white/20 bg-[var(--adrith-card)] p-3 text-sm outline-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={() => submitAnalysis(true)}
            disabled={loading || !answer.trim()}
            className="rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black disabled:opacity-40"
          >
            {loading ? "Thinking…" : "Continue"}
          </button>
        </>
      )}

      {step === "editing" && (
        <>
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            {activeStatus === "finalized" ? "Finalized — locked" : "Draft — editable"}
          </p>
          <div className="flex flex-col gap-2">
            {activeItems.map((item, i) => (
              <div key={i} className="rounded-lg border border-white/15 bg-[var(--adrith-card)] p-3">
                {activeStatus === "draft" ? (
                  <>
                    <input
                      value={item.name}
                      onChange={(e) => updateItem(i, "name", e.target.value)}
                      placeholder="Material name"
                      className="mb-1.5 w-full bg-transparent text-sm font-semibold outline-none"
                    />
                    <input
                      value={item.quantity}
                      onChange={(e) => updateItem(i, "quantity", e.target.value)}
                      placeholder="Quantity"
                      className="mb-1.5 w-full bg-transparent text-xs text-[var(--adrith-dim-2)] outline-none"
                    />
                    <textarea
                      value={item.description}
                      onChange={(e) => updateItem(i, "description", e.target.value)}
                      placeholder="Description"
                      rows={2}
                      className="mb-1.5 w-full bg-transparent text-xs text-[var(--adrith-dim-2)] outline-none"
                    />
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-mono text-[9px] uppercase ${item.confidence === "exact" ? "text-[var(--adrith-rust)]" : "text-[var(--adrith-dim-2)]"}`}
                      >
                        {item.confidence === "exact" ? "Read directly" : "Estimated — standard practice"}
                      </span>
                      <button onClick={() => removeItem(i)} className="text-[10px] text-red-400 underline">
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{item.name}</p>
                      <span className={`font-mono text-[9px] uppercase ${item.confidence === "exact" ? "text-[var(--adrith-rust)]" : "text-[var(--adrith-dim-2)]"}`}>
                        {item.confidence === "exact" ? "Read directly" : "Estimated"}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--adrith-dim-2)]">{item.quantity}</p>
                    <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{item.description}</p>
                    {item.basis && <p className="mt-1 text-[10px] italic text-[var(--adrith-dim-2)]">Basis: {item.basis}</p>}
                  </>
                )}
              </div>
            ))}
          </div>

          {activeStatus === "draft" && (
            <>
              <button onClick={addBlankItem} className="rounded-lg border border-white/20 py-2 text-xs">
                + Add item manually
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={saveDraft} disabled={saving} className="rounded-lg border border-white/20 py-3 text-sm">
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button onClick={finalizeList} disabled={saving} className="rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black">
                Finalize — locks permanently
              </button>
            </>
          )}

          {activeStatus === "finalized" && (
            <div className="mt-2 border-t border-white/10 pt-4">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Share for quotation</p>
              <div className="flex gap-2">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Shop owner's ADRITH email"
                  className="flex-1 rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2 text-sm outline-none"
                />
                <button onClick={sendInvite} className="rounded-lg border border-white/20 px-4 py-2 text-sm">
                  Share
                </button>
              </div>
              {inviteStatus && <p className="mt-2 text-xs text-[var(--adrith-dim-2)]">{inviteStatus}</p>}
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--adrith-dim-2)]">
                ADRITH is a neutral channel for quotations — any price a shop
                owner submits is theirs alone; ADRITH doesn&apos;t calculate,
                verify, or take responsibility for it.
              </p>
            </div>
          )}

          <button onClick={() => setStep("history")} className="text-xs text-[var(--adrith-dim-2)] underline">
            ← Back to list history
          </button>
        </>
      )}
    </div>
  );
}
