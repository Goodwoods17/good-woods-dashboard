/**
 * Buffer lifecycle facade — locks the composition. The facade must never change
 * a number: `bufferState` is exactly `computeBufferBurn` + `feverZone`, and
 * `sizeBuffer` is exactly `computeRiskTieredBuffer`. These tests assert that
 * equivalence on fixtures so any drift in the facade is caught.
 */
import { describe, it, expect } from "vitest";
import { bufferState, sizeBuffer, changeOrderImpact } from "./buffer";
import { computeRiskTieredBuffer } from "./committedDate";
import { computeBufferBurn, feverZone, chainCompletionPct } from "./bufferBurn";
import { changeOrderImpact as recommitChangeOrderImpact } from "./recommit";

// ── bufferState = computeBufferBurn + feverZone ──────────────────────────────

describe("bufferState composes computeBufferBurn + feverZone unchanged", () => {
  const cases: Array<{
    name: string;
    internal: string;
    committed: string;
    today: string;
    chainPct: number;
  }> = [
    {
      name: "still ahead of internal target",
      internal: "2026-08-03",
      committed: "2026-08-17",
      today: "2026-07-15",
      chainPct: 50,
    },
    {
      name: "mid-burn, yellow-ish",
      internal: "2026-08-03",
      committed: "2026-08-21",
      today: "2026-08-10",
      chainPct: 40,
    },
    {
      name: "past committed date (over 100%)",
      internal: "2026-07-01",
      committed: "2026-07-08",
      today: "2026-07-22",
      chainPct: 80,
    },
    {
      name: "zero buffer pool",
      internal: "2026-08-01",
      committed: "2026-08-01",
      today: "2026-09-01",
      chainPct: 0,
    },
    {
      name: "no progress yet, some burn",
      internal: "2026-08-03",
      committed: "2026-08-17",
      today: "2026-08-12",
      chainPct: 0,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const today = new Date(`${c.today}T12:00:00.000Z`);
      const burn = computeBufferBurn(c.internal, c.committed, today);
      const zone = feverZone(burn.bufferConsumedPct, c.chainPct);

      const state = bufferState(c.internal, c.committed, today, c.chainPct);

      expect(state.totalDays).toBe(burn.totalBufferDays);
      expect(state.consumedDays).toBe(burn.consumedBufferDays);
      expect(state.remainingDays).toBe(burn.remainingBufferDays);
      expect(state.consumedPct).toBe(burn.bufferConsumedPct);
      expect(state.chainPct).toBe(c.chainPct);
      expect(state.zone).toBe(zone);
    });
  }

  it("works with a chainPct sourced from chainCompletionPct", () => {
    const today = new Date("2026-08-10T12:00:00.000Z");
    const chainPct = chainCompletionPct({ currentMilestoneIndex: 2 });
    const burn = computeBufferBurn("2026-08-03", "2026-08-21", today);
    expect(bufferState("2026-08-03", "2026-08-21", today, chainPct).zone).toBe(
      feverZone(burn.bufferConsumedPct, chainPct)
    );
  });
});

// ── sizeBuffer = computeRiskTieredBuffer ─────────────────────────────────────

describe("sizeBuffer re-exports computeRiskTieredBuffer unchanged", () => {
  it("is the same function reference", () => {
    expect(sizeBuffer).toBe(computeRiskTieredBuffer);
  });

  it("produces an identical breakdown", () => {
    const input = {
      totalInternalDays: 20,
      subDependencyCount: 2,
      varianceNudgeDays: 3,
      ownerReliabilityDays: 1,
    };
    expect(sizeBuffer(input)).toEqual(computeRiskTieredBuffer(input));
  });
});

// ── changeOrderImpact re-export ──────────────────────────────────────────────

describe("changeOrderImpact re-export", () => {
  it("is the same function reference as recommit's", () => {
    expect(changeOrderImpact).toBe(recommitChangeOrderImpact);
  });
});
