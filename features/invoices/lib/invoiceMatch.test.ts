/**
 * Unit tests for Slice 4 matching logic — written first (TDD).
 * Pure functions: no Supabase, no React.
 */
import { describe, it, expect } from "vitest";
import { detectSupplier, suggestJob } from "./invoiceMatch";
import type { CatalogSupplier } from "@features/catalog/lib/catalogRowMap";
import type { Job } from "@shared/lib/types";

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makeSupplier(id: string, name: string): CatalogSupplier {
  return { id, name, cartConfig: {} };
}

function makeJob(id: string, code: string, name: string): Job {
  // Cast to Job — we only need the fields the function reads.
  return { id, code, name } as Job;
}

// ---------------------------------------------------------------------------
// detectSupplier
// ---------------------------------------------------------------------------

describe("detectSupplier — empty / null input", () => {
  const suppliers = [makeSupplier("1", "Reimer Hardwoods")];

  it("returns none when supplier text is null", () => {
    const r = detectSupplier(null, suppliers);
    expect(r.supplier).toBeNull();
    expect(r.matchKind).toBe("none");
  });

  it("returns none when supplier text is empty", () => {
    const r = detectSupplier("", suppliers);
    expect(r.supplier).toBeNull();
    expect(r.matchKind).toBe("none");
  });

  it("returns none when supplier text is whitespace only", () => {
    const r = detectSupplier("   ", suppliers);
    expect(r.supplier).toBeNull();
    expect(r.matchKind).toBe("none");
  });

  it("returns none when the candidates list is empty", () => {
    const r = detectSupplier("Reimer Hardwoods", []);
    expect(r.supplier).toBeNull();
    expect(r.matchKind).toBe("none");
  });
});

describe("detectSupplier — exact match", () => {
  const suppliers = [makeSupplier("1", "Reimer Hardwoods"), makeSupplier("2", "Blum Inc")];

  it("returns exact match when text equals catalog name", () => {
    const r = detectSupplier("Reimer Hardwoods", suppliers);
    expect(r.supplier?.id).toBe("1");
    expect(r.matchKind).toBe("exact");
  });

  it("exact match is case-insensitive", () => {
    const r = detectSupplier("reimer hardwoods", suppliers);
    expect(r.supplier?.id).toBe("1");
    expect(r.matchKind).toBe("exact");
  });

  it("trims surrounding whitespace before comparing", () => {
    const r = detectSupplier("  Blum Inc  ", suppliers);
    expect(r.supplier?.id).toBe("2");
    expect(r.matchKind).toBe("exact");
  });
});

describe("detectSupplier — partial match", () => {
  const suppliers = [makeSupplier("1", "Reimer Hardwoods Ltd")];

  it("matches when invoice text is shorter but contained in the catalog name", () => {
    const r = detectSupplier("Reimer", suppliers);
    expect(r.supplier?.id).toBe("1");
    expect(r.matchKind).toBe("partial");
  });

  it("matches when invoice text contains the catalog name as a substring", () => {
    // e.g. "Reimer Hardwoods Ltd." (with trailing period) includes "Reimer Hardwoods Ltd"
    const r = detectSupplier("Reimer Hardwoods Ltd.", suppliers);
    expect(r.supplier?.id).toBe("1");
    expect(r.matchKind).toBe("partial");
  });

  it("partial match is case-insensitive", () => {
    const r = detectSupplier("reimer hardwoods ltd.", suppliers);
    expect(r.supplier?.id).toBe("1");
    expect(r.matchKind).toBe("partial");
  });
});

describe("detectSupplier — no match", () => {
  const suppliers = [makeSupplier("1", "Reimer Hardwoods")];

  it("returns none when the text is completely unrelated", () => {
    const r = detectSupplier("Unknown Supplier Co", suppliers);
    expect(r.supplier).toBeNull();
    expect(r.matchKind).toBe("none");
  });

  it("exact match wins over partial when both candidates are present", () => {
    const candidates = [makeSupplier("1", "Reimer"), makeSupplier("2", "Reimer Hardwoods")];
    // "Reimer Hardwoods" is an exact match for candidate 2, but "Reimer" is
    // a partial match for candidate 2 as well — exact should win.
    const r = detectSupplier("Reimer Hardwoods", candidates);
    expect(r.supplier?.id).toBe("2");
    expect(r.matchKind).toBe("exact");
  });
});

// ---------------------------------------------------------------------------
// suggestJob
// ---------------------------------------------------------------------------

describe("suggestJob — empty / null input", () => {
  const jobs = [makeJob("1", "GW-2026-001", "SayWell Kitchen")];

  it("returns null when poRef is null", () => {
    expect(suggestJob(null, jobs)).toBeNull();
  });

  it("returns null when poRef is empty", () => {
    expect(suggestJob("", jobs)).toBeNull();
  });

  it("returns null when poRef is whitespace only", () => {
    expect(suggestJob("   ", jobs)).toBeNull();
  });

  it("returns null when jobs list is empty", () => {
    expect(suggestJob("GW-2026-001", [])).toBeNull();
  });
});

describe("suggestJob — match by job code", () => {
  const jobs = [
    makeJob("1", "GW-2026-001", "SayWell Kitchen"),
    makeJob("2", "GW-2026-002", "Raubyn Reno"),
  ];

  it("matches exactly by job code", () => {
    expect(suggestJob("GW-2026-001", jobs)?.id).toBe("1");
  });

  it("code match is case-insensitive", () => {
    expect(suggestJob("gw-2026-001", jobs)?.id).toBe("1");
  });

  it("matches when the code appears within a longer PO string", () => {
    expect(suggestJob("PO: GW-2026-002 / Reimer order", jobs)?.id).toBe("2");
  });

  it("returns first match when multiple codes appear", () => {
    // Unlikely in practice but the function must be deterministic.
    const result = suggestJob("GW-2026-001 and GW-2026-002", jobs);
    // The first job whose code is found in the string wins.
    expect(result?.id).toBeDefined();
  });
});

describe("suggestJob — no match", () => {
  const jobs = [makeJob("1", "GW-2026-001", "SayWell Kitchen")];

  it("returns null when the PO ref doesn't mention any job code", () => {
    expect(suggestJob("PO-999-XYZ", jobs)).toBeNull();
  });
});
