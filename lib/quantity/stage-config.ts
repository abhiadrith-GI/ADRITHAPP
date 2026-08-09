/**
 * Maps the real checklist_stages stage keys (from create_default_stages_
 * and_checkpoints in schema.sql - not invented here) to what kind of
 * quantity calculation each one needs. A few stages are deliberately
 * grouped rather than kept 1:1 with Quality Control's stage list - see
 * the note on each group below for why.
 */

export type CalcKind = "excavation" | "concrete_and_steel" | "brickwork" | "plastering" | "none";

export type StageGroup = {
  /** Stable, explicit identifier - stored in quantity_calculations.stage_group_key. */
  key: string;
  /** One or two real checklist_stages stage_keys this group covers. */
  stageKeys: string[];
  label: string;
  kind: CalcKind;
  /** Only set for concrete_and_steel groups - which thumb-rule % applies. */
  steelElementKey?: string;
};

export const FOUNDATION_GROUPS: StageGroup[] = [
  { key: "excavation_soil", stageKeys: ["excavation_soil"], label: "Excavation & Soil Test", kind: "excavation" },
  { key: "pcc", stageKeys: ["pcc"], label: "PCC", kind: "concrete_and_steel" }, // no steelElementKey - PCC is unreinforced
  {
    // Steel and concrete are separate Quality Control stages (reinforcement
    // goes in before the pour), but they're the same physical footing with
    // the same dimensions - asking for the same L x B x D twice would be
    // redundant and risks two slightly different numbers for one real
    // element. One input here, feeding both outputs.
    key: "footing",
    stageKeys: ["footing_steel", "footing_concrete"],
    label: "Footing (Steel + Concrete)",
    kind: "concrete_and_steel",
    steelElementKey: "footing",
  },
  {
    key: "plinth_beam",
    stageKeys: ["plinth_beam_steel", "plinth_beam_concrete"],
    label: "Plinth Beam (Steel + Concrete)",
    kind: "concrete_and_steel",
    steelElementKey: "plinth_beam",
  },
];

export const FLOOR_GROUPS: StageGroup[] = [
  { key: "column", stageKeys: ["column"], label: "Column", kind: "concrete_and_steel", steelElementKey: "column" },
  { key: "brickwork", stageKeys: ["brickwork"], label: "Brickwork", kind: "brickwork" },
  { key: "lintel", stageKeys: ["lintel"], label: "Lintel", kind: "concrete_and_steel", steelElementKey: "lintel" },
  { key: "slab_beam", stageKeys: ["slab_beam"], label: "Slab & Beam", kind: "concrete_and_steel", steelElementKey: "slab_beam" },
  { key: "plastering", stageKeys: ["plastering"], label: "Plastering", kind: "plastering" },
];

export function findGroup(key: string, floor: number | null): StageGroup | undefined {
  const list = floor === null ? FOUNDATION_GROUPS : FLOOR_GROUPS;
  return list.find((g) => g.key === key);
}

/** "layout" (Site Layout) has no material quantity at all - a confirmation step, not a quantity of anything. */
export const NO_CALC_STAGE_KEYS = ["layout"];
