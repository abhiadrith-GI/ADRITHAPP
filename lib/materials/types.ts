/**
 * The structure an AI analysis produces and a user edits, for both
 * calculators. One list = one room. `confidence` carries the honesty
 * requirement decided early on: every item states plainly whether it's
 * a real reading or a standard-practice estimate - never presented as
 * the same kind of claim.
 */

export type MaterialConfidence = "exact" | "estimated";

export type MaterialItem = {
  name: string;
  quantity: string; // e.g. "8 metres", "1", "6 points" - kept as a display string, not forced into one unit
  description: string; // plain-language, for a shop owner or homeowner who doesn't already know what this is
  confidence: MaterialConfidence;
  /** Only set when confidence is "estimated" - what convention the estimate is based on. */
  basis?: string;
};

export type MaterialAnalysisResult =
  | { type: "materials"; items: MaterialItem[] }
  | { type: "clarifying_question"; question: string };
