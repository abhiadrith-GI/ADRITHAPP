/**
 * Turns a user's room-by-room direction answers into a scored report.
 * Entirely deterministic - no AI call anywhere in this file. That's a
 * deliberate property, not an accident: this is the one part of the whole
 * platform that can be exact by construction rather than by careful
 * extraction, so it should be.
 */

import { bearingToZoneIndex, zoneIndexToName, ZONE_PARENT, ZONE_THEME, type ZoneName } from "./zones";
import { ROOM_RULES, ZONE_OVERRIDES, type RoomType, type Severity } from "./rules";

export type RoomStatus = "ideal" | "acceptable" | "avoid" | "neutral";

export type RoomAnswer = {
  room: RoomType;
  /** True compass bearing in degrees, 0-359.9. The questionnaire UI is
   * responsible for turning a plain-language answer ("Southeast, leaning
   * more East") into this number - this module only ever deals in degrees. */
  bearingDegrees: number;
  /** How the direction was actually determined - carried through to the
   * report so confidence can be represented honestly rather than uniformly. */
  source: "questionnaire" | "pdf" | "photo_or_sketch";
};

export type RoomResult = {
  room: RoomType;
  label: string;
  zone: ZoneName;
  status: RoomStatus;
  severity: Severity | null;
  remedy: string | null;
  realReason: string | null;
  zoneNote: string;
};

export type VastuReport = {
  overallScore: number; // 0-100
  roomResults: RoomResult[];
  majorCount: number;
  intermediateCount: number;
  /** True if any answer came from a photo/sketch rather than a PDF or the
   * plain questionnaire - triggers the precision disclaimer in the UI. */
  hasLowConfidenceInput: boolean;
};

const STATUS_POINTS: Record<RoomStatus, number> = {
  ideal: 10,
  acceptable: 7,
  neutral: 5,
  avoid: 0, // overridden by severity below
};

const AVOID_SEVERITY_POINTS: Record<Severity, number> = {
  major: 2,
  intermediate: 4,
  minor: 6,
};

function resolveStatus(room: RoomType, zone: ZoneName): { status: RoomStatus; severity: Severity | null } {
  const rule = ROOM_RULES[room];

  // 1. An explicit 16-zone override always wins - this is where real,
  //    specific sub-zone research exists.
  const override = ZONE_OVERRIDES[room]?.[zone];
  if (override === "ideal") return { status: "ideal", severity: null };
  if (override === "acceptable") return { status: "acceptable", severity: null };
  if (override === "avoid") {
    const existing = rule.avoid.find((a) => a.zone === zone);
    return { status: "avoid", severity: existing?.severity ?? "intermediate" };
  }

  // 2. Direct zone match against the researched rule.
  if (rule.ideal.includes(zone)) return { status: "ideal", severity: null };
  if (rule.acceptable.includes(zone)) return { status: "acceptable", severity: null };
  const directAvoid = rule.avoid.find((a) => a.zone === zone);
  if (directAvoid) return { status: "avoid", severity: directAvoid.severity };

  // 3. Fall back to the zone's primary-direction parent - the honest
  //    default for any of the 8 flanking zones without specific research.
  const parent = ZONE_PARENT[zone];
  if (parent !== zone) {
    if (rule.ideal.includes(parent)) return { status: "ideal", severity: null };
    if (rule.acceptable.includes(parent)) return { status: "acceptable", severity: null };
    const parentAvoid = rule.avoid.find((a) => a.zone === parent);
    if (parentAvoid) return { status: "avoid", severity: parentAvoid.severity };
  }

  return { status: "neutral", severity: null };
}

export function buildVastuReport(answers: RoomAnswer[]): VastuReport {
  if (answers.length === 0) {
    return { overallScore: 0, roomResults: [], majorCount: 0, intermediateCount: 0, hasLowConfidenceInput: false };
  }

  let totalPoints = 0;
  let majorCount = 0;
  let intermediateCount = 0;
  let hasLowConfidenceInput = false;

  const roomResults: RoomResult[] = answers.map((answer) => {
    const zoneIndex = bearingToZoneIndex(answer.bearingDegrees);
    const zone = zoneIndexToName(zoneIndex);
    const rule = ROOM_RULES[answer.room];
    const { status, severity } = resolveStatus(answer.room, zone);

    const points = status === "avoid" && severity ? AVOID_SEVERITY_POINTS[severity] : STATUS_POINTS[status];
    totalPoints += points;

    if (severity === "major") majorCount++;
    if (severity === "intermediate") intermediateCount++;
    if (answer.source === "photo_or_sketch") hasLowConfidenceInput = true;

    return {
      room: answer.room,
      label: rule.label,
      zone,
      status,
      severity,
      remedy: status === "avoid" ? rule.remedy : null,
      realReason: status === "ideal" || status === "acceptable" ? rule.realReason ?? null : null,
      zoneNote: ZONE_THEME[zone],
    };
  });

  const overallScore = Math.round((totalPoints / (answers.length * 10)) * 100);

  return { overallScore, roomResults, majorCount, intermediateCount, hasLowConfidenceInput };
}

/** Plain-language band for the headline score, matching the "informative,
 * not panic-inducing" tone established throughout this tool's research. */
export function scoreBand(score: number): { label: string; description: string } {
  if (score >= 80) return { label: "Strong alignment", description: "Most of your home already follows traditional Vastu placement well." };
  if (score >= 60) return { label: "Good, with room to improve", description: "A solid foundation with a few areas worth a look." };
  if (score >= 40) return { label: "Mixed", description: "Several placements are worth discussing - most have a non-structural remedy available." };
  return { label: "Worth a real conversation", description: "A number of placements diverge from traditional guidance - talk it through with us rather than reacting to the number alone." };
}
