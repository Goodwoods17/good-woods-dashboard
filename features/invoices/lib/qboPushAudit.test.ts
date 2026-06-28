/**
 * Unit tests for QBO S9 — total-mismatch guard + retry queue + push audit log
 * (issue #155). Written first (TDD, red → green).
 *
 * Tests cover:
 *   1. total_mismatch block in evaluateBillPush (the new guard that stops a push
 *      when Σ lines + GST + PST ≠ the stated total).
 *   2. Exponential-backoff helpers (nextRetryDelayMs / nextRetryAt).
 *   3. Transient vs permanent HTTP-status classification.
 */
import { describe, it, expect } from "vitest";
import { nextRetryDelayMs, nextRetryAt, isTransientHttpStatus, isPermanentHttpStatus } from "./qboPushAudit";
import { evaluateBillPush, billPushBlockMessage, type LineGateInput } from "./qboBillPush";
import type { QboBillReconciliation } from "./qboExport";
import type { MappingLookups } from "./qboAccountMapping";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fullMaps: MappingLookups = {
  accountByLocal: { "5000-Materials": "33" },
  taxByLocal: { GST: "4" },
};
const mappedLine: LineGateInput = { account: "5000-Materials", taxKey: "GST" };

const balancedRec: QboBillReconciliation = {
  lineSubtotal: 100,
  gst: 5,
  pst: 0,
  computedTotal: 105,
  statedTotal: 105,
  balanced: true,
};

const mismatchedRec: QboBillReconciliation = {
  lineSubtotal: 100,
  gst: 5,
  pst: 0,
  computedTotal: 105,
  statedTotal: 110, // 5-cent mismatch (e.g. rounding diff)
  balanced: false,
};

// ── 1. total_mismatch guard ───────────────────────────────────────────────────

describe("evaluateBillPush — total_mismatch guard (S9)", () => {
  it("is pushable when reconciliation is balanced", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: "99",
      lines: [mappedLine],
      maps: fullMaps,
      reconciliation: balancedRec,
    });
    expect(gate.pushable).toBe(true);
    expect(gate.block).toBeNull();
    expect(gate.totalMismatch).toBe(false);
  });

  it("is pushable when no reconciliation is supplied (backward-compat: pre-S9 callers)", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: "99",
      lines: [mappedLine],
      maps: fullMaps,
    });
    expect(gate.pushable).toBe(true);
    expect(gate.totalMismatch).toBe(false);
  });

  it("blocks with total_mismatch when reconciliation is unbalanced", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: "99",
      lines: [mappedLine],
      maps: fullMaps,
      reconciliation: mismatchedRec,
    });
    expect(gate.pushable).toBe(false);
    expect(gate.block).toBe("total_mismatch");
    expect(gate.totalMismatch).toBe(true);
  });

  it("already_pushed wins over total_mismatch (idempotency takes highest precedence)", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: true,
      vendorRef: "99",
      lines: [mappedLine],
      maps: fullMaps,
      reconciliation: mismatchedRec,
    });
    expect(gate.block).toBe("already_pushed");
    // totalMismatch is still reported for UI diagnostics.
    expect(gate.totalMismatch).toBe(true);
  });

  it("not_posted wins over total_mismatch", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "reviewed",
      alreadyPushed: false,
      vendorRef: "99",
      lines: [mappedLine],
      maps: fullMaps,
      reconciliation: mismatchedRec,
    });
    expect(gate.block).toBe("not_posted");
    expect(gate.totalMismatch).toBe(true);
  });

  it("total_mismatch wins over vendor_unmapped (mismatch checked first after status checks)", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: null,
      lines: [mappedLine],
      maps: fullMaps,
      reconciliation: mismatchedRec,
    });
    expect(gate.block).toBe("total_mismatch");
  });

  it("billPushBlockMessage returns a helpful string for total_mismatch", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: "99",
      lines: [mappedLine],
      maps: fullMaps,
      reconciliation: mismatchedRec,
    });
    const msg = billPushBlockMessage(gate);
    expect(typeof msg).toBe("string");
    expect(msg).not.toBeNull();
    // Must mention the mismatch so the user understands what to fix.
    expect(msg!.toLowerCase()).toMatch(/total|mismatch|match/);
  });
});

// ── 2. Exponential backoff ────────────────────────────────────────────────────

describe("nextRetryDelayMs — exponential backoff (S9)", () => {
  it("returns the base delay (30 s) on retry count 0", () => {
    expect(nextRetryDelayMs(0)).toBe(30_000);
  });

  it("doubles with each increment", () => {
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(2)).toBe(120_000);
    expect(nextRetryDelayMs(3)).toBe(240_000);
  });

  it("is capped at 4 hours (QBO 429 recovery window)", () => {
    const cap = 4 * 60 * 60 * 1000;
    expect(nextRetryDelayMs(100)).toBe(cap);
  });

  it("accepts a custom base delay", () => {
    expect(nextRetryDelayMs(0, 5_000)).toBe(5_000);
    expect(nextRetryDelayMs(1, 5_000)).toBe(10_000);
  });
});

describe("nextRetryAt — ISO timestamp offset (S9)", () => {
  it("returns a future ISO string offset from the supplied now", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const result = nextRetryAt(0, now); // default base = 30 s
    expect(result).toBe("2026-01-01T00:00:30.000Z");
  });

  it("correctly computes the 1st retry offset (60 s)", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(nextRetryAt(1, now)).toBe("2026-01-01T00:01:00.000Z");
  });
});

// ── 3. HTTP status classification ─────────────────────────────────────────────

describe("isTransientHttpStatus (S9)", () => {
  it.each([429, 500, 502, 503])("%i is transient", (status) => {
    expect(isTransientHttpStatus(status)).toBe(true);
  });

  it.each([200, 201, 400, 401, 403, 404, 409])("%i is NOT transient", (status) => {
    expect(isTransientHttpStatus(status)).toBe(false);
  });
});

describe("isPermanentHttpStatus (S9)", () => {
  it.each([400, 401, 403, 404, 409, 422])("%i is permanent", (status) => {
    expect(isPermanentHttpStatus(status)).toBe(true);
  });

  it("429 is NOT permanent (it is transient — rate-limit, retry with backoff)", () => {
    expect(isPermanentHttpStatus(429)).toBe(false);
  });

  it.each([200, 201, 500, 502, 503])("%i is NOT permanent", (status) => {
    expect(isPermanentHttpStatus(status)).toBe(false);
  });
});
