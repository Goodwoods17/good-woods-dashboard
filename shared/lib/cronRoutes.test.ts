import { describe, it, expect } from "vitest";
import { isCronExemptPath } from "./cronRoutes";

describe("isCronExemptPath — cron/M2M routes exempt from the session gate (QBO-H11)", () => {
  it("exempts the QBO retry-queue drain", () => {
    expect(isCronExemptPath("/api/invoices/qbo/retry-queue")).toBe(true);
  });

  it("exempts the per-invoice QBO export route (any id)", () => {
    expect(isCronExemptPath("/api/invoices/abc-123/export-qbo")).toBe(true);
    expect(isCronExemptPath("/api/invoices/00000000-0000-4000-8000-000000000189/export-qbo")).toBe(
      true
    );
  });

  it("does NOT exempt other invoice sub-routes (they use a browser session)", () => {
    expect(isCronExemptPath("/api/invoices/abc-123/push-qbo")).toBe(false);
    expect(isCronExemptPath("/api/invoices/abc-123/void-qbo")).toBe(false);
    expect(isCronExemptPath("/api/invoices/abc-123/attach-qbo")).toBe(false);
  });

  it("does NOT exempt deeper / spoofed paths", () => {
    expect(isCronExemptPath("/api/invoices/abc/def/export-qbo")).toBe(false);
    expect(isCronExemptPath("/api/invoices/abc/export-qbo/extra")).toBe(false);
    expect(isCronExemptPath("/api/invoices/qbo/retry-queue/evil")).toBe(false);
  });

  it("does NOT exempt unrelated app routes", () => {
    expect(isCronExemptPath("/")).toBe(false);
    expect(isCronExemptPath("/invoices")).toBe(false);
    expect(isCronExemptPath("/api/invoices/qbo/status")).toBe(false);
  });
});
