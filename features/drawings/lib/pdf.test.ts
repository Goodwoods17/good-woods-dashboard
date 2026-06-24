import { describe, it, expect } from "vitest";
import { clampScale } from "./pdf";

describe("clampScale", () => {
  it("clamps below 0.5 up to 0.5", () => expect(clampScale(0.1)).toBe(0.5));
  it("clamps above 4 down to 4", () => expect(clampScale(99)).toBe(4));
  it("passes a normal scale through", () => expect(clampScale(1.5)).toBe(1.5));
});
