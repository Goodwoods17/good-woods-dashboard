import { getStroke } from "perfect-freehand";
import type { AnnotationType } from "@shared/lib/types";

export const PEN_COLORS = ["#1A1916", "#B5544C", "#547DAB"] as const; // black, red, blue
export const HIGHLIGHTER_COLORS = ["#C99846", "#6B8E5C"] as const; // amber, sage (semi)
export const PEN_SIZE = 6;
export const HIGHLIGHTER_SIZE = 22;

export function appendPoint(
  points: [number, number, number][],
  x: number,
  y: number,
  pressure: number
): [number, number, number][] {
  return [...points, [x, y, pressure || 0.5]];
}

export function strokeOptions(type: AnnotationType, size: number) {
  return type === "highlight"
    ? { size, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, last: true }
    : { size, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: true, last: true };
}

/** Denormalize points to pixel space, run perfect-freehand, return an SVG path `d` (filled outline). */
export function strokePathData(
  points: [number, number, number][],
  width: number,
  height: number,
  type: AnnotationType,
  size: number
): string {
  if (points.length === 0) return "";
  const input = points.map(([x, y, p]) => [x * width, y * height, p] as number[]);
  const outline = getStroke(input, strokeOptions(type, size));
  if (outline.length === 0) return "";
  const d = outline.reduce(
    (acc, [x, y], i) => acc + (i === 0 ? `M ${x} ${y} ` : `L ${x} ${y} `),
    ""
  );
  return `${d}Z`;
}
