import { describe, it, expect } from "vitest";
import {
  summarizeBulkPush,
  BULK_PUSH_DELAY_MS,
  BULK_PUSH_MAX,
  type BulkPushItem,
} from "./qboBulkPush";

describe("summarizeBulkPush", () => {
  it("returns zeros for an empty list", () => {
    const summary = summarizeBulkPush([]);
    expect(summary.pushed).toBe(0);
    expect(summary.alreadyPushed).toBe(0);
    expect(summary.blocked).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.items).toHaveLength(0);
  });

  it("counts each outcome correctly", () => {
    const items: BulkPushItem[] = [
      { invoiceId: "a", outcome: "pushed", billId: "bill-1" },
      { invoiceId: "b", outcome: "already_pushed", billId: "bill-2" },
      { invoiceId: "c", outcome: "already_pushed", billId: "bill-3" },
      { invoiceId: "d", outcome: "blocked", message: "vendor not mapped" },
      { invoiceId: "e", outcome: "error", message: "QBO error" },
      { invoiceId: "f", outcome: "error", message: "network timeout" },
    ];
    const summary = summarizeBulkPush(items);
    expect(summary.pushed).toBe(1);
    expect(summary.alreadyPushed).toBe(2);
    expect(summary.blocked).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.items).toHaveLength(6);
  });

  it("preserves items in input order", () => {
    const items: BulkPushItem[] = [
      { invoiceId: "first", outcome: "pushed" },
      { invoiceId: "second", outcome: "error" },
    ];
    const summary = summarizeBulkPush(items);
    expect(summary.items[0].invoiceId).toBe("first");
    expect(summary.items[1].invoiceId).toBe("second");
  });

  it("counts a single pushed invoice", () => {
    const summary = summarizeBulkPush([{ invoiceId: "x", outcome: "pushed", billId: "b1" }]);
    expect(summary.pushed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.blocked).toBe(0);
    expect(summary.alreadyPushed).toBe(0);
  });
});

describe("bulk push constants", () => {
  it("BULK_PUSH_DELAY_MS is positive and reasonable (< 2 s)", () => {
    expect(BULK_PUSH_DELAY_MS).toBeGreaterThan(0);
    expect(BULK_PUSH_DELAY_MS).toBeLessThanOrEqual(2000);
  });

  it("BULK_PUSH_MAX is a positive integer ≤ 100", () => {
    expect(BULK_PUSH_MAX).toBeGreaterThan(0);
    expect(BULK_PUSH_MAX).toBeLessThanOrEqual(100);
    expect(Number.isInteger(BULK_PUSH_MAX)).toBe(true);
  });
});
