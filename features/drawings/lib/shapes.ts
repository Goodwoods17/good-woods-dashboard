import type { ShapeData, TextData } from "@shared/lib/types";

export type Box = { x: number; y: number; w: number; h: number };

/** Shortest distance from point (px,py) to segment (ax,ay)-(bx,by). Pixel space. Pure. */
export function pointSegDist(
  px: number, py: number, ax: number, ay: number, bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Min-corner + size of a shape's two stored corners, in normalized 0–1. */
export function normRect(s: ShapeData): Box {
  return {
    x: Math.min(s.x1, s.x2),
    y: Math.min(s.y1, s.y2),
    w: Math.abs(s.x2 - s.x1),
    h: Math.abs(s.y2 - s.y1),
  };
}

/** Pixel bbox of a shape (denormalized). */
export function shapeBounds(s: ShapeData, width: number, height: number): Box {
  const r = normRect(s);
  return { x: r.x * width, y: r.y * height, w: r.w * width, h: r.h * height };
}

/** Three pixel points (tip + two barbs) of an arrowhead at the (x2,y2) end. */
export function arrowHead(
  x1: number, y1: number, x2: number, y2: number,
  headLen: number, width: number, height: number
): [number, number][] {
  const ax = x1 * width, ay = y1 * height, bx = x2 * width, by = y2 * height;
  const ang = Math.atan2(by - ay, bx - ax);
  const spread = 0.436; // ~25°
  const a1 = ang + Math.PI - spread;
  const a2 = ang + Math.PI + spread;
  return [
    [bx, by],
    [bx + headLen * Math.cos(a1), by + headLen * Math.sin(a1)],
    [bx + headLen * Math.cos(a2), by + headLen * Math.sin(a2)],
  ];
}

/** Is point (px,py) within `tol` px of the shape? Lines/arrows: near the segment; rects: inside or on the stroke. */
export function hitTestShape(
  s: ShapeData, px: number, py: number, width: number, height: number, tol: number
): boolean {
  const ax = s.x1 * width, ay = s.y1 * height, bx = s.x2 * width, by = s.y2 * height;
  if (s.shape === "rect") {
    const x0 = Math.min(ax, bx) - tol, x1 = Math.max(ax, bx) + tol;
    const y0 = Math.min(ay, by) - tol, y1 = Math.max(ay, by) + tol;
    return px >= x0 && px <= x1 && py >= y0 && py <= y1;
  }
  return pointSegDist(px, py, ax, ay, bx, by) <= tol;
}

/** Pixel bbox of a text note. y is the TOP (hanging baseline); box extends downward. */
export function textBounds(
  t: TextData, width: number, height: number,
  measure?: (text: string, fontPx: number) => number
): Box {
  const fontPx = t.fontSize * height;
  const w = measure ? measure(t.text, fontPx) : Math.max(1, t.text.length) * fontPx * 0.6;
  return { x: t.x * width, y: t.y * height, w, h: fontPx };
}

/** Point-in-box test with optional tolerance. */
export function boxContains(b: Box, px: number, py: number, tol = 0): boolean {
  return px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol;
}
