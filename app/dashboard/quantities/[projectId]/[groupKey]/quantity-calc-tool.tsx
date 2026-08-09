"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StageGroup } from "@/lib/quantity/stage-config";
import {
  FEET_TO_METERS,
  CONCRETE_MIXES,
  MORTAR_RATIOS,
  calculateConcrete,
  estimateSteelFromThumbRule,
  calculateBrickwork,
  calculatePlastering,
} from "@/lib/quantity/formulas";

type Inputs = {
  lengthFt: number;
  breadthFt: number;
  depthFt: number;
  count: number;
  mixIndex: number;
  wastagePercent: number;
};

const DEFAULT_INPUTS: Inputs = {
  lengthFt: 0,
  breadthFt: 0,
  depthFt: 0,
  count: 1,
  mixIndex: 3, // M20 - the conventional default
  wastagePercent: 5,
};

type HistoryRow = {
  id: string;
  inputs: unknown;
  outputs: unknown;
  photo_storage_path: string | null;
  created_at: string;
};

type Step = "measure" | "doubt" | "results";

export function QuantityCalcTool({
  projectId,
  groupKey,
  stageLabel,
  floor,
  group,
  history,
}: {
  projectId: string;
  groupKey: string;
  stageLabel: string;
  floor: number | null;
  group: StageGroup;
  history: HistoryRow[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("measure");
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);
  const [showHistory, setShowHistory] = useState(false);

  const [doubtQuestion, setDoubtQuestion] = useState("");
  const [doubtThread, setDoubtThread] = useState<{ q: string; a: string }[]>([]);
  const [doubtLoading, setDoubtLoading] = useState(false);
  const [doubtError, setDoubtError] = useState<string | null>(null);

  const [pendingPhoto, setPendingPhoto] = useState<{ base64: string; mediaType: string; previewUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isMortarKind = group.kind === "brickwork" || group.kind === "plastering";
  const mixOptions = isMortarKind ? MORTAR_RATIOS : CONCRETE_MIXES;
  const selectedMix = mixOptions[Math.min(inputs.mixIndex, mixOptions.length - 1)];

  const result = useMemo(() => {
    const lM = inputs.lengthFt * FEET_TO_METERS;
    const bM = inputs.breadthFt * FEET_TO_METERS;
    const dM = inputs.depthFt * FEET_TO_METERS;
    if (lM <= 0 || bM <= 0 || dM <= 0 || inputs.count <= 0) return null;

    if (group.kind === "excavation") {
      const volumeM3 = lM * bM * dM * inputs.count;
      return { kind: "excavation" as const, volumeM3, volumeCft: volumeM3 * 35.3147 };
    }
    if (group.kind === "concrete_and_steel") {
      const volumeM3 = lM * bM * dM * inputs.count;
      const concrete = calculateConcrete(volumeM3, selectedMix as (typeof CONCRETE_MIXES)[number], inputs.wastagePercent);
      const steel = group.steelElementKey
        ? estimateSteelFromThumbRule(volumeM3, group.steelElementKey as Parameters<typeof estimateSteelFromThumbRule>[1], inputs.wastagePercent)
        : null;
      return { kind: "concrete_and_steel" as const, concrete, steel };
    }
    if (group.kind === "brickwork") {
      const volumeM3 = lM * bM * dM * inputs.count;
      const brickwork = calculateBrickwork(volumeM3, selectedMix as (typeof MORTAR_RATIOS)[number], inputs.wastagePercent);
      return { kind: "brickwork" as const, brickwork };
    }
    if (group.kind === "plastering") {
      const areaM2 = lM * bM * inputs.count;
      const plaster = calculatePlastering(areaM2, dM, selectedMix as (typeof MORTAR_RATIOS)[number], inputs.wastagePercent);
      return { kind: "plastering" as const, plaster };
    }
    return null;
  }, [inputs, group, selectedMix]);

  async function askDoubt() {
    const q = doubtQuestion.trim();
    if (!q || doubtLoading) return;
    setDoubtLoading(true);
    setDoubtError(null);
    try {
      const res = await fetch("/api/quantities/doubt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, stageGroupKey: groupKey, stageLabel, question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDoubtError(data.error ?? "Something went wrong.");
        return;
      }
      setDoubtThread((prev) => [...prev, { q, a: data.answer }]);
      setDoubtQuestion("");
    } catch {
      setDoubtError("Could not reach the server — check your connection.");
    } finally {
      setDoubtLoading(false);
    }
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPendingPhoto({ base64: result.split(",")[1], mediaType: file.type, previewUrl: URL.createObjectURL(file) });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    let photoStoragePath: string | null = null;
    if (pendingPhoto) {
      const ext = pendingPhoto.mediaType === "image/png" ? "png" : "jpg";
      const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
      const bytes = Uint8Array.from(atob(pendingPhoto.base64), (c) => c.charCodeAt(0));
      const { error: uploadError } = await supabase.storage.from("quantity-calc-files").upload(path, bytes, { contentType: pendingPhoto.mediaType });
      if (uploadError) {
        setSaving(false);
        setSaveError("Could not upload the photo — try again, or save without one.");
        return;
      }
      photoStoragePath = path;
    }

    // Plain insert, never upsert - per instruction, this isn't a one-shot
    // tool, every save is its own new record, not an overwrite.
    const { error: insertError } = await supabase.from("quantity_calculations").insert({
      project_id: projectId,
      user_id: user.id,
      stage_group_key: groupKey,
      floor_number: floor,
      inputs,
      outputs: result,
      photo_storage_path: photoStoragePath,
    });

    setSaving(false);
    if (insertError) {
      setSaveError(insertError.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  function startOver() {
    setStep("measure");
    setInputs(DEFAULT_INPUTS);
    setDoubtThread([]);
    setDoubtQuestion("");
    setPendingPhoto(null);
    setSaved(false);
    setSaveError(null);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {history.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)] underline"
          >
            {showHistory ? "Hide" : "Show"} past calculations ({history.length})
          </button>
          {showHistory && (
            <div className="mt-2 flex flex-col gap-2">
              {history.map((h) => (
                <HistoryEntry key={h.id} row={h} />
              ))}
            </div>
          )}
        </div>
      )}

      {step === "measure" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Length (ft)" value={inputs.lengthFt} onChange={(v) => setInputs({ ...inputs, lengthFt: v })} />
            <NumberField
              label={isMortarKind ? "Height (ft)" : "Breadth (ft)"}
              value={inputs.breadthFt}
              onChange={(v) => setInputs({ ...inputs, breadthFt: v })}
            />
            <NumberField
              label={isMortarKind ? "Thickness (ft)" : "Depth (ft)"}
              value={inputs.depthFt}
              onChange={(v) => setInputs({ ...inputs, depthFt: v })}
            />
          </div>

          {group.kind !== "excavation" && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label={group.key === "column" ? "How many columns" : "How many"}
                value={inputs.count}
                onChange={(v) => setInputs({ ...inputs, count: v })}
              />
              <NumberField label="Wastage %" value={inputs.wastagePercent} onChange={(v) => setInputs({ ...inputs, wastagePercent: v })} />
            </div>
          )}

          {group.kind !== "excavation" && (
            <div>
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-dim)]">
                {isMortarKind ? "Mortar ratio" : "Concrete mix"}
              </span>
              <div className="flex flex-col gap-1.5">
                {mixOptions.map((m, i) => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => setInputs({ ...inputs, mixIndex: i })}
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${
                      inputs.mixIndex === i ? "border-[var(--adrith-rust)] text-[var(--adrith-rust)]" : "border-white/20"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setStep("doubt")}
            disabled={!result}
            className="rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black disabled:opacity-40"
          >
            Continue
          </button>
        </>
      )}

      {step === "doubt" && (
        <>
          <p className="text-sm leading-relaxed text-[var(--adrith-dim-2)]">
            Any doubts before calculating — what to include, how to measure?
            Ask below, or continue straight to the result.
          </p>

          {doubtThread.map((t, i) => (
            <div key={i} className="rounded-lg border border-white/15 bg-[var(--adrith-card)] p-3 text-sm">
              <p className="font-semibold">{t.q}</p>
              <p className="mt-1 text-[var(--adrith-dim-2)]">{t.a}</p>
            </div>
          ))}

          <div className="flex gap-2">
            <input
              type="text"
              value={doubtQuestion}
              onChange={(e) => setDoubtQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askDoubt()}
              placeholder="e.g. does this include the door opening?"
              className="flex-1 rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={askDoubt}
              disabled={doubtLoading || !doubtQuestion.trim()}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm disabled:opacity-40"
            >
              {doubtLoading ? "…" : "Ask"}
            </button>
          </div>
          {doubtError && <p className="text-xs text-red-400">{doubtError}</p>}

          <button
            type="button"
            onClick={() => setStep("results")}
            className="rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black"
          >
            Continue to result
          </button>
        </>
      )}

      {step === "results" && result && (
        <>
          <ResultDisplay result={result} />

          <div>
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-dim)]">
              Photo (optional)
            </span>
            {pendingPhoto ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingPhoto.previewUrl} alt="Attached" className="h-14 w-14 rounded-lg object-cover" />
                <button onClick={() => setPendingPhoto(null)} className="text-xs text-[var(--adrith-dim-2)] underline">
                  Remove
                </button>
              </div>
            ) : (
              <label className="block cursor-pointer rounded-lg border border-dashed border-white/25 px-3 py-3 text-center text-xs text-[var(--adrith-dim-2)]">
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
                Attach a photo of what you measured
              </label>
            )}
          </div>

          {saveError && <p className="text-xs text-red-400">{saveError}</p>}

          {saved ? (
            <div className="flex flex-col gap-2">
              <p className="text-center text-sm text-[var(--adrith-rust)]">Saved ✓</p>
              <button type="button" onClick={startOver} className="rounded-lg border border-white/20 py-3 text-sm">
                Calculate again
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save this calculation"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-dim)]">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="rounded-lg border border-white/20 bg-[var(--adrith-card)] px-2 py-2 text-sm outline-none"
      />
    </label>
  );
}

type CalcResult =
  | { kind: "excavation"; volumeM3: number; volumeCft: number }
  | { kind: "concrete_and_steel"; concrete: ReturnType<typeof calculateConcrete>; steel: ReturnType<typeof estimateSteelFromThumbRule> | null }
  | { kind: "brickwork"; brickwork: ReturnType<typeof calculateBrickwork> }
  | { kind: "plastering"; plaster: ReturnType<typeof calculatePlastering> };

function ResultDisplay({ result }: { result: CalcResult }) {
  if (result.kind === "excavation") {
    return (
      <ResultCard>
        <ResultRow label="Volume to excavate" value={`${result.volumeM3.toFixed(2)} m³ (${result.volumeCft.toFixed(1)} cft)`} />
      </ResultCard>
    );
  }
  if (result.kind === "concrete_and_steel") {
    const c = result.concrete;
    return (
      <ResultCard>
        <ResultRow label="Concrete volume" value={`${c.wetVolumeM3.toFixed(2)} m³`} />
        <ResultRow label="Cement" value={`${Math.ceil(c.cementBags)} bags`} />
        <ResultRow label="Sand" value={`${c.sandCft.toFixed(1)} cft (${c.sandM3.toFixed(2)} m³)`} />
        <ResultRow label="Aggregate" value={`${c.aggregateCft.toFixed(1)} cft (${c.aggregateM3.toFixed(2)} m³)`} />
        {result.steel && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-1.5 text-[11px] font-semibold text-[var(--adrith-rust)]">Steel — estimate only, not a design number</p>
            <ResultRow label={`Thumb-rule (${result.steel.percentUsed}% of volume)`} value={`${Math.ceil(result.steel.steelKgWithWastage)} kg`} />
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--adrith-dim-2)]">
              For procurement and budgeting only. Actual reinforcement placed
              must follow the real structural drawing / Bar Bending Schedule —
              this is not a substitute for one.
            </p>
          </div>
        )}
      </ResultCard>
    );
  }
  if (result.kind === "brickwork") {
    const b = result.brickwork;
    return (
      <ResultCard>
        <ResultRow label="Wall volume" value={`${b.wallVolumeM3.toFixed(2)} m³`} />
        <ResultRow label="Bricks" value={`${b.brickCount.toLocaleString()} nos`} />
        <ResultRow label="Mortar cement" value={`${Math.ceil(b.mortar.cementBags)} bags`} />
        <ResultRow label="Mortar sand" value={`${b.mortar.sandCft.toFixed(1)} cft`} />
      </ResultCard>
    );
  }
  if (result.kind === "plastering") {
    const p = result.plaster;
    return (
      <ResultCard>
        <ResultRow label="Area" value={`${p.areaM2.toFixed(1)} m²`} />
        <ResultRow label="Cement" value={`${Math.ceil(p.cementBags)} bags`} />
        <ResultRow label="Sand" value={`${p.sandCft.toFixed(1)} cft`} />
      </ResultCard>
    );
  }
  return null;
}

