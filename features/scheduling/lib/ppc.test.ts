/**
 * S25 — PPC + on-time-delivery reliability scorecard (issue #113).
 * Unit tests — written BEFORE the implementation (TDD: red → green → refactor).
 */
import { describe, it, expect } from "vitest";
import {
  computePPC,
  computeOnTimeDelivery,
  varianceByReason,
  formatReliabilityRate,
  publicReliabilityStat,
  buildReliabilityScorecard,
  type ScorecardLedgerEntry,
  type ScorecardRevisionEntry,
} from "./ppc";

// ── computePPC ────────────────────────────────────────────────────────────────

describe("computePPC", () => {
  it("returns null when no entries", () => {
    expect(computePPC([])).toBeNull();
  });

  it("returns null when all entries are open (not yet resolved)", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "phase", status: "open", missed: false },
      { level: "phase", status: "open", missed: false },
    ];
    expect(computePPC(entries)).toBeNull();
  });

  it("returns null when all resolved entries are client-level (PPC is phase-only)", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "client", status: "kept", missed: false },
      { level: "client", status: "missed", missed: true },
    ];
    expect(computePPC(entries)).toBeNull();
  });

  it("computes 50% PPC from 1 kept + 1 missed phase commitment", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "missed", missed: true },
    ];
    const result = computePPC(entries);
    expect(result).not.toBeNull();
    expect(result!.kept).toBe(1);
    expect(result!.missed).toBe(1);
    expect(result!.total).toBe(2);
    expect(result!.rate).toBeCloseTo(0.5);
  });

  it("excludes open entries from PPC calculation", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "missed", missed: true },
      { level: "phase", status: "open", missed: false }, // excluded
    ];
    const result = computePPC(entries);
    expect(result!.total).toBe(2);
    expect(result!.rate).toBeCloseTo(0.5);
  });

  it("excludes client-level entries from PPC (phase only)", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "missed", missed: true },
      { level: "client", status: "kept", missed: false }, // excluded from PPC
      { level: "client", status: "missed", missed: true }, // excluded from PPC
    ];
    const result = computePPC(entries);
    expect(result!.total).toBe(2); // only 2 phase entries
    expect(result!.kept).toBe(1);
  });

  it("computes 100% PPC when all phase commitments are kept", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "kept", missed: false },
    ];
    const result = computePPC(entries);
    expect(result!.rate).toBe(1);
    expect(result!.kept).toBe(3);
    expect(result!.missed).toBe(0);
    expect(result!.total).toBe(3);
  });

  it("computes 0% PPC when all phase commitments are missed", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "phase", status: "missed", missed: true },
      { level: "phase", status: "missed", missed: true },
    ];
    const result = computePPC(entries);
    expect(result!.rate).toBe(0);
    expect(result!.kept).toBe(0);
    expect(result!.missed).toBe(2);
  });

  it("computes 75% from 3 kept + 1 missed", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "missed", missed: true },
    ];
    const result = computePPC(entries);
    expect(result!.rate).toBeCloseTo(0.75);
    expect(result!.total).toBe(4);
  });
});

// ── computeOnTimeDelivery ─────────────────────────────────────────────────────

describe("computeOnTimeDelivery", () => {
  it("returns null when no entries", () => {
    expect(computeOnTimeDelivery([])).toBeNull();
  });

  it("returns null when all entries are open", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "client", status: "open", missed: false },
    ];
    expect(computeOnTimeDelivery(entries)).toBeNull();
  });

  it("returns null when all resolved entries are phase-level (OTD is client-only)", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "missed", missed: true },
    ];
    expect(computeOnTimeDelivery(entries)).toBeNull();
  });

  it("computes 100% OTD from 1 kept client commitment", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "client", status: "kept", missed: false },
    ];
    const result = computeOnTimeDelivery(entries);
    expect(result).not.toBeNull();
    expect(result!.rate).toBe(1);
    expect(result!.kept).toBe(1);
    expect(result!.missed).toBe(0);
    expect(result!.total).toBe(1);
  });

  it("computes 75% OTD from 3 kept + 1 missed client install", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "client", status: "kept", missed: false },
      { level: "client", status: "kept", missed: false },
      { level: "client", status: "kept", missed: false },
      { level: "client", status: "missed", missed: true },
    ];
    const result = computeOnTimeDelivery(entries);
    expect(result!.rate).toBeCloseTo(0.75);
    expect(result!.total).toBe(4);
  });

  it("excludes open client entries from OTD calculation", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "client", status: "kept", missed: false },
      { level: "client", status: "open", missed: false }, // excluded
    ];
    const result = computeOnTimeDelivery(entries);
    expect(result!.total).toBe(1);
  });

  it("excludes phase-level entries from OTD (client only)", () => {
    const entries: ScorecardLedgerEntry[] = [
      { level: "client", status: "kept", missed: false },
      { level: "phase", status: "missed", missed: true }, // excluded
    ];
    const result = computeOnTimeDelivery(entries);
    expect(result!.total).toBe(1);
    expect(result!.kept).toBe(1);
  });
});

