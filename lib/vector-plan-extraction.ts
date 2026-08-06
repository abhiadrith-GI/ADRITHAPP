/**
 * Direct vector extraction of wall geometry from a CAD-exported PDF.
 *
 * This replaces AI-vision guessing for the actual wall positions. A real
 * vector PDF contains exact line-drawing commands with precise
 * coordinates - there's no need to ask a model to look at a picture and
 * estimate where walls are when the exact geometry is already in the
 * file. Verified directly against a real client floor plan: this
 * approach reconstructs the actual wall structure with real precision,
 * including a genuine bug found and fixed along the way (curve
 * commands were being misread as fixed-length, corrupting downstream
 * data any time the file used one).
 *
 * What this does NOT do: read room labels or dimension text. Some PDF
 * exports flatten that text into vector outlines rather than real,
 * extractable text - confirmed true for at least one real file - so
 * label reading stays a (much narrower, more constrained) vision task,
 * handled separately.
 */

export type RawSegment = { x0: number; y0: number; x1: number; y1: number; lineWidth: number; stroke: string };
export type Centerline = {
  orientation: "horizontal" | "vertical";
  pos: number; // y for horizontal, x for vertical
  spanStart: number;
  spanEnd: number;
  thickness: number; // in PDF points; null-thickness (unpaired) lines default to a typical value
};
export type TextItem = { text: string; x: number; y: number };

type PDFOperatorList = { fnArray: number[]; argsArray: unknown[] };
type PDFPageForSegments = { getOperatorList(): Promise<PDFOperatorList> };
type PDFPageForText = { getTextContent(): Promise<{ items: unknown[] }> };

/** pdfjs-dist OPS codes for the operations this extraction cares about. */
type OpsSubset = {
  save: number;
  restore: number;
  transform: number;
  setLineWidth: number;
  setStrokeRGBColor: number;
  constructPath: number;
};

function mulMatrix(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}
function applyMatrix(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Walks the raw operator list, tracking the transform state correctly,
 * and extracts every real line segment - including proper handling of
 * curve commands (opcode 2, a cubic bezier consuming 6 following
 * values), approximated as a straight line from start to actual end
 * point, which is exactly right for anything that's really a straight
 * wall exported as a degenerate curve. This variable-length handling is
 * the fix for a real bug: assuming every path command was a fixed
 * length silently corrupted any data after the first curve in a file.
 */
export async function extractRawSegments(page: PDFPageForSegments, OPS: OpsSubset): Promise<RawSegment[]> {
  const opList = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack: number[][] = [];
  let currentLineWidth = 1;
  let currentStroke = "#000000";
  const segments: RawSegment[] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as number[] & { 0: number; 1: [Float32Array] };
    if (fn === OPS.save) ctmStack.push(ctm);
    else if (fn === OPS.restore) ctm = ctmStack.pop() || ctm;
    else if (fn === OPS.transform) ctm = mulMatrix(args as unknown as number[], ctm);
    else if (fn === OPS.setLineWidth) currentLineWidth = (args as unknown as number[])[0];
    else if (fn === OPS.setStrokeRGBColor) currentStroke = (args as unknown as [string])[0];
    else if (fn === OPS.constructPath) {
      const flat = (args as unknown as [unknown, [Float32Array]])[1][0];
      let cur: [number, number] | null = null;
      let k = 0;
      while (k < flat.length) {
        const opcode = flat[k];
        if (opcode === 0) {
          const p = applyMatrix(ctm, flat[k + 1], flat[k + 2]);
          cur = p;
          k += 3;
        } else if (opcode === 1) {
          const p = applyMatrix(ctm, flat[k + 1], flat[k + 2]);
          if (cur) segments.push({ x0: cur[0], y0: cur[1], x1: p[0], y1: p[1], lineWidth: currentLineWidth, stroke: currentStroke });
          cur = p;
          k += 3;
        } else if (opcode === 2) {
          const p = applyMatrix(ctm, flat[k + 5], flat[k + 6]);
          if (cur) segments.push({ x0: cur[0], y0: cur[1], x1: p[0], y1: p[1], lineWidth: currentLineWidth, stroke: currentStroke });
          cur = p;
          k += 7;
        } else {
          break; // unknown opcode - stop this path rather than risk corrupting more data
        }
      }
    }
  }
  return segments;
}

