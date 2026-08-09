/**
 * Grounding for the "any doubts?" step. This is the one place AI touches
 * the Quantity Calculation tool at all - everything else is the
 * deterministic formula engine in formulas.ts. Two hard boundaries this
 * prompt enforces, stricter than Ask Vastu's, because the stakes here are
 * different in kind, not just degree:
 *
 * 1. This AI never does arithmetic. It can explain what a measurement
 *    should include, it cannot compute a quantity - that stays the
 *    deterministic engine's job, always. Blurring this is exactly the
 *    "AI guessing at numbers" pattern this whole tool was built to avoid.
 * 2. This AI never judges structural adequacy - "is this footing big
 *    enough," "will this beam hold," anything like it gets an immediate,
 *    unconditional redirect to a real engineer. Vastu's escalation is
 *    for when general guidance runs out. This one is a hard line, not a
 *    soft handoff after a few tries - a wrong answer here isn't a
 *    inconvenience, it's a safety question.
 */

const STAGE_METHODOLOGY_NOTES: Record<string, string> = {
  excavation_soil:
    "Excavation length and breadth are usually taken as the footing size plus working space on each side (commonly 150-300mm per side for a person to work in). Depth is measured from the existing ground level down to the founding level shown on the structural drawing.",
  pcc: "PCC length and breadth typically match the footing's own outer dimensions, sometimes with a small (75-100mm) offset beyond the footing edge. Depth is the PCC layer thickness itself - commonly 75-100mm, not the full excavation depth.",
  footing: "Footing length and breadth are the footing's actual plan dimensions from the structural drawing. Depth is the footing's own thickness, not the excavation depth or the distance to plinth level.",
  plinth_beam:
    "Plinth beam length is usually the total running length of beam around/across the plinth. Breadth and depth are the beam's actual cross-section dimensions from the drawing, not the room dimensions the beam runs along.",
  column:
    "Column length and breadth are the column's cross-section dimensions (e.g., 9in x 9in), not the room size. Depth here means the column's height for that floor - floor-to-floor height, not overall building height. The 'how many' field is for the number of columns with this same size on this floor - columns of a different size need their own separate entry.",
  brickwork:
    "Brickwork length is the wall's running length. Breadth (asked as 'Height') is the wall's height for that floor. Depth (asked as 'Thickness') is the wall thickness - commonly 4.5in (half-brick/9in-equivalent) or 9in (full-brick) depending on whether it's a partition or an external wall. Door and window openings are traditionally subtracted separately if being precise - this tool's single-entry model does not subtract openings automatically, so a person working to a tighter estimate may want to reduce their entered wall area to account for openings.",
  lintel: "Lintel length is the opening's width plus bearing on each side (commonly 150-230mm bearing per side onto the wall). Breadth and depth are the lintel's actual cross-section from the drawing.",
  slab_beam:
    "Slab length and breadth are the room's clear span plus bearing onto the supporting walls/beams. Depth (asked as 'Thickness') is the slab's own thickness - commonly 100-150mm for a residential slab, from the structural drawing if one exists. Beams within the same pour are a separate, smaller volume not captured by the slab dimensions alone - a person wanting a fully precise number may want to run beams as their own separate entry using the same tool.",
  plastering:
    "Plastering length and breadth (asked as 'Height') describe the wall surface being plastered, not the wall's structural dimensions - so length here is the same running wall length as brickwork, but height should reflect the actual plastered surface height, and depth (asked as 'Thickness') is the plaster coat thickness itself (commonly 12-15mm), not the wall thickness.",
};

export function buildQuantityDoubtSystemPrompt(stageLabel: string, stageGroupKey: string): string {
  const note = STAGE_METHODOLOGY_NOTES[stageGroupKey] ?? "";

  return `You are a measurement-methodology helper inside ADRITH's RCC Quantity Calculation tool, currently helping with the "${stageLabel}" stage. Someone is about to enter Length, Breadth, and Depth measurements and has a doubt before doing so.

HARD RULE 1 - never do arithmetic. You do not calculate volumes, weights, bag counts, or any quantity. If asked to compute something, explain what the tool's own calculator will do with the numbers once entered - do not produce a number yourself, even as a rough approximation. That calculation is a separate, verified, deterministic engine - your only job is helping someone understand what to measure and how, not producing the result.

HARD RULE 2 - never judge structural adequacy. Any question resembling "is this big enough," "will this hold," "is this safe," or anything requiring real engineering judgment about a specific structure gets an immediate, direct answer that this needs a real engineer's review - not a hedge, not a "probably," a clear redirect to talk to Adrith or their project's actual engineer before proceeding. This is not the same as Vastu's "ask after a few tries" - here it's every time, immediately, for this category of question.

WHAT YOU CAN HELP WITH: what a measurement should include or exclude, where to measure from, common conventions for this specific stage, and general methodology - grounded in the note below, which is itself grounded in the same researched reference the calculator's formulas use.

${note ? `METHODOLOGY NOTE FOR THIS STAGE:\n${note}\n` : ""}
Keep answers short and concrete. If the note above doesn't cover the question, say so honestly rather than guessing at a convention - and if it's genuinely a judgment call for their specific site, say that plainly too.`;
}
