/**
 * The actual room-placement rules, encoded from the researched reference
 * document rather than invented here. Two honesty rules this file follows:
 *
 * 1. Every room's ideal/acceptable/avoid is defined at the 8-direction
 *    level, where the real research sits. 16-zone results (see zones.ts)
 *    inherit from their nearest primary direction by default. A handful of
 *    explicit OVERRIDES exist below ONLY where specific 16-zone research
 *    was actually found (e.g. ESE being workable for a toilet but poor for
 *    a bedroom, even though both sit near "East"/"Southeast"). No override
 *    exists for a room+zone combination this project didn't actually
 *    research - that would be false precision, not a better answer.
 *
 * 2. Severity is 'major' only where sources consistently and repeatedly
 *    named that exact combination as the worst-cited defect (toilet/kitchen
 *    in Northeast, toilet in Southwest). Every other avoid-zone defaults to
 *    'intermediate' - a deliberate, documented choice, not a researched
 *    fact for every single case. Minor issues (color, furniture, clutter)
 *    aren't zone-based at all and are surfaced separately in report copy.
 */

import type { ZoneName } from "./zones";

export type Severity = "major" | "intermediate" | "minor";

export type RoomType =
  | "main_entrance"
  | "kitchen"
  | "master_bedroom"
  | "pooja_room"
  | "bathroom_toilet"
  | "staircase"
  | "living_room"
  | "dining_room"
  | "study";

export type RoomRule = {
  label: string;
  ideal: ZoneName[];
  acceptable: ZoneName[];
  /** Zones actively researched as worth avoiding, each with its severity. */
  avoid: { zone: ZoneName; severity: Severity }[];
  /** Non-demolition remedy, shown first per the established "remedy before verdict" rule. */
  remedy: string;
  /** Only set where a real, checkable environmental reason exists - never invented. */
  realReason?: string;
};

/**
 * Explicit 16-zone overrides. Format: roomType -> zone -> status. Only
 * populated where real sub-zone research exists (see zones.ts ZONE_THEME
 * for the sourcing). Anything not listed here falls through to its parent
 * primary-zone rule in ROOM_RULES below - that's the honest default, not a
 * gap.
 */
export const ZONE_OVERRIDES: Partial<Record<RoomType, Partial<Record<ZoneName, "ideal" | "acceptable" | "avoid">>>> = {
  master_bedroom: {
    ESE: "avoid", // "avoid using this zone for bedrooms" - specific, repeated finding
  },
  bathroom_toilet: {
    ESE: "acceptable", // "toilet placement for controlled disposal" - specific finding
  },
};

export const ROOM_RULES: Record<RoomType, RoomRule> = {
  main_entrance: {
    label: "Main entrance",
    ideal: ["E", "N"],
    acceptable: ["NE"],
    avoid: [], // Real concern here is obstruction (T-junction, pole, tree opposite) more than
    // a specific bad direction - handled as report copy, not a zone-severity rule.
    remedy: "A reflective surface or bright light near the entrance is the traditional, non-structural adjustment when the direction itself can't change.",
    realReason: "East and North entrances catch gentler daylight through the day rather than harsh western afternoon sun.",
  },
  kitchen: {
    label: "Kitchen",
    ideal: ["SE"],
    acceptable: ["NW"],
    avoid: [{ zone: "NE", severity: "major" }],
    remedy: "Repositioning the stove within the room, or simply cooking while facing East, addresses most of this without moving a wall.",
    realReason: "A Southeast kitchen gets useful morning solar heat - genuinely helpful for cooking, independent of tradition.",
  },
  master_bedroom: {
    label: "Master bedroom",
    ideal: ["SW"],
    acceptable: ["S", "W"],
    avoid: [{ zone: "NE", severity: "intermediate" }],
    remedy: "Sleeping with the head toward South or East, regardless of which wall the bed is against, addresses the core of this guidance without any structural change.",
    realReason: "Southwest walls are traditionally built heavier, which genuinely buffers heat and adds privacy - useful qualities for a room meant for rest.",
  },
  pooja_room: {
    label: "Pooja / prayer room",
    ideal: ["NE"],
    acceptable: ["E", "W"],
    avoid: [{ zone: "S", severity: "intermediate" }],
    remedy: "A small, clearly-defined shelf or alcove in an East or West-facing spot is a common non-structural alternative when Northeast isn't available.",
  },
  bathroom_toilet: {
    label: "Bathroom / toilet",
    ideal: ["NW"],
    acceptable: ["SE"],
    avoid: [
      { zone: "NE", severity: "major" },
      { zone: "SW", severity: "major" },
    ],
    remedy: "Keeping the door closed when not in use and adding an exhaust fan for airflow are the standard non-structural steps where relocation isn't practical.",
  },
  staircase: {
    label: "Staircase",
    ideal: ["S", "W", "SW"],
    acceptable: [],
    avoid: [{ zone: "NE", severity: "intermediate" }],
    remedy: "Keeping the space directly under the stair as plain storage only, never a sacred or living space, is the standard adjustment.",
  },
  living_room: {
    label: "Living room",
    ideal: ["NE", "N", "E"],
    acceptable: ["NW"],
    avoid: [{ zone: "SW", severity: "intermediate" }],
    remedy: "Brighter lighting and lighter furnishings in the room offset a less-than-ideal direction without any structural change.",
    realReason: "Northeast, North, and East all receive better natural daylight through the day - a genuinely welcoming quality for a space meant for gathering.",
  },
  dining_room: {
    label: "Dining room",
    ideal: ["W", "E", "N"],
    acceptable: [],
    avoid: [{ zone: "SW", severity: "minor" }],
    remedy: "Seating the head of the household facing East at the table is the traditional adjustment that travels with the family, not the room.",
  },
  study: {
    label: "Study / home office",
    ideal: ["E", "N"],
    acceptable: ["NE"],
    avoid: [],
    remedy: "A desk turned to face East or North, even within an otherwise fixed room, is the standard non-structural adjustment.",
  },
};

export const ROOM_TYPES: RoomType[] = Object.keys(ROOM_RULES) as RoomType[];