// ── varianceByReason ──────────────────────────────────────────────────────────

describe("varianceByReason", () => {
  it("returns empty array for no revisions", () => {
    expect(varianceByReason([])).toEqual([]);
  });

  it("excludes revisions that do not ding reliability (change orders, client delays)", () => {
    const revisions: ScorecardRevisionEntry[] = [
      { reasonCode: "scope_change", dingsReliability: false },
      { reasonCode: "client_delay", dingsReliability: false },
    ];
    expect(varianceByReason(revisions)).toEqual([]);
  });

  it("groups attributable revisions by reason code", () => {
    const revisions: ScorecardRevisionEntry[] = [
      { reasonCode: "sub_delay", dingsReliability: true },
      { reasonCode: "sub_delay", dingsReliability: true },
      { reasonCode: "rework", dingsReliability: true },
    ];
    const result = varianceByReason(revisions);
    expect(result).toHaveLength(2);
    const subDelay = result.find((r) => r.reasonCode === "sub_delay");
    expect(subDelay).toBeDefined();
    expect(subDelay!.count).toBe(2);
    const rework = result.find((r) => r.reasonCode === "rework");
    expect(rework!.count).toBe(1);
  });

  it("sorts reasons by count descending", () => {
    const revisions: ScorecardRevisionEntry[] = [
      { reasonCode: "rework", dingsReliability: true },
      { reasonCode: "sub_delay", dingsReliability: true },
      { reasonCode: "sub_delay", dingsReliability: true },
      { reasonCode: "sub_delay", dingsReliability: true },
      { reasonCode: "rework", dingsReliability: true },
    ];
    const result = varianceByReason(revisions);
    expect(result[0].reasonCode).toBe("sub_delay");
    expect(result[0].count).toBe(3);
    expect(result[1].reasonCode).toBe("rework");
    expect(result[1].count).toBe(2);
  });

  it("includes a human-readable label for known reason codes", () => {
    const revisions: ScorecardRevisionEntry[] = [
      { reasonCode: "sub_delay", dingsReliability: true },
    ];
    const result = varianceByReason(revisions);
    expect(result[0].label).toBe("Sub-trade delay");
  });

  it("mixes attributable and non-attributable — only counts attributable ones", () => {
    const revisions: ScorecardRevisionEntry[] = [
      { reasonCode: "sub_delay", dingsReliability: true },
      { reasonCode: "scope_change", dingsReliability: false }, // excluded
      { reasonCode: "rework", dingsReliability: true },
    ];
    const result = varianceByReason(revisions);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.reasonCode)).not.toContain("scope_change");
  });
});

// ── formatReliabilityRate ─────────────────────────────────────────────────────

describe("formatReliabilityRate", () => {
  it("formats 1.0 as '100%'", () => {
    expect(formatReliabilityRate(1)).toBe("100%");
  });

  it("formats 0.94 as '94%'", () => {
    expect(formatReliabilityRate(0.94)).toBe("94%");
  });

  it("formats 0.5 as '50%'", () => {
    expect(formatReliabilityRate(0.5)).toBe("50%");
  });

  it("rounds down (floor not round)", () => {
    // 0.949 → 94% not 95%
    expect(formatReliabilityRate(0.949)).toBe("94%");
  });

  it("formats 0 as '0%'", () => {
    expect(formatReliabilityRate(0)).toBe("0%");
  });
});

// ── publicReliabilityStat ─────────────────────────────────────────────────────

