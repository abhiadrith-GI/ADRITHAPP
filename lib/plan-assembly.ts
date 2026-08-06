/**
 * Combines exact vector-extracted wall geometry with AI's narrow
 * confirmation of the true building boundary, overall dimensions, and
 * room labels - producing the final wall-segment list in real feet for
 * rendering. AI never guesses wall positions; it only confirms which
 * extracted rectangle (if any) is the real building versus a site/plot
 * boundary, and provides the real-world scale and labels.
 */

import type { Centerline, BoundaryCandidate } from "./vector-plan-extraction";
import { trimWallSegment, type WallSegment } from "./isometric-render";

export type PlanAnalysis = {
  matched_candidate: string | null;
  true_building_bounds: { minXPct: number; maxXPct: number; minYPct: number; maxYPct: number } | null;
  overall_width_ft: number;
  overall_depth_ft: number;
  wall_height_ft: number;
  room_labels: { label: string; x_pct: number; y_pct: number }[];
  notes: string;
};

function pctBoundsToPoints(
  bounds: { minXPct: number; maxXPct: number; minYPct: number; maxYPct: number },
  imageWidthPt: number,
  imageHeightPt: number
): BoundaryCandidate {
  return {
    minX: (bounds.minXPct / 100) * imageWidthPt,
    maxX: (bounds.maxXPct / 100) * imageWidthPt,
    minY: (bounds.minYPct / 100) * imageHeightPt,
    maxY: (bounds.maxYPct / 100) * imageHeightPt,
  };
}

export function assembleWallPlan(
  centerlines: Centerline[],
  candidates: BoundaryCandidate[],
  analysis: PlanAnalysis,
  imageWidthPt: number,
  imageHeightPt: number
): { walls: WallSegment[]; overallWidthFt: number; overallDepthFt: number; roomLabels: { label: string; x: number; y: number }[] } {
  // Resolve the true building boundary: either the AI-matched candidate,
  // or AI's own directly-stated bounds when no candidate fit well.
  let bounds: BoundaryCandidate;
  if (analysis.matched_candidate && candidates.length) {
    const idx = analysis.matched_candidate.charCodeAt(0) - 65;
    bounds = candidates[idx] ?? candidates[0];
  } else if (analysis.true_building_bounds) {
    bounds = pctBoundsToPoints(analysis.true_building_bounds, imageWidthPt, imageHeightPt);
  } else {
    bounds = candidates[0] ?? { minX: 0, maxX: imageWidthPt, minY: 0, maxY: imageHeightPt };
  }

  const marginPt = ((bounds.maxX - bounds.minX) + (bounds.maxY - bounds.minY)) * 0.02; // small tolerance for real-world imprecision
  const scaleX = analysis.overall_width_ft / (bounds.maxX - bounds.minX);
  const scaleY = analysis.overall_depth_ft / (bounds.maxY - bounds.minY);
  const scale = (scaleX + scaleY) / 2; // average of two independent measurements, same validated approach proven earlier

  const toFt = (x: number, y: number): [number, number] => [(x - bounds.minX) * scale, (bounds.maxY - y) * scale];

  // Keep only extracted walls that genuinely fall within the confirmed
  // building boundary (with a small margin) - this is what filters out
  // a site/plot boundary or anything else extraction picked up outside
  // the real building.
  const relevant = centerlines.filter((c) => {
    if (c.orientation === "horizontal") {
      return c.pos >= bounds.minY - marginPt && c.pos <= bounds.maxY + marginPt && c.spanStart < bounds.maxX + marginPt && c.spanEnd > bounds.minX - marginPt;
    } else {
      return c.pos >= bounds.minX - marginPt && c.pos <= bounds.maxX + marginPt && c.spanStart < bounds.maxY + marginPt && c.spanEnd > bounds.minY - marginPt;
    }
  });

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const walls: WallSegment[] = relevant.map((c) => {
    if (c.orientation === "horizontal") {
      const [ax, ay] = toFt(c.spanStart, c.pos);
      const [bx, by] = toFt(c.spanEnd, c.pos);
      const inward: Point = c.pos > cy ? { x: 0, y: -1 } : { x: 0, y: 1 };
      const seg: WallSegment = { a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessDir: inward, opening: null, orientation: "horizontal" };
      return trimWallSegment(seg, 5 / 12);
    } else {
      const [ax, ay] = toFt(c.pos, c.spanStart);
      const [bx, by] = toFt(c.pos, c.spanEnd);
      const inward: Point = c.pos > cx ? { x: -1, y: 0 } : { x: 1, y: 0 };
      const seg: WallSegment = { a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessDir: inward, opening: null, orientation: "vertical" };
      return trimWallSegment(seg, 5 / 12);
    }
  });

  const roomLabels = analysis.room_labels.map((l) => {
    const [x, y] = toFt((l.x_pct / 100) * imageWidthPt, (l.y_pct / 100) * imageHeightPt);
    return { label: l.label, x, y };
  });

  return { walls, overallWidthFt: analysis.overall_width_ft, overallDepthFt: analysis.overall_depth_ft, roomLabels };
}

type Point = { x: number; y: number };
