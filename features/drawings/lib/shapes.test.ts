import { describe, it, expect } from "vitest";
import type { ShapeData, TextData } from "@shared/lib/types";
import { pointSegDist, normRect, arrowHead, hitTestShape, textBounds } from "./shapes";

describe("shapes geometry", () => {
  it("pointSegDist: distance to a horizontal segment", () => {
    // segment (0,0)->(10,0); point (5,3) is 3 away; point (-5,0) clamps to (0,0) = 5
    expect(pointSegDist(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
    expect(pointSegDist(-5, 0, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it("normRect normalizes inverted corners", () => {
    const s: ShapeData = { shape: "rect", x1: 0.8, y1: 0.9, x2: 0.2, y2: 0.3 };
    const r = normRect(s);
    expect(r.x).toBeCloseTo(0.2);
    expect(r.y).toBeCloseTo(0.3);
    expect(r.w).toBeCloseTo(0.6);
    expect(r.h).toBeCloseTo(0.6);
  });

  it("arrowHead returns 3 points (tip + 2 barbs)", () => {
    const pts = arrowHead(0.1, 0.5, 0.5, 0.5, 12, 1000, 800);
    expect(pts.length).toBe(3);
    // tip is the denormalized end point
    expect(pts[0][0]).toBeCloseTo(500);
    expect(pts[0][1]).toBeCloseTo(400);
  });

  it("hitTestShape: near a line is a hit, far is a miss", () => {
    const line: ShapeData = { shape: "line", x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 };
    // y=0.5 → 400px; a point at 405px is within 8px tol
    expect(hitTestShape(line, 500, 405, 1000, 800, 8)).toBe(true);
    expect(hitTestShape(line, 500, 500, 1000, 800, 8)).toBe(false);
  });

  it("hitTestShape: tapping inside a rect selects it", () => {
    const rect: ShapeData = { shape: "rect", x1: 0.2, y1: 0.2, x2: 0.6, y2: 0.6 };
    expect(hitTestShape(rect, 400, 320, 1000, 800, 8)).toBe(true); // inside
    expect(hitTestShape(rect, 50, 50, 1000, 800, 8)).toBe(false); // outside
  });

  it("textBounds returns a pixel box anchored above the baseline", () => {
    const t: TextData = { x: 0.1, y: 0.5, text: "abcd", fontSize: 0.025 };
    const b = textBounds(t, 1000, 800);
    expect(b.x).toBeCloseTo(100);
    expect(b.h).toBeGreaterThan(0);
    expect(b.w).toBeGreaterThan(0);
  });
});
