import { describe, it, expect } from "vitest";
import { clamp01, normalizePoint, denormalize } from "./geometry";

describe("geometry", () => {
  it("clamps to 0..1", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
  it("normalizes a click within an element", () => {
    expect(normalizePoint(50, 25, 100, 100)).toEqual({ x: 0.5, y: 0.25 });
  });
  it("clamps out-of-bounds clicks", () => {
    expect(normalizePoint(150, -10, 100, 100)).toEqual({ x: 1, y: 0 });
  });
  it("denormalizes back to pixels", () => {
    expect(denormalize(0.5, 0.25, 200, 400)).toEqual({ left: 100, top: 100 });
  });
  it("guards a zero-sized element", () => {
    expect(normalizePoint(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});
