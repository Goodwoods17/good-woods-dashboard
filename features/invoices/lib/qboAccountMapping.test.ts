/**
 * Unit tests for QBO S4 account + tax-code mapping helpers (issue #150).
 *
 * Pure functions — no Supabase, no QBO API, no React. Covers:
 * - parseQboAccountList / parseQboTaxCodeList
 * - normalizeMapName
 * - suggestTaxCode (auto-suggest GST/PST → per-company TaxCodeRef by name)
 * - resolveBillLineRefs (a bill line + its tax → AccountRef + TaxCodeRef)
 * - detectUnmappedMappings (the block-until-mapped gate signal)
 */
import { describe, it, expect } from "vitest";
import {
  parseQboAccountList,
  parseQboTaxCodeList,
  normalizeMapName,
  suggestTaxCode,
  resolveBillLineRefs,
  detectUnmappedMappings,
  buildAccountRequirements,
  LOCAL_TAX_TYPES,
  type QboTaxCode,
} from "./qboAccountMapping";

// ---------------------------------------------------------------------------
// Parsing the QBO query responses
// ---------------------------------------------------------------------------

describe("parseQboAccountList", () => {
  it("maps the QueryResponse.Account array to QboAccount[]", () => {
    const body = {
      QueryResponse: {
        Account: [
          { Id: "60", Name: "Job Materials", AccountType: "Cost of Goods Sold", Active: true },
          { Id: "7", Name: "Subcontractors", AccountType: "Expense", Active: true },
          { Id: "9", Name: "Old Account", AccountType: "Expense", Active: false },
        ],
      },
    };
    const accounts = parseQboAccountList(body);
    expect(accounts).toEqual([
      { id: "60", name: "Job Materials", accountType: "Cost of Goods Sold", active: true },
      { id: "7", name: "Subcontractors", accountType: "Expense", active: true },
      { id: "9", name: "Old Account", accountType: "Expense", active: false },
    ]);
  });

  it("returns an empty array for an empty/missing body", () => {
    expect(parseQboAccountList({})).toEqual([]);
    expect(parseQboAccountList(null)).toEqual([]);
    expect(parseQboAccountList({ QueryResponse: {} })).toEqual([]);
  });

  it("drops rows without an Id", () => {
    const body = { QueryResponse: { Account: [{ Name: "Nameless", AccountType: "Expense" }] } };
    expect(parseQboAccountList(body)).toEqual([]);
  });
});

