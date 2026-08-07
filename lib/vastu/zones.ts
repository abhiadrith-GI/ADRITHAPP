/**
 * The 16-zone compass system - deliberately stopping here, not going to the
 * 32-pada system. That decision was made after finding a real, credentialed
 * dispute about the 32-zone system's own correct methodology, and because
 * 32-zone is the direct on-ramp back into the Vastu Purusha Mandala grid,
 * which was explicitly turned down as unnecessary complexity. 16-zone is
 * well-supported and consistent across independent sources; going further
 * isn't.
 *
 * Zones are numbered 0-15 clockwise from true North, each spanning exactly
 * 22.5 degrees, centered on its named direction (so SE itself spans
 * 123.75-146.25 degrees; it is its own zone, not a boundary between others).
 */

export const ZONE_NAMES = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

export type ZoneName = (typeof ZONE_NAMES)[number];

/** The 8 primary directions every core room rule is actually researched at. */
export const PRIMARY_ZONES: ZoneName[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * Converts a compass bearing (0-359.9, true North = 0, clockwise) into a
 * zone index 0-15. Pure math, no external dependency - directly unit
 * testable, which matters given how much the rest of this tool leans on it
 * being right.
 */
export function bearingToZoneIndex(bearingDegrees: number): number {
  const normalized = ((bearingDegrees % 360) + 360) % 360;
  return Math.round(normalized / 22.5) % 16;
}

export function zoneIndexToName(index: number): ZoneName {
  return ZONE_NAMES[((index % 16) + 16) % 16];
}

/**
 * Every 16-zone name maps to the nearest primary (8-direction) zone it
 * flanks. This is the honest default: a room's ideal/acceptable/avoid rules
 * are researched at the 8-direction level, and a flanking zone (like ESE)
 * inherits its parent's rule (SE) UNLESS a specific override exists for it
 * in rules.ts. This avoids inventing 16-zone-specific guidance for every
 * room just because the framework technically supports it - false
 * precision is exactly what this tool is built to avoid.
 */
export const ZONE_PARENT: Record<ZoneName, ZoneName> = {
  N: "N", NNE: "N", NE: "NE", ENE: "E",
  E: "E", ESE: "E", SE: "SE", SSE: "S",
  S: "S", SSW: "S", SW: "SW", WSW: "W",
  W: "W", WNW: "W", NW: "NW", NNW: "N",
};
// Note: NNE and NNW both lean toward N (their own researched sub-zone
// meanings differ - see rules.ts overrides - but their *parent* for
// room-placement inheritance is N, since that's the nearer primary
// direction geometrically). Same logic for ENE->E, WSW->W etc.

/**
 * Real, sourced sub-zone character - used for the content library and for
 * report copy, not for pass/fail room logic (that stays on the override
 * system above, which only touches placement rules with real backing).
 */
export const ZONE_THEME: Record<ZoneName, string> = {
  N: "Wealth and new opportunity",
  NNE: "Health and healing",
  NE: "Spiritual clarity - traditional pooja placement",
  ENE: "Focus, calm, quiet concentration",
  E: "Health and fresh starts",
  ESE: "Analysis and mental churning - workable for a toilet, best avoided for rest",
  SE: "Fire and transformation - traditional kitchen zone",
  SSE: "Sustained strength - often workable for a bedroom",
  S: "Recognition, discipline, rest",
  SSW: "Expenditure and release - traditionally kept light",
  SW: "Stability and grounding - traditional master bedroom zone",
  WSW: "Study and focus",
  W: "Gains and outcomes",
  WNW: "Restlessness if overloaded - keep calm and uncluttered",
  NW: "Support and movement",
  NNW: "Emotional processing and connection",
};

/** Room-agnostic color guidance per zone, for the color library / report accents. */
export const ZONE_COLOR_GUIDANCE: Record<ZoneName, { favor: string; avoid: string }> = {
  N: { favor: "White, soft blue", avoid: "Heavy dark tones" },
  NNE: { favor: "White, light green", avoid: "Red, black" },
  NE: { favor: "White, light yellow", avoid: "Dark shades entirely" },
  ENE: { favor: "Light green, white", avoid: "Bold red" },
  E: { favor: "White, light blue", avoid: "Black" },
  ESE: { favor: "Light tones generally", avoid: "Very dark tones" },
  SE: { favor: "Orange, red, yellow (warm)", avoid: "Dark blue, black, grey" },
  SSE: { favor: "Pink, red (soft)", avoid: "Black" },
  S: { favor: "Red, orange", avoid: "Very dark, heavy tones" },
  SSW: { favor: "Yellow, beige", avoid: "Bright red" },
  SW: { favor: "Yellow, golden, earthy tones", avoid: "Black" },
  WSW: { favor: "Yellow, white", avoid: "Dark grey" },
  W: { favor: "White, silver", avoid: "Very dark tones" },
  WNW: { favor: "White, light grey", avoid: "Black" },
  NW: { favor: "White, cream", avoid: "Dark heavy tones" },
  NNW: { favor: "White, light blue", avoid: "Bold dark colors" },
};
