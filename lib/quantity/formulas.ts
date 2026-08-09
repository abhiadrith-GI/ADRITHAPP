/**
 * Core material-quantity formulas, encoded from the researched reference
 * document, not invented here. Two honesty rules this file follows, same
 * spirit as lib/vastu/rules.ts:
 *
 * 1. Every constant and ratio traces to something actually found in
 *    research - see rcc-quantity-calculation-reference.md for sourcing.
 *    Where real sources disagreed (concrete mix ratios, steel thumb-rule
 *    ranges), the conventional/majority figure is the default, and that's
 *    stated here, not hidden.
 * 2. Steel from a thumb-rule percentage is explicitly an ESTIMATE for
 *    procurement and budgeting - never presented as a substitute for an
 *    actual structural drawing or Bar Bending Schedule. This distinction
 *    is carried in the return type itself (isEstimateOnly), not left to
 *    UI copy to remember to mention.
 */

export const FEET_TO_METERS = 0.3048;
export const M3_TO_CFT = 35.3147;

export const CEMENT_DENSITY_KG_M3 = 1440;
export const CEMENT_BAG_KG = 50;
export const CEMENT_BAG_M3 = CEMENT_BAG_KG / CEMENT_DENSITY_KG_M3; // ~0.0347

export const STEEL_DENSITY_KG_M3 = 7850;

// Concrete's dry-to-wet conversion factor - accounts for the gap between
// loose dry material and compacted wet concrete. 1.54 was the one figure
// every source agreed on without exception.
export const CONCRETE_DRY_FACTOR = 1.54;

// Mortar (brickwork and plastering) uses a DIFFERENT factor than concrete
// - deliberately not conflated with the 1.54 above, even though both are
// "dry volume factors" in a loose sense.
export const MORTAR_DRY_FACTOR = 1.33;

export type MixRatio = { label: string; cement: number; sand: number; aggregate: number };

// The conventional nominal-mix table - what the large majority of sources,
// calculators, and real Indian site practice actually use. A credible
// source argues 1:2:4 is more technically correct for M20 with modern
// cement; the conventional table is still the default here since matching
// real-world expectation matters as much as theoretical precision for a
// tool people will actually use on site. The ratio itself is always
// editable per calculation - this table only supplies the starting point.
export const CONCRETE_MIXES: MixRatio[] = [
  { label: "PCC — 1:4:8", cement: 1, sand: 4, aggregate: 8 },
  { label: "PCC — 1:5:10", cement: 1, sand: 5, aggregate: 10 },
  { label: "M15 — 1:2:4", cement: 1, sand: 2, aggregate: 4 },
  { label: "M20 — 1:1.5:3", cement: 1, sand: 1.5, aggregate: 3 },
  { label: "M25 — 1:1:2", cement: 1, sand: 1, aggregate: 2 },
];

export type MortarRatio = { label: string; cement: number; sand: number };

export const MORTAR_RATIOS: MortarRatio[] = [
  { label: "1:3 (rich — ceiling plaster)", cement: 1, sand: 3 },
  { label: "1:4 (wall plaster / brickwork)", cement: 1, sand: 4 },
  { label: "1:5", cement: 1, sand: 5 },
  { label: "1:6 (standard brickwork)", cement: 1, sand: 6 },
];

/**
 * Steel thumb-rule percentages, as % of concrete volume. Ranges found in
 * research, collapsed to one reasonable default each - see the reference
 * doc for the full cited range per element. "Slab & Beam" is a genuine
 * simplification: research found slab (~1%) and beam (~2%) as separately
 * different figures, but this platform's checklist tracks them as one
 * combined stage (they're commonly cast together on site), so this is a
 * deliberate blended estimate, not a researched figure of its own -
 * flagged here explicitly rather than presented as equally precise.
 */
export const STEEL_THUMB_RULE_PERCENT: Record<string, number> = {
  footing: 0.8,
  plinth_beam: 2,
  column: 2.5,
  lintel: 2,
  slab_beam: 1.5, // blended between slab (~1%) and beam (~2%) - see note above
};

export type ConcreteResult = {
  wetVolumeM3: number;
  dryVolumeM3: number;
  cementBags: number;
  cementKg: number;
  sandM3: number;
  sandCft: number;
  aggregateM3: number;
  aggregateCft: number;
};

