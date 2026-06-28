/**
 * QBO-H7 (issue #190) — push-outcome visibility helpers.
 *
 * Pure-function coverage for the two silent gaps:
 *   (a) attachment failure is visible (attachmentAttached / attachmentWarning)
 *   (b) failed / retry-pending pushes are distinguishable from never-sent
 *       (pushHistoryBadge)
 */
import { describe, it, expect } from "vitest";
import { attachmentAttached, attachmentWarning, pushHistoryBadge } from "./qboPushOutcome";
import type { LatestPushAttempt } from "./qboPushAudit";

function attempt(over: Partial<LatestPushAttempt> = {}): LatestPushAttempt {
  return {
    status: "failed_transient",
    nextRetryAt: "2026-07-01T00:00:00.000Z",
    errorMessage: null,
    createdAt: "2026-06-28T00:00:00.000Z",
    ...over,
  };
}

describe("attachmentAttached (QBO-H7 gap a)", () => {
  it("is true only when the PDF actually attached", () => {
    expect(attachmentAttached({ status: "attached", attachableId: "9" })).toBe(true);
  });

  it("is false for skipped / error / missing", () => {
    expect(attachmentAttached({ status: "skipped", reason: "no file" })).toBe(false);
    expect(attachmentAttached({ status: "error", message: "boom" })).toBe(false);
    expect(attachmentAttached(null)).toBe(false);
    expect(attachmentAttached(undefined)).toBe(false);
  });
});

describe("attachmentWarning (QBO-H7 gap a)", () => {
  it("returns null when attached or unknown", () => {
    expect(attachmentWarning({ status: "attached", attachableId: "9" })).toBeNull();
    expect(attachmentWarning(null)).toBeNull();
  });

  it("warns when the bill sent but the PDF did not attach", () => {
    expect(attachmentWarning({ status: "error", message: "413" })).toMatch(/didn’t attach/);
    expect(attachmentWarning({ status: "skipped", reason: "disabled" })).toMatch(/didn’t attach/);
  });
});

describe("pushHistoryBadge (QBO-H7 gap b)", () => {
  it("shows nothing once the invoice is linked to a Bill (green badge owns that)", () => {
    expect(pushHistoryBadge({ alreadyPushed: true, latest: attempt() })).toEqual({ kind: "none" });
  });

  it("shows nothing for a never-attempted invoice (distinct from a failure)", () => {
    expect(pushHistoryBadge({ alreadyPushed: false, latest: null })).toEqual({ kind: "none" });
  });

  it("surfaces a transient failure as a retry-pending badge", () => {
    const badge = pushHistoryBadge({
      alreadyPushed: false,
      latest: attempt({ status: "failed_transient" }),
    });
    expect(badge.kind).toBe("failed_retry");
    if (badge.kind === "failed_retry") expect(badge.label).toMatch(/will retry/i);
  });

  it("prefers the QBO error message as the detail when present", () => {
    const badge = pushHistoryBadge({
      alreadyPushed: false,
      latest: attempt({ status: "failed_transient", errorMessage: "QBO bill create failed: 503" }),
    });
    if (badge.kind === "failed_retry") expect(badge.detail).toBe("QBO bill create failed: 503");
    else throw new Error("expected failed_retry");
  });

  it("surfaces a permanent failure as a needs-attention badge", () => {
    const badge = pushHistoryBadge({
      alreadyPushed: false,
      latest: attempt({ status: "failed_permanent" }),
    });
    expect(badge.kind).toBe("failed_permanent");
  });

  it("surfaces a queued attempt as a sending badge", () => {
    const badge = pushHistoryBadge({ alreadyPushed: false, latest: attempt({ status: "queued" }) });
    expect(badge.kind).toBe("queued");
  });

  it("treats a superseded (retried) row as no badge", () => {
    expect(
      pushHistoryBadge({ alreadyPushed: false, latest: attempt({ status: "retried" }) })
    ).toEqual({ kind: "none" });
  });
});
