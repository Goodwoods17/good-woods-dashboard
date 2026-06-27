import { describe, it, expect } from "vitest";
import {
  RECOMMIT_REASON_CODES,
  reasonCodeMeta,
  dingsReliability,
  recommitRecoveryGate,
  changeOrderImpact,
  pushCommittedDate,
  buildCommitmentRevision,
  draftRecommitEmail,
} from "./recommit";

describe("recommit reason codes (S14, issue #102)", () => {
  it("exposes a stable, non-empty reason-code catalogue", () => {
    expect(RECOMMIT_REASON_CODES.length).toBeGreaterThan(0);
    // Every code is unique.
    const codes = RECOMMIT_REASON_CODES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    // The scope-change (change-order) reason exists and is non-attributable.
    const scope = reasonCodeMeta("scope_change");
    expect(scope.attributable).toBe(false);
    // A shop-caused reason is attributable.
    expect(reasonCodeMeta("sub_delay").attributable).toBe(true);
  });
});

describe("dingsReliability — change orders never ding (issue #102)", () => {
  it("a change order never dings reliability, regardless of reason", () => {
    expect(dingsReliability("change_order", "scope_change")).toBe(false);
    // Even if mislabelled with a shop-attributable reason, a change order is a
    // deliberate scope decision and must not ding the shop's reliability.
    expect(dingsReliability("change_order", "sub_delay")).toBe(false);
  });

  it("a plain re-commit dings only on a shop-attributable reason", () => {
    expect(dingsReliability("recommit", "sub_delay")).toBe(true);
    expect(dingsReliability("recommit", "rework")).toBe(true);
    expect(dingsReliability("recommit", "client_delay")).toBe(false);
    expect(dingsReliability("recommit", "force_majeure")).toBe(false);
  });
});

describe("recommitRecoveryGate — recovery-first (issue #102)", () => {
  it("blocks re-commit until the buffer is truly blown (RED = recovery window)", () => {
    const green = recommitRecoveryGate("green");
    expect(green.canRecommit).toBe(false);
    expect(green.inRecoveryWindow).toBe(false);

    const yellow = recommitRecoveryGate("yellow");
    expect(yellow.canRecommit).toBe(false);

    const red = recommitRecoveryGate("red");
    expect(red.canRecommit).toBe(true);
    expect(red.inRecoveryWindow).toBe(true);
    expect(red.message).toMatch(/re-commit/i);
  });
});

describe("changeOrderImpact — small ones absorb into buffer (issue #102)", () => {
  it("absorbs added scope that fits inside the remaining buffer", () => {
    const impact = changeOrderImpact(2, 5);
    expect(impact.absorbs).toBe(true);
    expect(impact.committedDateDeltaDays).toBe(0);
  });

  it("pushes the committed date out by the overflow when scope exceeds buffer", () => {
    const impact = changeOrderImpact(8, 5);
    expect(impact.absorbs).toBe(false);
    expect(impact.committedDateDeltaDays).toBe(3);
  });

  it("treats exact-fit as absorbed and clamps negatives", () => {
    expect(changeOrderImpact(5, 5).absorbs).toBe(true);
    expect(changeOrderImpact(-3, 5).absorbs).toBe(true);
    expect(changeOrderImpact(2, -1).committedDateDeltaDays).toBe(2);
  });
});

describe("pushCommittedDate — work-day arithmetic", () => {
  it("advances the committed date by N work days, skipping weekends", () => {
    // 2026-12-15 is a Tuesday; +3 work days = Friday 2026-12-18.
    expect(pushCommittedDate("2026-12-15", 3)).toBe("2026-12-18");
    // +0 returns the same date.
    expect(pushCommittedDate("2026-12-15", 0)).toBe("2026-12-15");
  });
});

describe("buildCommitmentRevision — versioned, never silently overwritten (issue #102)", () => {
  it("captures old/new date + buffer + reason + who/when and derives dings flag", () => {
    const rev = buildCommitmentRevision({
      id: "rev-1",
      jobId: "job-1",
      kind: "recommit",
      reasonCode: "sub_delay",
      oldCommittedDate: "2026-12-15",
      newCommittedDate: "2026-12-22",
      oldBufferDays: 10,
      newBufferDays: 12,
      note: "Spray sub slipped a week",
      revisedBy: "andrew@example.com",
      revisedAt: "2026-06-27T00:00:00.000Z",
    });
    expect(rev.oldCommittedDate).toBe("2026-12-15");
    expect(rev.newCommittedDate).toBe("2026-12-22");
    expect(rev.oldBufferDays).toBe(10);
    expect(rev.newBufferDays).toBe(12);
    expect(rev.dingsReliability).toBe(true);
    expect(rev.revisedBy).toBe("andrew@example.com");
  });

  it("a change-order revision does not ding reliability", () => {
    const rev = buildCommitmentRevision({
      jobId: "job-1",
      kind: "change_order",
      reasonCode: "scope_change",
      oldCommittedDate: "2026-12-15",
      newCommittedDate: "2027-01-05",
    });
    expect(rev.dingsReliability).toBe(false);
    expect(rev.kind).toBe("change_order");
    // Defaults fill in optional fields.
    expect(rev.oldBufferDays).toBeNull();
    expect(typeof rev.revisedAt).toBe("string");
  });
});

describe("draftRecommitEmail — concrete, early client draft (issue #102)", () => {
  it("names the concrete new committed date in a re-commit email", () => {
    const draft = draftRecommitEmail({
      clientName: "Jane",
      jobName: "Kitchen Reno",
      oldCommittedDate: "2026-12-15",
      newCommittedDate: "2026-12-22",
      kind: "recommit",
      reasonLabel: "Sub-trade delay",
    });
    expect(draft.subject).toMatch(/Kitchen Reno/);
    expect(draft.body).toContain("Jane");
    // The concrete new date must appear in the body (early + concrete).
    expect(draft.body).toMatch(/Dec(ember)? 22, 2026|2026-12-22/);
  });

  it("frames a change-order email around the approved scope change", () => {
    const draft = draftRecommitEmail({
      clientName: "Jane",
      jobName: "Kitchen Reno",
      oldCommittedDate: "2026-12-15",
      newCommittedDate: "2027-01-05",
      kind: "change_order",
      reasonLabel: "Added scope (change order)",
    });
    expect(draft.body).toMatch(/change order|added scope|scope/i);
  });
});