export function calculateConcrete(wetVolumeM3: number, mix: MixRatio, wastagePercent: number): ConcreteResult {
  const dryVolumeM3 = wetVolumeM3 * CONCRETE_DRY_FACTOR * (1 + wastagePercent / 100);
  const totalParts = mix.cement + mix.sand + mix.aggregate;
  const cementM3 = dryVolumeM3 * (mix.cement / totalParts);
  const sandM3 = dryVolumeM3 * (mix.sand / totalParts);
  const aggregateM3 = dryVolumeM3 * (mix.aggregate / totalParts);
  const cementKg = cementM3 * CEMENT_DENSITY_KG_M3;

  return {
    wetVolumeM3,
    dryVolumeM3,
    cementBags: cementKg / CEMENT_BAG_KG,
    cementKg,
    sandM3,
    sandCft: sandM3 * M3_TO_CFT,
    aggregateM3,
    aggregateCft: aggregateM3 * M3_TO_CFT,
  };
}

export type SteelEstimate = {
  concreteVolumeM3: number;
  percentUsed: number;
  steelKg: number;
  steelKgWithWastage: number;
  /** Always true for the thumb-rule path - carried in the data itself, not just UI copy. */
  isEstimateOnly: true;
};

export function estimateSteelFromThumbRule(
  concreteVolumeM3: number,
  elementKey: keyof typeof STEEL_THUMB_RULE_PERCENT,
  wastagePercent: number
): SteelEstimate {
  const percentUsed = STEEL_THUMB_RULE_PERCENT[elementKey];
  const steelKg = concreteVolumeM3 * (percentUsed / 100) * STEEL_DENSITY_KG_M3;
  return {
    concreteVolumeM3,
    percentUsed,
    steelKg,
    steelKgWithWastage: steelKg * (1 + wastagePercent / 100),
    isEstimateOnly: true,
  };
}

/**
 * The genuinely precise alternative to the thumb-rule - real physics, not
 * a convention. Confirmed identical across eight independent sources.
 */
export function calculateBarWeight(diameterMm: number, lengthM: number, countOfBars: number): number {
  const kgPerMeter = (diameterMm * diameterMm) / 162;
  return kgPerMeter * lengthM * countOfBars;
}

export type BrickworkResult = {
  wallVolumeM3: number;
  brickCount: number;
  mortar: { cementBags: number; cementKg: number; sandM3: number; sandCft: number };
};

export function calculateBrickwork(wallVolumeM3: number, mortarRatio: MortarRatio, wastagePercent: number): BrickworkResult {
  // ~500 bricks/m3 and mortar at ~25-30% of brickwork volume are both
  // consistently repeated across independent sources for standard modular
  // brick (190x90x90mm) with a normal joint - see reference doc.
  const brickCount = Math.ceil(wallVolumeM3 * 500 * (1 + wastagePercent / 100));
  const mortarWetVolumeM3 = wallVolumeM3 * 0.27; // midpoint of the 25-30% range
  const mortarDryVolumeM3 = mortarWetVolumeM3 * MORTAR_DRY_FACTOR * (1 + wastagePercent / 100);
  const totalParts = mortarRatio.cement + mortarRatio.sand;
  const cementM3 = mortarDryVolumeM3 * (mortarRatio.cement / totalParts);
  const sandM3 = mortarDryVolumeM3 * (mortarRatio.sand / totalParts);
  const cementKg = cementM3 * CEMENT_DENSITY_KG_M3;

  return {
    wallVolumeM3,
    brickCount,
    mortar: {
      cementBags: cementKg / CEMENT_BAG_KG,
      cementKg,
      sandM3,
      sandCft: sandM3 * M3_TO_CFT,
    },
  };
}

export function calculatePlastering(areaM2: number, thicknessM: number, mortarRatio: MortarRatio, wastagePercent: number) {
  const wetVolumeM3 = areaM2 * thicknessM;
  const dryVolumeM3 = wetVolumeM3 * MORTAR_DRY_FACTOR * (1 + wastagePercent / 100);
  const totalParts = mortarRatio.cement + mortarRatio.sand;
  const cementM3 = dryVolumeM3 * (mortarRatio.cement / totalParts);
  const sandM3 = dryVolumeM3 * (mortarRatio.sand / totalParts);
  const cementKg = cementM3 * CEMENT_DENSITY_KG_M3;

  return {
    areaM2,
    wetVolumeM3,
    dryVolumeM3,
    cementBags: cementKg / CEMENT_BAG_KG,
    cementKg,
    sandM3,
    sandCft: sandM3 * M3_TO_CFT,
  };
}
