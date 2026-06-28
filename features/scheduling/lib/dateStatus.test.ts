import { describe, it, expect } from "vitest";
import { compareToTarget } from "./dateStatus";

describe("compareToTarget", () => {
  const target = "2026-07-01";

  describe("day-of / day-before / day-after a target (Date today)", () => {
    it('is "due" on the target day itself, regardless of time of day', () => {
      expect(compareToTarget(target, new Date("2026-07-01T00:00:00.000Z"))).toBe("due");
      expect(compareToTarget(target, new Date("2026-07-01T12:00:00.000Z"))).toBe("due");
      expect(compareToTarget(target, new Date("2026-07-01T23:59:59.999Z"))).toBe("due");
    });

    it('is "ahead" the day before the target (target still in the future)', () => {
      expect(compareToTarget(target, new Date("2026-06-30T23:59:59.999Z"))).toBe("ahead");
    });

    it('is "past" the day after the target (target fully behind)', () => {
      expect(compareToTarget(target, new Date("2026-07-02T00:00:00.000Z"))).toBe("past");
    });

    it('is "ahead" well before and "past" well after', () => {
      expect(compareToTarget(target, new Date("2026-01-01T00:00:00.000Z"))).toBe("ahead");
      expect(compareToTarget(target, new Date("2026-12-31T00:00:00.000Z"))).toBe("past");
    });
  });

  describe("string today input (YYYY-MM-DD)", () => {
    it("matches the Date result at each boundary", () => {
      expect(compareToTarget(target, "2026-06-30")).toBe("ahead");
      expect(compareToTarget(target, "2026-07-01")).toBe("due");
      expect(compareToTarget(target, "2026-07-02")).toBe("past");
    });

    it("accepts a full ISO timestamp string and reads its UTC day", () => {
      expect(compareToTarget(target, "2026-07-01T23:59:59.999Z")).toBe("due");
      expect(compareToTarget(target, "2026-07-02T00:00:00.000Z")).toBe("past");
    });
  });

  it("treats date-only inputs as UTC (timezone-independent)", () => {
    // Both pinned to UTC midnight → same day → due.
    expect(compareToTarget("2026-07-01", "2026-07-01")).toBe("due");
  });
});
