import { describe, it, expect } from "vitest";
import {
  blockGuidance,
  isReconnectReason,
  QBO_RECONNECT_NOTICE,
  QBO_SETTINGS_HREF,
} from "./qboPushNudge";

const empty = { unmappedAccounts: [] as string[], unmappedTaxes: [] as string[] };

describe("blockGuidance", () => {
  it("links mapping blocks to the settings panel", () => {
    expect(blockGuidance({ block: "vendor_unmapped", ...empty }).linkToSettings).toBe(true);
    expect(
      blockGuidance({ block: "accounts_unmapped", unmappedAccounts: ["5000"], unmappedTaxes: [] })
        .linkToSettings
    ).toBe(true);
    expect(
      blockGuidance({ block: "taxes_unmapped", unmappedAccounts: [], unmappedTaxes: ["GST"] })
        .linkToSettings
    ).toBe(true);
  });

  it("does NOT link non-mapping blocks", () => {
    expect(blockGuidance({ block: "already_pushed", ...empty }).linkToSettings).toBe(false);
    expect(blockGuidance({ block: "not_posted", ...empty }).linkToSettings).toBe(false);
    expect(blockGuidance({ block: null, ...empty }).linkToSettings).toBe(false);
  });

  it("pluralizes account / tax counts", () => {
    expect(
      blockGuidance({ block: "accounts_unmapped", unmappedAccounts: ["a"], unmappedTaxes: [] })
        .message
    ).toContain("1 expense account ");
    expect(
      blockGuidance({ block: "accounts_unmapped", unmappedAccounts: ["a", "b"], unmappedTaxes: [] })
        .message
    ).toContain("2 expense accounts");
    expect(
      blockGuidance({
        block: "taxes_unmapped",
        unmappedAccounts: [],
        unmappedTaxes: ["GST", "PST"],
      }).message
    ).toContain("GST, PST tax codes");
  });

  it("returns empty + no link when not blocked", () => {
    expect(blockGuidance({ block: null, ...empty })).toEqual({
      message: "",
      linkToSettings: false,
    });
  });
});

describe("isReconnectReason", () => {
  it("is true only for not_connected", () => {
    expect(isReconnectReason("not_connected")).toBe(true);
    expect(isReconnectReason("qbo_error")).toBe(false);
    expect(isReconnectReason("blocked")).toBe(false);
    expect(isReconnectReason(null)).toBe(false);
    expect(isReconnectReason(undefined)).toBe(false);
  });
});

describe("constants", () => {
  it("points the reconnect link at the QuickBooks settings anchor", () => {
    expect(QBO_SETTINGS_HREF).toBe("/settings#quickbooks");
    expect(QBO_RECONNECT_NOTICE).toMatch(/reconnect quickbooks/i);
  });
});
