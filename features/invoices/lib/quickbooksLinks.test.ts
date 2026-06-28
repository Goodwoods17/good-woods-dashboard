/**
 * Unit tests for the central QuickBooks links mapping (QBO S2, issue #148).
 * Pure functions — no Supabase, no React, no QBO API. The "a link round-trips"
 * done-when is proven here.
 */
import { describe, it, expect } from "vitest";
import {
  rowToLink,
  linkToRow,
  linkToInsert,
  resolveVendorRef,
  type QuickbooksLink,
  type QuickbooksLinkRow,
} from "./quickbooksLinks";

const sampleLink: QuickbooksLink = {
  id: "11111111-0000-4000-8000-000000000001",
  localType: "invoice",
  localId: "inv-001",
  qboType: "Bill",
  qboId: "qbo-bill-42",
  realmId: "9130347",
  environment: "sandbox",
  syncedAt: "2026-06-28T12:00:00.000Z",
};

const sampleRow: QuickbooksLinkRow = {
  id: "11111111-0000-4000-8000-000000000001",
  local_type: "invoice",
  local_id: "inv-001",
  qbo_type: "Bill",
  qbo_id: "qbo-bill-42",
  realm_id: "9130347",
  environment: "sandbox",
  synced_at: "2026-06-28T12:00:00.000Z",
};

describe("quickbooksLinks mapping", () => {
  it("rowToLink maps every snake_case field to camelCase", () => {
    expect(rowToLink(sampleRow)).toEqual(sampleLink);
  });

  it("linkToRow maps every camelCase field to snake_case", () => {
    expect(linkToRow(sampleLink)).toEqual(sampleRow);
  });

  it("a link round-trips object → row → object unchanged", () => {
    expect(rowToLink(linkToRow(sampleLink))).toEqual(sampleLink);
  });

  it("a row round-trips row → object → row unchanged", () => {
    expect(linkToRow(rowToLink(sampleRow))).toEqual(sampleRow);
  });

  it("preserves null environment / synced_at through the round-trip", () => {
    const unsynced: QuickbooksLink = {
      ...sampleLink,
      environment: null,
      syncedAt: null,
    };
    expect(rowToLink(linkToRow(unsynced))).toEqual(unsynced);
  });

  it("linkToInsert omits the generated id and defaults optional fields to null", () => {
    expect(
      linkToInsert({
        localType: "vendor",
        localId: "contact-7",
        qboType: "Vendor",
        qboId: "qbo-vendor-99",
        realmId: "9130347",
      })
    ).toEqual({
      local_type: "vendor",
      local_id: "contact-7",
      qbo_type: "Vendor",
      qbo_id: "qbo-vendor-99",
      realm_id: "9130347",
      environment: null,
      synced_at: null,
    });
  });
});

describe("resolveVendorRef precedence (slice-8 migration onto the central table)", () => {
  it("prefers the central link when present", () => {
    expect(resolveVendorRef("qbo-central-1", "qbo-legacy-9")).toBe("qbo-central-1");
  });

  it("falls back to the legacy embedded id when no central link", () => {
    expect(resolveVendorRef(null, "qbo-legacy-9")).toBe("qbo-legacy-9");
    expect(resolveVendorRef(undefined, "qbo-legacy-9")).toBe("qbo-legacy-9");
  });

  it("treats an empty-string central link as absent", () => {
    expect(resolveVendorRef("", "qbo-legacy-9")).toBe("qbo-legacy-9");
  });

  it("returns null when neither source has a value", () => {
    expect(resolveVendorRef(null, null)).toBeNull();
    expect(resolveVendorRef(undefined, undefined)).toBeNull();
  });
});
