/**
 * Unit tests for the bounded-retry invoice processor (slice 2).
 * All Supabase + engine calls are stubbed — pure logic only.
 *
 * DoD: ≤3 genuinely different attempts; failures land in `error` with a
 * readable reason; a successful attempt sets status → `needs_review`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processInvoice, type ProcessorDeps } from "./processor";

/** A minimal invoice row stub. */
const makeInvoice = (id: string) => ({
  id,
  storage_path: `${id}/source.pdf`,
  mime: "application/pdf" as string | null,
});

/** A minimal ExtractedInvoice stub. */
const fakeExtracted = {
  supplier: "Acme Lumber",
  invoiceNumber: "INV-001",
  issueDate: "2026-06-01",
  dueDate: "2026-07-01",
  poRef: null,
  preTaxTotal: 1000,
  gst: 50,
  pst: 70,
  total: 1120,
  lines: [],
};

/** Build a ProcessorDeps stub with all required fns. */
function makeDeps(overrides: Partial<ProcessorDeps> = {}): ProcessorDeps {
  return {
    downloadFile: vi
      .fn()
      .mockResolvedValue({ tmpDir: "/tmp/test", filePath: "/tmp/test/source.pdf" }),
    cleanupTmp: vi.fn().mockResolvedValue(undefined),
    extractInvoice: vi.fn().mockResolvedValue(fakeExtracted),
    writeBack: vi.fn().mockResolvedValue(undefined),
    markError: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    ...overrides,
  };
}

describe("processInvoice — happy path", () => {
  it("downloads, extracts, and writes back on first attempt", async () => {
    const deps = makeDeps();
    const result = await processInvoice(makeInvoice("inv-1"), deps);

    expect(result.ok).toBe(true);
    expect(deps.downloadFile).toHaveBeenCalledTimes(1);
    expect(deps.extractInvoice).toHaveBeenCalledTimes(1);
    expect(deps.writeBack).toHaveBeenCalledWith("inv-1", fakeExtracted);
    expect(deps.markError).not.toHaveBeenCalled();
    expect(deps.cleanupTmp).toHaveBeenCalled();
  });
});

describe("processInvoice — bounded retry (≤3 attempts)", () => {
  it("retries up to 3 times then marks error on persistent failure", async () => {
    const extractInvoice = vi.fn().mockRejectedValue(new Error("engine down"));
    const markError = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ extractInvoice, markError });

    const result = await processInvoice(makeInvoice("inv-2"), deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/engine down/i);
    // Exactly 3 attempts (anti-spin: ≤3 genuinely different tries then stop)
    expect(extractInvoice).toHaveBeenCalledTimes(3);
    expect(markError).toHaveBeenCalledWith("inv-2", expect.stringContaining("engine down"));
    expect(deps.writeBack).not.toHaveBeenCalled();
    expect(deps.cleanupTmp).toHaveBeenCalled();
  });

  it("succeeds on the second attempt after one failure", async () => {
    const extractInvoice = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(fakeExtracted);
    const deps = makeDeps({ extractInvoice });

    const result = await processInvoice(makeInvoice("inv-3"), deps);

    expect(result.ok).toBe(true);
    expect(extractInvoice).toHaveBeenCalledTimes(2);
    expect(deps.writeBack).toHaveBeenCalledWith("inv-3", fakeExtracted);
    expect(deps.markError).not.toHaveBeenCalled();
  });

  it("succeeds on the third attempt after two failures", async () => {
    const extractInvoice = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient-1"))
      .mockRejectedValueOnce(new Error("transient-2"))
      .mockResolvedValueOnce(fakeExtracted);
    const deps = makeDeps({ extractInvoice });

    const result = await processInvoice(makeInvoice("inv-4"), deps);

    expect(result.ok).toBe(true);
    expect(extractInvoice).toHaveBeenCalledTimes(3);
    expect(deps.writeBack).toHaveBeenCalledWith("inv-4", fakeExtracted);
  });
});

describe("processInvoice — cleanup always runs", () => {
  it("cleans up the temp file even when extraction fails", async () => {
    const extractInvoice = vi.fn().mockRejectedValue(new Error("boom"));
    const cleanupTmp = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ extractInvoice, cleanupTmp });

    await processInvoice(makeInvoice("inv-5"), deps);

    expect(cleanupTmp).toHaveBeenCalled();
  });

  it("marks error and does not throw when download fails (no tmp to clean)", async () => {
    const downloadFile = vi.fn().mockRejectedValue(new Error("no file"));
    const markError = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ downloadFile, markError });

    const result = await processInvoice(makeInvoice("inv-6"), deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no file/i);
    expect(markError).toHaveBeenCalledWith("inv-6", expect.stringContaining("no file"));
    // No tmpDir was ever created, so cleanupTmp is never called (nothing to clean).
    expect(deps.cleanupTmp).not.toHaveBeenCalled();
  });
});

describe("processInvoice — error message is readable", () => {
  it("captures the error message verbatim when markError is called", async () => {
    const extractInvoice = vi.fn().mockRejectedValue(new Error("Connection refused"));
    const markError = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ extractInvoice, markError });

    await processInvoice(makeInvoice("inv-7"), deps);

    expect(markError).toHaveBeenCalledWith("inv-7", expect.stringContaining("Connection refused"));
  });

  it("handles non-Error throws (strings, objects)", async () => {
    const extractInvoice = vi.fn().mockRejectedValue("string error");
    const markError = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ extractInvoice, markError });

    const result = await processInvoice(makeInvoice("inv-8"), deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(typeof result.error).toBe("string");
    expect(markError).toHaveBeenCalledWith("inv-8", expect.any(String));
  });
});