describe("parseQboTaxCodeList", () => {
  it("maps the QueryResponse.TaxCode array to QboTaxCode[]", () => {
    const body = {
      QueryResponse: {
        TaxCode: [
          { Id: "4", Name: "GST", Active: true },
          { Id: "5", Name: "PST (BC)", Active: true },
          { Id: "6", Name: "GST/PST BC", Active: true },
          { Id: "7", Name: "Exempt", Active: false },
        ],
      },
    };
    expect(parseQboTaxCodeList(body)).toEqual([
      { id: "4", name: "GST", active: true },
      { id: "5", name: "PST (BC)", active: true },
      { id: "6", name: "GST/PST BC", active: true },
      { id: "7", name: "Exempt", active: false },
    ]);
  });

  it("returns an empty array for a missing body", () => {
    expect(parseQboTaxCodeList(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// normalizeMapName
// ---------------------------------------------------------------------------

describe("normalizeMapName", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeMapName("  GST/PST  BC ")).toBe("gst/pst bc");
  });
});

// ---------------------------------------------------------------------------
// suggestTaxCode — auto-suggest GST/PST by name
// ---------------------------------------------------------------------------

const TAX_CODES: QboTaxCode[] = [
  { id: "4", name: "GST", active: true },
  { id: "5", name: "PST (BC)", active: true },
  { id: "6", name: "GST/PST BC", active: true },
  { id: "8", name: "Old GST", active: false },
];

describe("suggestTaxCode", () => {
  it("prefers an exact name match for GST", () => {
    expect(suggestTaxCode("GST", TAX_CODES)?.id).toBe("4");
  });

  it("matches PST by substring when there is no exact name", () => {
    expect(suggestTaxCode("PST", TAX_CODES)?.id).toBe("5");
  });

  it("ignores inactive tax codes", () => {
    const onlyInactive: QboTaxCode[] = [{ id: "8", name: "GST", active: false }];
    expect(suggestTaxCode("GST", onlyInactive)).toBeNull();
  });

  it("returns null when nothing matches", () => {
    const codes: QboTaxCode[] = [{ id: "9", name: "Zero-rated", active: true }];
    expect(suggestTaxCode("GST", codes)).toBeNull();
  });

  it("exposes the canonical local tax types", () => {
    expect(LOCAL_TAX_TYPES).toEqual(["GST", "PST"]);
  });
});

// ---------------------------------------------------------------------------
// resolveBillLineRefs — a bill line + its tax → AccountRef + TaxCodeRef
// ---------------------------------------------------------------------------

describe("resolveBillLineRefs", () => {
  const maps = {
    accountByLocal: { "5000-Materials": "60", Subcontractors: "7" },
    taxByLocal: { GST: "4", PST: "5", GST_PST: "6" },
  };

  it("resolves both an account and a tax code when mapped", () => {
    const refs = resolveBillLineRefs(
      { categoryKey: "5000-Materials", taxCodeKey: "GST_PST" },
      maps
    );
    expect(refs).toEqual({
      accountRef: "60",
      taxCodeRef: "6",
      unmappedAccount: false,
      unmappedTax: false,
    });
  });

  it("flags an unmapped account when the category has no link", () => {
    const refs = resolveBillLineRefs({ categoryKey: "9999-Unknown", taxCodeKey: null }, maps);
    expect(refs.accountRef).toBeNull();
    expect(refs.unmappedAccount).toBe(true);
    expect(refs.unmappedTax).toBe(false);
  });

  it("flags an unmapped account when the line carries no category at all", () => {
    const refs = resolveBillLineRefs({ categoryKey: null, taxCodeKey: null }, maps);
    expect(refs.unmappedAccount).toBe(true);
  });

  it("flags an unmapped tax code when a taxable line's tax key has no link", () => {
    const refs = resolveBillLineRefs({ categoryKey: "Subcontractors", taxCodeKey: "HST" }, maps);
    expect(refs.taxCodeRef).toBeNull();
    expect(refs.unmappedTax).toBe(true);
  });

  it("never flags tax for a non-taxable (null tax key) line", () => {
    const refs = resolveBillLineRefs({ categoryKey: "Subcontractors", taxCodeKey: null }, maps);
    expect(refs.taxCodeRef).toBeNull();
    expect(refs.unmappedTax).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectUnmappedMappings — the block-until-mapped gate signal
// ---------------------------------------------------------------------------

describe("detectUnmappedMappings", () => {
  it("reports fullyMapped when every required key has a link", () => {
    const state = detectUnmappedMappings({
      requiredAccountKeys: ["5000-Materials", "Subcontractors"],
      requiredTaxKeys: ["GST", "PST"],
      accountByLocal: { "5000-Materials": "60", Subcontractors: "7" },
      taxByLocal: { GST: "4", PST: "5" },
    });
    expect(state).toEqual({
      unmappedAccounts: [],
      unmappedTaxes: [],
      fullyMapped: true,
    });
  });

  it("lists the missing account and tax keys and is not fullyMapped", () => {
    const state = detectUnmappedMappings({
      requiredAccountKeys: ["5000-Materials", "Subcontractors", "9000-New"],
      requiredTaxKeys: ["GST", "PST"],
      accountByLocal: { "5000-Materials": "60" },
      taxByLocal: { GST: "4" },
    });
    expect(state.unmappedAccounts).toEqual(["Subcontractors", "9000-New"]);
    expect(state.unmappedTaxes).toEqual(["PST"]);
    expect(state.fullyMapped).toBe(false);
  });

  it("de-duplicates required keys", () => {
    const state = detectUnmappedMappings({
      requiredAccountKeys: ["A", "A", "B"],
      requiredTaxKeys: [],
      accountByLocal: { A: "1" },
      taxByLocal: {},
    });
    expect(state.unmappedAccounts).toEqual(["B"]);
  });

  it("ignores empty/blank required keys", () => {
    const state = detectUnmappedMappings({
      requiredAccountKeys: ["", "  ", "B"],
      requiredTaxKeys: [],
      accountByLocal: {},
      taxByLocal: {},
    });
    expect(state.unmappedAccounts).toEqual(["B"]);
  });
});

// ---------------------------------------------------------------------------
// buildAccountRequirements — the per-account mapping rows the settings UI draws
// ---------------------------------------------------------------------------

describe("buildAccountRequirements", () => {
  it("returns one row per required key with its current mapping", () => {
    const rows = buildAccountRequirements(["5000-Materials", "Subcontractors", "9000-New"], {
      "5000-Materials": "60",
      Subcontractors: "7",
    });
    expect(rows).toEqual([
      { localId: "5000-Materials", mappedQboId: "60" },
      { localId: "Subcontractors", mappedQboId: "7" },
      { localId: "9000-New", mappedQboId: null },
    ]);
  });

  it("preserves input order, de-duplicates, and ignores blank keys", () => {
    const rows = buildAccountRequirements(["B", "B", "", "  ", "A"], { A: "1" });
    expect(rows).toEqual([
      { localId: "B", mappedQboId: null },
      { localId: "A", mappedQboId: "1" },
    ]);
  });

  it("trims surrounding whitespace from keys before looking them up", () => {
    const rows = buildAccountRequirements([" Subcontractors "], { Subcontractors: "7" });
    expect(rows).toEqual([{ localId: "Subcontractors", mappedQboId: "7" }]);
  });

  it("returns an empty array when there are no required keys", () => {
    expect(buildAccountRequirements([], { A: "1" })).toEqual([]);
  });
});
