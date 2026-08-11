/**
 * Grounds AI material analysis in the real reference data above - same
 * "exact data over AI guessing" discipline as every other AI-touching
 * part of this platform. The AI's job is recognition (what fixtures/
 * points does this room actually have) and description (explaining them
 * plainly) - not inventing specifications. Every material name,
 * component, wire gauge, and pipe diameter it can output must come from
 * the reference data; it doesn't get to invent a spec that isn't there.
 *
 * Resolves the open "how does it know when to ask" question directly:
 * rather than a separate input-classification step, the AI makes this
 * call itself, per item, based on what it can actually observe -
 * explicit markings/legends/dimensions on a real plan support "exact";
 * a bare floor plan or a room photo can only support "estimated." When
 * it genuinely can't tell which fixtures are present at all (not just
 * their exact spec), it asks instead of guessing - that's the one hard
 * line, not a per-item judgment call.
 */

import { PLUMBING_FIXTURES, PLUMBING_MATERIAL_NOTES, type PlumbingRoomType } from "./plumbing-reference";
import { ELECTRICAL_POINTS, ELECTRICAL_MATERIAL_NOTES, ELECTRICAL_POINT_DEFINITION, type ElectricalRoomType } from "./electrical-reference";

function buildPlumbingReferenceText(room: PlumbingRoomType): string {
  const fixtures = PLUMBING_FIXTURES[room];
  const fixtureText = fixtures
    .map((f) => {
      const parts = [`${f.name}: ${f.description}`];
      if (f.supplyPipe) parts.push(`Supply: ${f.supplyPipe.type}, ${f.supplyPipe.diameter}. ${f.supplyPipe.note}`);
      if (f.drainPipe) parts.push(`Drain: ${f.drainPipe.type}, ${f.drainPipe.diameter}. ${f.drainPipe.note}`);
      parts.push(`Components: ${f.components.join(", ")}`);
      return "- " + parts.join(" ");
    })
    .join("\n");
  const materialNotes = Object.entries(PLUMBING_MATERIAL_NOTES)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `POSSIBLE FIXTURES FOR THIS ROOM:\n${fixtureText}\n\nMATERIAL TYPE NOTES:\n${materialNotes}`;
}

function buildElectricalReferenceText(room: ElectricalRoomType): string {
  const points = ELECTRICAL_POINTS[room];
  const pointText = points
    .map((p) => `- ${p.name}: ${p.description} Wire: ${p.wireGauge}. ${p.wireNote} Typical count: ${p.typicalCount}.`)
    .join("\n");
  const materialNotes = Object.entries(ELECTRICAL_MATERIAL_NOTES)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `POSSIBLE POINTS FOR THIS ROOM:\n${pointText}\n\n${ELECTRICAL_POINT_DEFINITION}\n\nMATERIAL NOTES:\n${materialNotes}`;
}

export function buildMaterialSystemPrompt(trade: "plumbing" | "electrical", room: string): string {
  const referenceText = trade === "plumbing" ? buildPlumbingReferenceText(room as PlumbingRoomType) : buildElectricalReferenceText(room as ElectricalRoomType);

  return `You are the ${trade === "plumbing" ? "Plumbing" : "Electrical"} Material Calculator inside ADRITH, analyzing the "${room}" room specifically. You're given a photo, a real plan, or a text description, and your job is to identify which of the reference fixtures/points below are actually present (or intended) and produce a material list for them.

CRITICAL RULE: only use fixture names, components, pipe/wire specifications from the reference data below. Do not invent a fixture, component, or specification that isn't listed there, even if you believe it to be accurate - this reference has been specifically researched and verified for this platform.

CONFIDENCE, per item, your own honest judgment: mark "exact" only when the input actually shows or states the specific detail directly - real dimensions on a marked-up plan, an explicit legend, a written specification. Mark "estimated" when you're inferring from a bare floor plan, a photo, or a general description, using the reference data's typical/standard values instead. Never mark something "exact" just because you're confident in the reference data itself - confidence in the *source standard* is not the same as confidence in *what this specific input actually shows*.

WHEN TO ASK INSTEAD OF ANSWERING: if you genuinely cannot tell which fixtures or points this room actually has - not just their exact spec, but their basic presence - ask ONE clear, specific clarifying question instead of guessing. This is different from being uncertain about a detail (which just gets marked "estimated") - this is for when you'd otherwise be fabricating what's even there. Respond with exactly this shape when asking: {"type": "clarifying_question", "question": "..."}

WHEN YOU CAN ANSWER: respond with exactly this shape: {"type": "materials", "items": [{"name": "...", "quantity": "...", "description": "...", "confidence": "exact" | "estimated", "basis": "..." (only if estimated, explain what convention it's based on)}]}. Quantity should be a real, useful figure (e.g., "8 metres", "1", "3 points") - for pipe length specifically, only give an exact figure if the input shows real dimensions; otherwise either estimate from typical room proportions and mark it "estimated" with the basis stated, or fold pipe length into the clarifying question if you have no reasonable basis at all.

Respond with ONLY the JSON object, no other text - no acknowledgment, no summary of what you understood, nothing before or after it. This applies to every turn of the conversation, not just your first reply: even after several exchanges, your response is still only ever the JSON object itself.

${referenceText}`;
}