function HistoryEntry({ row }: { row: HistoryRow }) {
  const date = new Date(row.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const outputs = row.outputs as CalcResult | null;
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--adrith-card)] p-3 text-xs">
      <p className="mb-1 font-mono text-[var(--adrith-dim)]">{date}</p>
      {outputs?.kind === "concrete_and_steel" && (
        <p>
          {outputs.concrete.wetVolumeM3.toFixed(2)} m³ · {Math.ceil(outputs.concrete.cementBags)} bags
          {outputs.steel && ` · ${Math.ceil(outputs.steel.steelKgWithWastage)} kg steel (est.)`}
        </p>
      )}
      {outputs?.kind === "brickwork" && <p>{outputs.brickwork.brickCount.toLocaleString()} bricks · {Math.ceil(outputs.brickwork.mortar.cementBags)} bags mortar</p>}
      {outputs?.kind === "plastering" && <p>{outputs.plaster.areaM2.toFixed(1)} m² · {Math.ceil(outputs.plaster.cementBags)} bags</p>}
      {outputs?.kind === "excavation" && <p>{outputs.volumeM3.toFixed(2)} m³</p>}
    </div>
  );
}

function ResultCard({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5 rounded-xl border border-white/15 bg-[var(--adrith-card)] p-4">{children}</div>;
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--adrith-dim-2)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
