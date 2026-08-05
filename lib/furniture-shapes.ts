/**
 * Composite furniture shapes for Furniture Layout - built directly from
 * studying the firm's own real SketchUp reference work: a bed is a
 * headboard + mattress + pillow + throw, not one flat box; a wardrobe
 * shows real door-panel divisions; a dining set has an actual table
 * with chairs around it; a kitchen counter has a sink and cabinets.
 * Each shape function takes the item's footprint (in the same feet-based
 * coordinate space as the room) and draws every part itself.
 */

import { drawPoly } from "./isometric-render";

function shade(hex: string, factor: number): string {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return `rgb(${r},${g},${b})`;
}

type Proj = (x: number, y: number, z: number) => { x: number; y: number };

function box(
  ctx: CanvasRenderingContext2D,
  proj: Proj,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  fill: string
) {
  const top = [proj(x0, y0, z1), proj(x1, y0, z1), proj(x1, y1, z1), proj(x0, y1, z1)];
  const front = [proj(x0, y1, z0), proj(x1, y1, z0), proj(x1, y1, z1), proj(x0, y1, z1)];
  const side = [proj(x1, y0, z0), proj(x1, y1, z0), proj(x1, y1, z1), proj(x1, y0, z1)];
  drawPoly(ctx, front, shade(fill, 0.65));
  drawPoly(ctx, side, shade(fill, 0.85));
  drawPoly(ctx, top, shade(fill, 1.1));
}

/** Headboard + mattress + pillow + folded throw - not a flat box. */
function drawBed(ctx: CanvasRenderingContext2D, proj: Proj, x: number, y: number, w: number, d: number) {
  const HB_H = 3.2,
    HB_T = 0.35,
    MAT_H = 1.4;
  box(ctx, proj, x, y, x + w, y + HB_T, 0, HB_H, "#5a3d2e");
  box(ctx, proj, x, y + HB_T, x + w, y + d, 0, MAT_H, "#f2ede4");
  box(ctx, proj, x + w * 0.12, y + HB_T + 0.1, x + w * 0.88, y + HB_T + d * 0.28, MAT_H, MAT_H + 0.35, "#faf7f2");
  box(ctx, proj, x + 0.05, y + d * 0.62, x + w - 0.05, y + d * 0.85, MAT_H, MAT_H + 0.15, "#8a8580");
}

