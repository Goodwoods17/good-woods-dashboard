import { describe, it, expect } from "vitest";
import {
  bcStatHolidays,
  isWorkDay,
  addWorkDays,
  workDaysBetween,
  weekMondayOf,
  businessWeekWindow,
  weekLabel,
  type Iso,
} from "./workdays";

// ── bcStatHolidays ────────────────────────────────────────────────────────────

describe("bcStatHolidays", () => {
  it("computes all 11 BC stat holidays for 2026", () => {
    const h = bcStatHolidays(2026);
    const expected: Iso[] = [
      "2026-01-01", // New Year's
      "2026-02-16", // Family Day (3rd Mon Feb)
      "2026-04-03", // Good Friday (Easter Apr 5 − 2)
      "2026-05-18", // Victoria Day (Mon before May 25)
      "2026-07-01", // Canada Day
      "2026-08-03", // BC Day (1st Mon Aug)
      "2026-09-07", // Labour Day (1st Mon Sep)
      "2026-09-30", // Truth & Reconciliation
      "2026-10-12", // Thanksgiving (2nd Mon Oct)
      "2026-11-11", // Remembrance Day
      "2026-12-25", // Christmas
    ];
    expect(h.size).toBe(11);
    for (const d of expected) expect(h.has(d)).toBe(true);
    expect(Array.from(h).sort()).toEqual([...expected].sort());
  });

  it("observes Canada Day on the following Monday when Jul 1 is a Saturday (2023)", () => {
    // 2023-07-01 is a Saturday → observed Monday 2023-07-03.
    const h = bcStatHolidays(2023);
    expect(h.has("2023-07-03")).toBe(true);
    expect(h.has("2023-07-01")).toBe(false);
    expect(isWorkDay("2023-07-03")).toBe(false);
  });

  it("observes Christmas on the following Monday when Dec 25 is a Sunday (2022)", () => {
    // 2022-12-25 is a Sunday → observed Monday 2022-12-26.
    const h = bcStatHolidays(2022);
    expect(h.has("2022-12-26")).toBe(true);
    expect(isWorkDay("2022-12-26")).toBe(false);
  });

  it("computes Good Friday via Computus for a different year (2027 = Mar 26)", () => {
    // Easter 2027 is March 28 → Good Friday March 26.
    expect(bcStatHolidays(2027).has("2027-03-26")).toBe(true);
  });

  it("memoizes — repeated calls return the same set instance", () => {
    expect(bcStatHolidays(2026)).toBe(bcStatHolidays(2026));
  });
});

// ── isWorkDay ─────────────────────────────────────────────────────────────────

describe("isWorkDay", () => {
  it("is true for an ordinary weekday", () => {
    expect(isWorkDay("2026-06-10")).toBe(true); // Wednesday
  });

  it("is false on weekends", () => {
    expect(isWorkDay("2026-06-13")).toBe(false); // Saturday
    expect(isWorkDay("2026-06-14")).toBe(false); // Sunday
  });

  it("is false on a BC stat holiday", () => {
    expect(isWorkDay("2026-07-01")).toBe(false); // Canada Day
    expect(isWorkDay("2026-12-25")).toBe(false); // Christmas
  });

  it("honours extraClosures", () => {
    const opts = { extraClosures: new Set<Iso>(["2026-06-10"]) };
    expect(isWorkDay("2026-06-10", opts)).toBe(false);
    expect(isWorkDay("2026-06-11", opts)).toBe(true);
  });

  it("accepts an ISO timestamp by normalizing to its date part", () => {
    expect(isWorkDay("2026-06-13T09:30:00.000Z")).toBe(false); // Saturday
  });
});

// ── addWorkDays ───────────────────────────────────────────────────────────────