describe("publicReliabilityStat", () => {
  it("returns null when onTimeDelivery is null (insufficient data)", () => {
    expect(publicReliabilityStat(null)).toBeNull();
  });

  it("returns null when fewer than 3 resolved client commitments (too small a sample)", () => {
    expect(
      publicReliabilityStat({ rate: 1, kept: 1, missed: 0, total: 1 })
    ).toBeNull();
    expect(
      publicReliabilityStat({ rate: 1, kept: 2, missed: 0, total: 2 })
    ).toBeNull();
  });

  it("returns a stat string when 3+ resolved client commitments exist", () => {
    const result = publicReliabilityStat({ rate: 0.94, kept: 47, missed: 3, total: 50 });
    expect(result).not.toBeNull();
    expect(result).toContain("94%");
  });

  it("includes a quote-friendly phrase suitable for proposals", () => {
    const result = publicReliabilityStat({ rate: 0.94, kept: 47, missed: 3, total: 50 });
    // Should mention the rate in a proposal-ready sentence
    expect(result).toMatch(/94%/);
  });
});

// ── buildReliabilityScorecard ─────────────────────────────────────────────────

describe("buildReliabilityScorecard", () => {
  it("assembles a full scorecard from ledger + revisions", () => {
    const ledger: ScorecardLedgerEntry[] = [
      { level: "phase", status: "kept", missed: false },
      { level: "phase", status: "missed", missed: true },
      { level: "client", status: "kept", missed: false },
      { level: "client", status: "kept", missed: false },
      { level: "client", status: "kept", missed: false },
    ];
    const revisions: ScorecardRevisionEntry[] = [
      { reasonCode: "sub_delay", dingsReliability: true },
      { reasonCode: "rework", dingsReliability: true },
      { reasonCode: "scope_change", dingsReliability: false }, // excluded
    ];

    const scorecard = buildReliabilityScorecard(ledger, revisions);

    // PPC: 1 kept / 2 phase = 50%
    expect(scorecard.ppc).not.toBeNull();
    expect(scorecard.ppc!.rate).toBeCloseTo(0.5);
    expect(scorecard.ppc!.total).toBe(2);

    // On-time delivery: 3 kept / 3 total = 100%
    expect(scorecard.onTimeDelivery).not.toBeNull();
    expect(scorecard.onTimeDelivery!.rate).toBe(1);
    expect(scorecard.onTimeDelivery!.total).toBe(3);

    // Variance: 2 attributable (sub_delay + rework), scope_change excluded
    expect(scorecard.varianceByReason).toHaveLength(2);

    // Public stat: 3 client rows (>= 3), 100% → stat is present
    expect(scorecard.publicReliabilityStat).not.toBeNull();
    expect(scorecard.publicReliabilityStat).toContain("100%");
  });

  it("returns nulls for metrics when ledger is empty", () => {
    const scorecard = buildReliabilityScorecard([], []);
    expect(scorecard.ppc).toBeNull();
    expect(scorecard.onTimeDelivery).toBeNull();
    expect(scorecard.varianceByReason).toEqual([]);
    expect(scorecard.publicReliabilityStat).toBeNull();
  });

  it("uses seed-realistic data: 2 phase (1 kept 1 missed) + 1 client (kept)", () => {
    // Matches the S13 seed in scripts/seed-e2e.mjs
    const ledger: ScorecardLedgerEntry[] = [
      { level: "phase", status: "missed", missed: true },  // subtrade, cnc
      { level: "phase", status: "kept", missed: false },   // subtrade, cnc
      { level: "client", status: "kept", missed: false },  // shop, install
    ];
    const revisions: ScorecardRevisionEntry[] = [
      { reasonCode: "sub_delay", dingsReliability: true }, // S14 seed
    ];

    const scorecard = buildReliabilityScorecard(ledger, revisions);

    // PPC = 1/2 = 50%
    expect(scorecard.ppc!.rate).toBeCloseTo(0.5);
    expect(scorecard.ppc!.kept).toBe(1);
    expect(scorecard.ppc!.missed).toBe(1);

    // On-time = 1/1 = 100% (but only 1 row → publicStat is null, < 3 min)
    expect(scorecard.onTimeDelivery!.rate).toBe(1);
    expect(scorecard.publicReliabilityStat).toBeNull(); // only 1 client row

    // Variance: 1 sub_delay
    expect(scorecard.varianceByReason).toHaveLength(1);
    expect(scorecard.varianceByReason[0].reasonCode).toBe("sub_delay");
    expect(scorecard.varianceByReason[0].count).toBe(1);
  });
});
