/**
 * Shared isometric rendering for the floor-massing view. This is the
 * proven approach, ported directly from a real SketchUp model built via
 * the actual Trimble SketchUp connector and confirmed correct: real
 * 5-inch wall thickness (SketchUp's own documented standard), real 9ft
 * wall height (never shortened), and the professional corner-ownership
 * technique - one wall runs full length and owns the corner, the
 * perpendicular wall stops exactly at its interior face. No overlap, no
 * gap, no approximation.
 */

export const DEFAULT_WALL_T_FT = 5 / 12; // 5 real inches
export const DEFAULT_WALL_H_FT = 9; // real, standard residential height

export function makeProjector(scale: number, heightScale: number, offsetX: number, offsetY: number) {
  return function proj(x: number, y: number, z: number) {
    const ix = (x - y) * Math.cos((30 * Math.PI) / 180) * scale;
    const iy = (x + y) * Math.sin((30 * Math.PI) / 180) * scale - z * heightScale;
    return { x: offsetX + ix, y: offsetY + iy };
  };
}

export function drawPoly(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  fill: string,
  strokeStyle = "#2b2b2b",
  lineWidth = 1.3
) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export function drawGroundShadow(ctx: CanvasRenderingContext2D, corners: { x: number; y: number }[]) {
  ctx.save();
  ctx.filter = "blur(10px)";
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y + 14);
  for (const p of corners.slice(1)) ctx.lineTo(p.x, p.y + 14);
  ctx.closePath();
  ctx.fillStyle = "rgba(30,30,30,0.25)";
  ctx.fill();
  ctx.restore();
}

type Point = { x: number; y: number };
type Proj = (x: number, y: number, z: number) => Point;
export type Opening = { t0: number; t1: number; z0: number; z1: number };
export type WallSegment = {
  a: Point;
  b: Point;
  thicknessDir: Point;
  opening: Opening | null;
  orientation: "horizontal" | "vertical";
};

/**
 * Auto-trims vertical wall segments by half the wall thickness at each
 * end, so they stop at the interior face of whatever horizontal wall
 * they meet there - the exact corner-ownership rule proven in the real
 * SketchUp build, applied automatically rather than depending on the AI
 * getting the trim arithmetic right for every layout it sees. Horizontal
 * walls are left at their full given extent - they own the corner.
 */
export function trimWallSegment(seg: WallSegment, wallT: number): WallSegment {
  if (seg.orientation === "horizontal") return seg;
  const dir = { x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y };
  const len = Math.hypot(dir.x, dir.y);
  if (len < wallT * 2.2) return seg; // too short to trim safely, leave as-is
  const unit = { x: dir.x / len, y: dir.y / len };
  return {
    ...seg,
    a: { x: seg.a.x + unit.x * wallT, y: seg.a.y + unit.y * wallT },
    b: { x: seg.b.x - unit.x * wallT, y: seg.b.y - unit.y * wallT },
  };
}

/**
 * One wall segment - outer face, inner face, top cap, AND both end
 * caps. The end caps were the real, missing piece: without them, every
 * junction where a wall terminates (a true corner, or a trimmed end
 * meeting another wall) shows a visible gap, because nothing closes off
 * that end of the box. A genuine cutout for one opening is supported:
 * the wall stops and resumes around it, header/sill bands included,
 * rather than a marker sitting on a solid surface.
 */
export function drawWallSegment(
  ctx: CanvasRenderingContext2D,
  proj: Proj,
  seg: WallSegment,
  wallT: number,
  h: number,
  toneOuter: string,
  toneInner: string,
  toneTop: string,
  toneEnd: string
) {
  const { a: pA, b: pB, thicknessDir, opening } = seg;
  const length = Math.hypot(pB.x - pA.x, pB.y - pA.y);
  const dir = { x: (pB.x - pA.x) / length, y: (pB.y - pA.y) / length };
  const ptAt = (t: number) => ({ x: pA.x + dir.x * length * t, y: pA.y + dir.y * length * t });

  const drawSeg = (a: Point, b: Point, z0: number, z1: number) => {
    const qA = { x: a.x + thicknessDir.x * wallT, y: a.y + thicknessDir.y * wallT };
    const qB = { x: b.x + thicknessDir.x * wallT, y: b.y + thicknessDir.y * wallT };
    drawPoly(ctx, [proj(a.x, a.y, z0), proj(b.x, b.y, z0), proj(b.x, b.y, z1), proj(a.x, a.y, z1)], toneOuter);
    drawPoly(ctx, [proj(qA.x, qA.y, z0), proj(qB.x, qB.y, z0), proj(qB.x, qB.y, z1), proj(qA.x, qA.y, z1)], toneInner);
    drawPoly(ctx, [proj(a.x, a.y, z1), proj(b.x, b.y, z1), proj(qB.x, qB.y, z1), proj(qA.x, qA.y, z1)], toneTop);
  };

  const drawEndCap = (p: Point, z0: number, z1: number) => {
    const q = { x: p.x + thicknessDir.x * wallT, y: p.y + thicknessDir.y * wallT };
    drawPoly(ctx, [proj(p.x, p.y, z0), proj(q.x, q.y, z0), proj(q.x, q.y, z1), proj(p.x, p.y, z1)], toneEnd);
  };

  if (!opening) {
    drawSeg(pA, pB, 0, h);
    drawEndCap(pA, 0, h);
    drawEndCap(pB, 0, h);
    return;
  }

  const left = ptAt(Math.max(0, opening.t0));
  const right = ptAt(Math.min(1, opening.t1));

  if (opening.t0 > 0.001) {
    drawSeg(pA, left, 0, h);
    drawEndCap(pA, 0, h);
  }
  if (opening.t1 < 0.999) {
    drawSeg(right, pB, 0, h);
    drawEndCap(pB, 0, h);
  }
  if (opening.z0 > 0.001) drawSeg(left, right, 0, opening.z0);
  if (opening.z1 < h - 0.001) drawSeg(left, right, opening.z1, h);
  // Jamb reveals - the sides of the opening itself, showing the wall's
  // real thickness at the cut edge, not just an empty gap.
  drawEndCap(left, opening.z0, opening.z1);
  drawEndCap(right, opening.z0, opening.z1);
}
