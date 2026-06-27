import { describe, it, expect } from "vitest";
import { nextVisibility, isClientFacing, VISIBILITY_LABELS, VISIBILITY_SHORT_LABELS } from "./visibilityPill";

describe("nextVisibility", () => {
  it("cycles owner → client", () => {
    expect(nextVisibility("owner")).toBe("client");
  });
  it("cycles client → both", () => {
    expect(nextVisibility("client")).toBe("both");
  });
  it("cycles both → owner (wraps around)", () => {
    expect(nextVisibility("both")).toBe("owner");
  });
  it("forms a complete cycle of length 3", () => {
    const cycle = ["owner", nextVisibility("owner"), nextVisibility(nextVisibility("owner"))];
    expect(new Set(cycle).size).toBe(3);
    expect(nextVisibility(nextVisibility(nextVisibility("owner")))).toBe("owner");
  });
});

describe("isClientFacing", () => {
  it("returns false for owner", () => {
    expect(isClientFacing("owner")).toBe(false);
  });
  it("returns true for client", () => {
    expect(isClientFacing("client")).toBe(true);
  });
  it("returns true for both", () => {
    expect(isClientFacing("both")).toBe(true);
  });
});

describe("VISIBILITY_LABELS", () => {
  it("has a non-empty label for owner", () => {
    expect(VISIBILITY_LABELS.owner).toBeTruthy();
  });
  it("has a non-empty label for client", () => {
    expect(VISIBILITY_LABELS.client).toBeTruthy();
  });
  it("has a non-empty label for both", () => {
    expect(VISIBILITY_LABELS.both).toBeTruthy();
  });
  it("labels are all distinct", () => {
    expect(new Set(Object.values(VISIBILITY_LABELS)).size).toBe(3);
  });
});

describe("VISIBILITY_SHORT_LABELS", () => {
  it("has a short label for each value", () => {
    expect(VISIBILITY_SHORT_LABELS.owner).toBeTruthy();
    expect(VISIBILITY_SHORT_LABELS.client).toBeTruthy();
    expect(VISIBILITY_SHORT_LABELS.both).toBeTruthy();
  });
  it("short labels are all distinct", () => {
    expect(new Set(Object.values(VISIBILITY_SHORT_LABELS)).size).toBe(3);
  });
});