describe("addWorkDays", () => {
  it("returns the date unchanged when n = 0", () => {
    expect(addWorkDays("2026-06-09", 0)).toBe("2026-06-09");
  });

  it("adds weekdays forward and skips weekends", () => {
    expect(addWorkDays("2026-06-08", 1)).toBe("2026-06-09"); // Mon → Tue
    expect(addWorkDays("2026-06-05", 1)).toBe("2026-06-08"); // Fri → Mon
  });

  it("subtracts weekdays backward (negative n)", () => {
    expect(addWorkDays("2026-06-09", -1)).toBe("2026-06-08"); // Tue → Mon
    expect(addWorkDays("2026-06-08", -1)).toBe("2026-06-05"); // Mon → Fri
    expect(addWorkDays("2026-06-15", -5)).toBe("2026-06-08");
  });

  it("skips a BC stat holiday when chaining across it", () => {
    // Canada Day 2026-07-01 (Wed) is a holiday. From Tue Jun 30, +1 work day
    // lands Thu Jul 2 (skipping the holiday), not Wed Jul 1.
    expect(addWorkDays("2026-06-30", 1)).toBe("2026-07-02");
    // Naive Mon–Fri would have landed Jul 1.
  });

  it("lands one day later than a naive weekend-only walk across Canada Day", () => {
    // Mon Jun 29 + 5 work days: Tue30, [skip Wed Jul1 holiday], Thu2, Fri3,
    // Mon6, Tue7 → 2026-07-07. Weekend-only would give Mon Jul 6.
    expect(addWorkDays("2026-06-29", 5)).toBe("2026-07-07");
  });

  it("threads extraClosures into the walk", () => {
    const opts = { extraClosures: new Set<Iso>(["2026-06-09"]) };
    // Mon Jun 8 + 1: Tue Jun 9 is closed → lands Wed Jun 10.
    expect(addWorkDays("2026-06-08", 1, opts)).toBe("2026-06-10");
  });
});

// ── workDaysBetween + inverse property ────────────────────────────────────────

describe("workDaysBetween", () => {
  it("is 0 for the same date", () => {
    expect(workDaysBetween("2026-06-09", "2026-06-09")).toBe(0);
  });

  it("counts from-excluded, to-included", () => {
    expect(workDaysBetween("2026-06-08", "2026-06-09")).toBe(1); // Mon → Tue
    expect(workDaysBetween("2026-06-05", "2026-06-08")).toBe(1); // Fri → Mon
    expect(workDaysBetween("2026-06-08", "2026-06-12")).toBe(4); // Mon → Fri
  });

  it("is negative when to is before from", () => {
    expect(workDaysBetween("2026-06-09", "2026-06-08")).toBe(-1);
    expect(workDaysBetween("2026-06-15", "2026-06-08")).toBe(-5);
  });

  it("counts a holiday as a non-work day in the span", () => {
    // Mon Jun 29 → Mon Jul 6 spans Canada Day (Wed Jul 1), so only 4 work days.
    // Naive Mon–Fri would count 5.
    expect(workDaysBetween("2026-06-29", "2026-07-06")).toBe(4);
  });

  it("satisfies the inverse property over many from/n pairs", () => {
    const froms: Iso[] = [
      "2026-01-05",
      "2026-06-08",
      "2026-06-29",
      "2026-12-21",
      "2027-03-22",
      "2023-06-26",
    ];
    for (const from of froms) {
      for (let n = -25; n <= 25; n++) {
        const to = addWorkDays(from, n);
        // `to` is always a work day (addWorkDays lands on work days), except
        // when n === 0 and `from` may be anything — skip that degenerate case
        // by only asserting the round-trip count, which holds regardless.
        if (n !== 0) {
          expect(workDaysBetween(from, to)).toBe(n);
        }
        // Inverse direction always holds because `to` is a work day.
        expect(addWorkDays(from, workDaysBetween(from, to))).toBe(to);
      }
    }
  });
});

// ── weekMondayOf / businessWeekWindow / weekLabel ─────────────────────────────

describe("weekMondayOf", () => {
  it("returns the same date when already Monday", () => {
    expect(weekMondayOf("2026-06-29")).toBe("2026-06-29");
  });

  it("returns the preceding Monday mid-week and on Sunday", () => {
    expect(weekMondayOf("2026-07-01")).toBe("2026-06-29"); // Wed
    expect(weekMondayOf("2026-06-28")).toBe("2026-06-22"); // Sun
  });
});

describe("businessWeekWindow", () => {
  it("returns Mon..Fri of the containing week", () => {
    expect(businessWeekWindow("2026-07-08")).toEqual({
      start: "2026-07-06",
      end: "2026-07-10",
    });
    expect(businessWeekWindow("2026-07-06")).toEqual({
      start: "2026-07-06",
      end: "2026-07-10",
    });
  });
});

describe("weekLabel", () => {
  it("formats 'Week of Mon D' with no leading zero", () => {
    expect(weekLabel("2026-08-03")).toBe("Week of Aug 3");
    expect(weekLabel("2026-12-07")).toBe("Week of Dec 7");
  });
});
