import { describe, it, expect } from "vitest";
import { strokePathData, appendPoint, PEN_COLORS } from "./strokes";

describe("strokes", () => {
  it("builds a non-empty SVG path from points", () => {
    const pts: [number, number, number][] = [
      [0.1, 0.1, 0.5],
      [0.2, 0.2, 0.5],
      [0.3, 0.25, 0.5],
    ];
    const d = strokePathData(pts, 1000, 800, "ink", 8);
    expect(typeof d).toBe("string");
    expect(d.length).toBeGreaterThan(0);
    expect(d.startsWith("M")).toBe(true);
  });
  it("returns empty path for no points", () => {
    expect(strokePathData([], 1000, 800, "ink", 8)).toBe("");
  });
  it("appendPoint adds a normalized point with pressure", () => {
    expect(appendPoint([], 0.5, 0.25, 0.7)).toEqual([[0.5, 0.25, 0.7]]);
  });
  it("ships a fixed pen palette", () => {
    expect(PEN_COLORS.length).toBeGreaterThanOrEqual(3);
  });
});