/** Extracts real, positioned text items - used for whatever text genuinely is real PDF text (not vector-outlined). */
export async function extractTextItems(page: PDFPageForText): Promise<TextItem[]> {
  const content = await page.getTextContent();
  return content.items
    .filter((item): item is { str: string; transform: number[] } => {
      const i = item as { str?: unknown; transform?: unknown };
      return typeof i.str === "string" && Array.isArray(i.transform);
    })
    .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] }))
    .filter((i) => i.text.trim().length > 0);
}

/**
 * Identifies the outermost site/plot boundary rectangle so it can be
 * excluded - it's a property line, not a wall. Detected by touching the
 * segment population's own overall bounding box edges directly, rather
 * than a guessed coordinate, so this generalizes to any real sheet.
 */
function findOuterBoundary(segments: RawSegment[]) {
  const xs = segments.flatMap((s) => [s.x0, s.x1]);
  const ys = segments.flatMap((s) => [s.y0, s.y1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * Cleans raw segments down to real walls: drops the outer site boundary,
 * drops the title-block cluster (a tight, low band of many short lines
 * near one edge - detected structurally, not by a fixed coordinate),
 * and drops short hatching/texture fragments.
 */
export function filterToWalls(segments: RawSegment[], minWallLength = 20): RawSegment[] {
  const bounds = findOuterBoundary(segments);
  const tol = 3;
  const isOuterBoundary = (s: RawSegment) => {
    const xs = [s.x0, s.x1],
      ys = [s.y0, s.y1];
    const onVerticalEdge =
      (Math.abs(Math.min(...xs) - bounds.minX) < tol && Math.abs(Math.max(...xs) - bounds.minX) < tol) ||
      (Math.abs(Math.min(...xs) - bounds.maxX) < tol && Math.abs(Math.max(...xs) - bounds.maxX) < tol);
    const onHorizontalEdge =
      (Math.abs(Math.min(...ys) - bounds.minY) < tol && Math.abs(Math.max(...ys) - bounds.minY) < tol) ||
      (Math.abs(Math.min(...ys) - bounds.maxY) < tol && Math.abs(Math.max(...ys) - bounds.maxY) < tol);
    const isVertical = Math.abs(s.x0 - s.x1) < tol;
    const isHorizontal = Math.abs(s.y0 - s.y1) < tol;
    return (onVerticalEdge && isVertical) || (onHorizontalEdge && isHorizontal);
  };

  // Title block: find the densest low band of short segments near the
  // bottom edge (PDF's native y-axis runs bottom-to-top) - real title
  // blocks are always a compact table, not spread through the plan.
  const nearBottomShort = segments.filter((s) => {
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    return len < 150 && Math.min(s.y0, s.y1) < bounds.minY + (bounds.maxY - bounds.minY) * 0.15;
  });
  const titleBlockMaxY =
    nearBottomShort.length > 10 ? Math.max(...nearBottomShort.flatMap((s) => [s.y0, s.y1])) + 8 : bounds.minY;

  return segments.filter((s) => {
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    if (len <= minWallLength) return false;
    if (isOuterBoundary(s)) return false;
    if (Math.min(s.y0, s.y1) <= titleBlockMaxY) return false;
    return true;
  });
}

/**
 * Finds every distinct, large closed rectangle formed by the wall
 * centerlines - not just the single outermost one. A real plan sheet
 * often has more than one: a site/plot boundary AND a separate house
 * boundary nested inside it, confirmed as a real, common case. Each
 * candidate becomes something a (narrow, constrained) vision step can
 * be asked to identify, rather than assuming the outermost one is
 * always the actual building.
 */
export type BoundaryCandidate = { minX: number; maxX: number; minY: number; maxY: number };

export function findBoundaryCandidates(centerlines: Centerline[]): BoundaryCandidate[] {
  const horiz = centerlines.filter((c) => c.orientation === "horizontal");
  const vert = centerlines.filter((c) => c.orientation === "vertical");
  const candidates: BoundaryCandidate[] = [];

  // A candidate rectangle is formed by a pair of horizontal lines and a
  // pair of vertical lines that plausibly close into a large loop: each
  // horizontal line's span must reach both vertical lines (and vice
  // versa), within a small tolerance for real-world imprecision.
  for (let hi = 0; hi < horiz.length; hi++) {
    for (let hj = hi + 1; hj < horiz.length; hj++) {
      const h1 = horiz[hi],
        h2 = horiz[hj];
      if (Math.abs(h1.pos - h2.pos) < 20) continue; // too close to be a real room-sized rectangle
      for (let vi = 0; vi < vert.length; vi++) {
        for (let vj = vi + 1; vj < vert.length; vj++) {
          const v1 = vert[vi],
            v2 = vert[vj];
          if (Math.abs(v1.pos - v2.pos) < 20) continue;
          const tol = 8;
          const hSpanOk = (h: Centerline) => h.spanStart <= Math.min(v1.pos, v2.pos) + tol && h.spanEnd >= Math.max(v1.pos, v2.pos) - tol;
          const vSpanOk = (v: Centerline) => v.spanStart <= Math.min(h1.pos, h2.pos) + tol && v.spanEnd >= Math.max(h1.pos, h2.pos) - tol;
          if (hSpanOk(h1) && hSpanOk(h2) && vSpanOk(v1) && vSpanOk(v2)) {
            candidates.push({
              minX: Math.min(v1.pos, v2.pos),
              maxX: Math.max(v1.pos, v2.pos),
              minY: Math.min(h1.pos, h2.pos),
              maxY: Math.max(h1.pos, h2.pos),
            });
          }
        }
      }
    }
  }

  // Deduplicate near-identical candidates and keep only distinct ones
  // (different enough in size/position to genuinely be separate options).
  const distinct: BoundaryCandidate[] = [];
  for (const c of candidates.sort((a, b) => (b.maxX - b.minX) * (b.maxY - b.minY) - (a.maxX - a.minX) * (a.maxY - a.minY))) {
    const isDup = distinct.some((d) => Math.abs(d.minX - c.minX) < 15 && Math.abs(d.maxX - c.maxX) < 15 && Math.abs(d.minY - c.minY) < 15 && Math.abs(d.maxY - c.maxY) < 15);
    if (!isDup) distinct.push(c);
  }
  return distinct.slice(0, 4); // a handful of largest candidates is plenty
}

export function mergeToCenterlines(segments: RawSegment[]): Centerline[] {
  const horiz = segments.filter((s) => Math.abs(s.y0 - s.y1) < 2);
  const vert = segments.filter((s) => Math.abs(s.x0 - s.x1) < 2);
  const DEFAULT_THICKNESS = 4; // used only for genuinely unpaired lines

  function mergeGroup(group: RawSegment[], isHoriz: boolean, tolerance = 8): Centerline[] {
    const used = new Array(group.length).fill(false);
    const out: Centerline[] = [];
    for (let i = 0; i < group.length; i++) {
      if (used[i]) continue;
      const s1 = group[i];
      const pos1 = isHoriz ? s1.y0 : s1.x0;
      const span1: [number, number] = isHoriz ? [Math.min(s1.x0, s1.x1), Math.max(s1.x0, s1.x1)] : [Math.min(s1.y0, s1.y1), Math.max(s1.y0, s1.y1)];
      let bestJ = -1,
        bestDist = tolerance + 1;
      for (let j = i + 1; j < group.length; j++) {
        if (used[j]) continue;
        const s2 = group[j];
        const pos2 = isHoriz ? s2.y0 : s2.x0;
        const span2: [number, number] = isHoriz ? [Math.min(s2.x0, s2.x1), Math.max(s2.x0, s2.x1)] : [Math.min(s2.y0, s2.y1), Math.max(s2.y0, s2.y1)];
        const overlap = Math.min(span1[1], span2[1]) - Math.max(span1[0], span2[0]);
        if (overlap > 5 && Math.abs(pos1 - pos2) < bestDist) {
          bestJ = j;
          bestDist = Math.abs(pos1 - pos2);
        }
      }
      if (bestJ >= 0) {
        const s2 = group[bestJ];
        used[i] = used[bestJ] = true;
        const pos2 = isHoriz ? s2.y0 : s2.x0;
        const span2: [number, number] = isHoriz ? [Math.min(s2.x0, s2.x1), Math.max(s2.x0, s2.x1)] : [Math.min(s2.y0, s2.y1), Math.max(s2.y0, s2.y1)];
        out.push({
          orientation: isHoriz ? "horizontal" : "vertical",
          pos: (pos1 + pos2) / 2,
          spanStart: Math.min(span1[0], span2[0]),
          spanEnd: Math.max(span1[1], span2[1]),
          thickness: bestDist,
        });
      } else {
        used[i] = true;
        out.push({ orientation: isHoriz ? "horizontal" : "vertical", pos: pos1, spanStart: span1[0], spanEnd: span1[1], thickness: DEFAULT_THICKNESS });
      }
    }
    return out;
  }

  return [...mergeGroup(horiz, true), ...mergeGroup(vert, false)];
}
