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

export function QuantityCalcTool({
  projectId,
  groupKey,
  floor,
  group,
  existingInputs,
}: {
  projectId: string;
  groupKey: string;
  floor: number | null;
  group: StageGroup;
  existingInputs: unknown;
}) {
  const router = useRouter();
  const supabase = createClient();

  const starting = (existingInputs as Partial<Inputs> | null) ?? {};
  const [inputs, setInputs] = useState<Inputs>({ ...DEFAULT_INPUTS, ...starting });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { error: upsertError } = await supabase
      .from("quantity_calculations")
      .upsert(
        {
          project_id: projectId,
          user_id: user.id,
          stage_group_key: groupKey,
          floor_number: floor,
          inputs,
          outputs: result,
        },
        { onConflict: "project_id,stage_group_key,floor_number" }
      );

    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Length (ft)" value={inputs.lengthFt} onChange={(v) => setInputs({ ...inputs, lengthFt: v })} />
        <NumberField
          label={group.kind === "brickwork" || group.kind === "plastering" ? "Height (ft)" : "Breadth (ft)"}
          value={inputs.breadthFt}
          onChange={(v) => setInputs({ ...inputs, breadthFt: v })}
        />
        <NumberField
          label={group.kind === "brickwork" || group.kind === "plastering" ? "Thickness (ft)" : "Depth (ft)"}
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
                  inputs.mixIndex === i
                    ? "border-[var(--adrith-rust)] text-[var(--adrith-rust)]"
                    : "border-white/20 text-[var(--adrith-off-white)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && <ResultDisplay result={result} />}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={!result || saving}
        className="rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black disabled:opacity-40"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save this calculation"}
      </button>
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
            <p className="mb-1.5 text-[11px] font-semibold text-[var(--adrith-rust)]">
              Steel — estimate only, not a design number
            </p>
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