/** A tall cabinet with real vertical door-panel divisions on its front face. */
function drawWardrobe(ctx: CanvasRenderingContext2D, proj: Proj, x: number, y: number, w: number, d: number) {
  const h = 6.5;
  box(ctx, proj, x, y, x + w, y + d, 0, h, "#4a3527");
  const nPanels = Math.max(2, Math.round(w / 1.3));
  ctx.strokeStyle = "#2a1c12";
  ctx.lineWidth = 1.5;
  for (let i = 1; i < nPanels; i++) {
    const px = x + (w * i) / nPanels;
    const p0 = proj(px, y + d, 0.3);
    const p1 = proj(px, y + d, h - 0.3);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
}

/** Seat + backrest, oriented to face inward toward whatever it's pulled up to. */
function drawChair(
  ctx: CanvasRenderingContext2D,
  proj: Proj,
  cx: number,
  cy: number,
  facing: "north" | "south" | "east" | "west",
  color: string
) {
  const S = 1.4,
    SEAT_H = 1.5,
    BACK_H = 1.2;
  box(ctx, proj, cx - S / 2, cy - S / 2, cx + S / 2, cy + S / 2, 0, SEAT_H, color);
  if (facing === "south") box(ctx, proj, cx - S / 2, cy - S / 2, cx + S / 2, cy - S / 2 + 0.15, SEAT_H, SEAT_H + BACK_H, color);
  else if (facing === "north") box(ctx, proj, cx - S / 2, cy + S / 2 - 0.15, cx + S / 2, cy + S / 2, SEAT_H, SEAT_H + BACK_H, color);
  else if (facing === "east") box(ctx, proj, cx - S / 2, cy - S / 2, cx - S / 2 + 0.15, cy + S / 2, SEAT_H, SEAT_H + BACK_H, color);
  else box(ctx, proj, cx + S / 2 - 0.15, cy - S / 2, cx + S / 2, cy + S / 2, SEAT_H, SEAT_H + BACK_H, color);
}

/** A table on 4 legs, with one chair pulled up to it. */
function drawStudyTable(ctx: CanvasRenderingContext2D, proj: Proj, x: number, y: number, w: number, d: number) {
  const TOP_H = 2.4,
    leg = 0.15;
  box(ctx, proj, x, y, x + w, y + d, TOP_H - 0.15, TOP_H, "#6b4a35");
  for (const [lx, ly] of [
    [x + leg, y + leg],
    [x + w - leg, y + leg],
    [x + leg, y + d - leg],
    [x + w - leg, y + d - leg],
  ]) {
    box(ctx, proj, lx - leg, ly - leg, lx + leg, ly + leg, 0, TOP_H - 0.15, "#4a3527");
  }
  drawChair(ctx, proj, x + w / 2, y + d + 1.0, "north", "#3a3a3a");
}

/** A dining table on 4 legs, with chairs around every side. */
function drawDiningSet(ctx: CanvasRenderingContext2D, proj: Proj, x: number, y: number, w: number, d: number) {
  const TOP_H = 2.5,
    leg = 0.15;
  box(ctx, proj, x, y, x + w, y + d, TOP_H - 0.15, TOP_H, "#8a6a45");
  for (const [lx, ly] of [
    [x + leg, y + leg],
    [x + w - leg, y + leg],
    [x + leg, y + d - leg],
    [x + w - leg, y + d - leg],
  ]) {
    box(ctx, proj, lx - leg, ly - leg, lx + leg, ly + leg, 0, TOP_H - 0.15, "#6b4a30");
  }
  for (let i = 0; i < 2; i++) {
    const cx = x + w * (0.3 + 0.4 * i);
    drawChair(ctx, proj, cx, y - 1.0, "south", "#2a2a2a");
    drawChair(ctx, proj, cx, y + d + 1.0, "north", "#2a2a2a");
  }
  drawChair(ctx, proj, x - 1.0, y + d / 2, "east", "#2a2a2a");
  drawChair(ctx, proj, x + w + 1.0, y + d / 2, "west", "#2a2a2a");
}

/** A counter run with a dark countertop, an inset sink, and upper cabinets. */
function drawKitchenCounter(ctx: CanvasRenderingContext2D, proj: Proj, x: number, y: number, w: number, d: number) {
  const COUNTER_H = 3.0;
  box(ctx, proj, x, y, x + w, y + d, 0, COUNTER_H, "#c9a876");
  box(ctx, proj, x, y, x + w, y + d, COUNTER_H, COUNTER_H + 0.2, "#1a1a1a");
  const sinkW = Math.min(1.8, w * 0.3);
  box(ctx, proj, x + w * 0.55, y + d * 0.2, x + w * 0.55 + sinkW, y + d * 0.8, COUNTER_H - 0.05, COUNTER_H + 0.05, "#d8d8d8");
  box(ctx, proj, x, y, x + w * 0.6, y + d * 0.8, COUNTER_H + 3.0, COUNTER_H + 4.6, "#c9a876");
}

/** A low sofa with a raised back panel and armrests on each end. */
function drawSofa(ctx: CanvasRenderingContext2D, proj: Proj, x: number, y: number, w: number, d: number) {
  const SEAT_H = 1.6,
    BACK_H = 1.4,
    ARM_W = 0.5;
  box(ctx, proj, x, y, x + w, y + d, 0, SEAT_H, "#5a6a6a");
  box(ctx, proj, x, y, x + w, y + 0.3, SEAT_H, SEAT_H + BACK_H, "#4a5858");
  box(ctx, proj, x, y, x + ARM_W, y + d, SEAT_H, SEAT_H + 0.8, "#4a5858");
  box(ctx, proj, x + w - ARM_W, y, x + w, y + d, SEAT_H, SEAT_H + 0.8, "#4a5858");
}

/** A generic labeled box, for any furniture type without a dedicated shape. */
function drawGeneric(ctx: CanvasRenderingContext2D, proj: Proj, x: number, y: number, w: number, d: number, h: number, color: string) {
  box(ctx, proj, x, y, x + w, y + d, 0, h, color);
}

export type FurniturePiece = {
  type: string;
  x: number;
  y: number;
  w: number;
  d: number;
};

/** Dispatches to the right composite shape based on the AI-provided type. */
export function drawFurniturePiece(
  ctx: CanvasRenderingContext2D,
  proj: Proj,
  piece: FurniturePiece,
  fallbackColor: string,
  fallbackHeight: number
) {
  const { type, x, y, w, d } = piece;
  const t = type.toLowerCase();
  if (t.includes("bed")) drawBed(ctx, proj, x, y, w, d);
  else if (t.includes("wardrobe") || t.includes("closet") || t.includes("cupboard")) drawWardrobe(ctx, proj, x, y, w, d);
  else if (t.includes("study") || t.includes("desk")) drawStudyTable(ctx, proj, x, y, w, d);
  else if (t.includes("dining")) drawDiningSet(ctx, proj, x, y, w, d);
  else if (t.includes("kitchen") || t.includes("counter") || t.includes("island")) drawKitchenCounter(ctx, proj, x, y, w, d);
  else if (t.includes("sofa") || t.includes("couch")) drawSofa(ctx, proj, x, y, w, d);
  else if (t.includes("chair")) drawChair(ctx, proj, x + w / 2, y + d / 2, "south", "#3a3a3a");
  else drawGeneric(ctx, proj, x, y, w, d, fallbackHeight, fallbackColor);
}
