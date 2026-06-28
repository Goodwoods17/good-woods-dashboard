/**
 * Unit tests for QBO S3 vendor matching helpers (issue #149).
 *
 * Pure functions — no Supabase, no QBO API, no React. Covers:
 * - normalizeVendorName
 * - matchVendors (exact / ambiguous / none)
 * - parseQboVendorList
 * - parseQboCreatedVendor
 */
import { describe, it, expect } from "vitest";
import {
  normalizeVendorName,
  matchVendors,
  parseQboVendorList,
  parseQboCreatedVendor,
  type QboVendor,
} from "./qboVendorSync";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const vendors: QboVendor[] = [
  { id: "1", displayName: "Reimer Hardwoods", active: true },
  { id: "2", displayName: "New Surrey Cabinet Doors", active: true },
  { id: "3", displayName: "Toolpath CNC", active: false }, // inactive — never matched
  { id: "4", displayName: "Reimer Hardwoods Distribution", active: true },
];

// ---------------------------------------------------------------------------
// normalizeVendorName
// ---------------------------------------------------------------------------

describe("normalizeVendorName", () => {
  it("lowercases the string", () => {
    expect(normalizeVendorName("REIMER HARDWOODS")).toBe("reimer hardwoods");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeVendorName("  Reimer Hardwoods  ")).toBe("reimer hardwoods");
  });

  it("collapses multiple internal spaces to one", () => {
    expect(normalizeVendorName("New  Surrey   Cabinet  Doors")).toBe(
      "new surrey cabinet doors"
    );
  });

  it("returns an empty string for an already-empty input", () => {
    expect(normalizeVendorName("")).toBe("");
    expect(normalizeVendorName("   ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// matchVendors — exact
// ---------------------------------------------------------------------------

describe("matchVendors — exact match", () => {
  it("returns exact when the name matches one active vendor (case-insensitive)", () => {
    const result = matchVendors("Reimer Hardwoods", vendors);
    expect(result.kind).toBe("exact");
    if (result.kind === "exact") {
      expect(result.vendor.id).toBe("1");
    }
  });

  it("is case-insensitive — lowercase input matches title-case vendor", () => {
    const result = matchVendors("new surrey cabinet doors", vendors);
    expect(result.kind).toBe("exact");
    if (result.kind === "exact") {
      expect(result.vendor.id).toBe("2");
    }
  });

  it("ignores whitespace differences when comparing", () => {
    const result = matchVendors("  Reimer Hardwoods  ", vendors);
    expect(result.kind).toBe("exact");
  });
});

// ---------------------------------------------------------------------------
// matchVendors — ambiguous
// ---------------------------------------------------------------------------

describe("matchVendors — ambiguous", () => {
  it("returns ambiguous when the supplier name is a substring of multiple vendors", () => {
    const result = matchVendors("Reimer", vendors);
    // 'reimer' is a substring of both 'reimer hardwoods' and 'reimer hardwoods distribution'
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates.map((c) => c.id).sort()).toEqual(["1", "4"]);
    }
  });

  it("returns ambiguous when there are multiple exact-name duplicates in QBO", () => {
    const withDupe: QboVendor[] = [
      ...vendors,
      { id: "5", displayName: "Reimer Hardwoods", active: true },
    ];
    const result = matchVendors("Reimer Hardwoods", withDupe);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates.map((c) => c.id).sort()).toEqual(["1", "5"]);
    }
  });

  it("returns ambiguous when the vendor name is a substring of the supplier name", () => {
    // needle 'reimer hardwoods supply co' contains 'reimer hardwoods'
    const result = matchVendors("Reimer Hardwoods Supply Co", vendors);
    // 'reimer hardwoods' is a substring of the needle AND
    // 'reimer hardwoods distribution' partially overlaps via 'reimer hardwoods'
    // → both fuzzy-match
    expect(result.kind).toBe("ambiguous");
  });
});

// ---------------------------------------------------------------------------
// matchVendors — none
// ---------------------------------------------------------------------------

describe("matchVendors — none", () => {
  it("returns none when no active vendor matches", () => {
    const result = matchVendors("Unknown Supplier Ltd", vendors);
    expect(result.kind).toBe("none");
  });

  it("excludes inactive vendors from matching", () => {
    // 'Toolpath CNC' exists but is inactive (active: false) — should return none
    const result = matchVendors("Toolpath CNC", vendors);
    expect(result.kind).toBe("none");
  });

  it("returns none for an empty vendor list", () => {
    const result = matchVendors("Reimer Hardwoods", []);
    expect(result.kind).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// parseQboVendorList
// ---------------------------------------------------------------------------

describe("parseQboVendorList", () => {
  it("parses a well-formed QBO Vendor query response", () => {
    const body = {
      QueryResponse: {
        Vendor: [
          { Id: "42", DisplayName: "Test Supplier", Active: true },
          { Id: "99", DisplayName: "Another Vendor", Active: false },
        ],
        startPosition: 1,
        maxResults: 2,
      },
      time: "2026-06-28T00:00:00.000Z",
    };
    const result = parseQboVendorList(body);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "42", displayName: "Test Supplier", active: true });
    expect(result[1]).toEqual({ id: "99", displayName: "Another Vendor", active: false });
  });

  it("returns an empty array when QueryResponse has no Vendor key", () => {
    expect(parseQboVendorList({ QueryResponse: {} })).toEqual([]);
  });

  it("returns an empty array when QueryResponse is missing entirely", () => {
    expect(parseQboVendorList({})).toEqual([]);
  });

  it("defaults Active to true when the field is omitted", () => {
    const body = {
      QueryResponse: {
        Vendor: [{ Id: "7", DisplayName: "Implicit Active" }],
      },
    };
    const result = parseQboVendorList(body);
    expect(result[0].active).toBe(true);
  });

  it("filters out entries without an Id", () => {
    const body = {
      QueryResponse: {
        Vendor: [
          { DisplayName: "No Id Vendor" },
          { Id: "10", DisplayName: "Valid Vendor" },
        ],
      },
    };
    const result = parseQboVendorList(body);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("10");
  });
});

// ---------------------------------------------------------------------------
// parseQboCreatedVendor
// ---------------------------------------------------------------------------

describe("parseQboCreatedVendor", () => {
  it("parses a well-formed QBO Vendor create response", () => {
    const body = {
      Vendor: { Id: "123", DisplayName: "New Vendor", Active: true },
      time: "2026-06-28T00:00:00.000Z",
    };
    const result = parseQboCreatedVendor(body);
    expect(result).toEqual({ id: "123", displayName: "New Vendor", active: true });
  });

  it("returns null when the Vendor object is missing", () => {
    expect(parseQboCreatedVendor({})).toBeNull();
    expect(parseQboCreatedVendor(null)).toBeNull();
  });

  it("returns null when the Vendor.Id is missing", () => {
    expect(parseQboCreatedVendor({ Vendor: { DisplayName: "No Id" } })).toBeNull();
  });

  it("defaults Active to true when the field is omitted", () => {
    const body = { Vendor: { Id: "55", DisplayName: "New Active Vendor" } };
    const result = parseQboCreatedVendor(body);
    expect(result?.active).toBe(true);
  });
});
