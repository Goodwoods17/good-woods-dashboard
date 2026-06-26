/**
 * Unit tests for the bounded-retry sweep logic (slice 2). No Supabase / engine
 * I/O in these tests — everything is injected via the `deps` parameter, letting
 * us drive failure scenarios deterministically.
 */
import { describe, it, expect, vi } from "vitest";
import {
  runSweep,
  type SweepDeps,
  type SweepResult,
  type PendingRow,
} from "./processor";

// ---------------------------------------------------------------------------
// Minimal factory helpers
// ---------------------------------------------------------------------------

const FAKE_ROW: PendingRow = {
  id: "inv-1",
  storage_path: "inv-1/source.pdf",
  mime: "application/pdf",
};

function makeSuccessDeps(rows: PendingRow[] = [FAKE_ROW]): SweepDeps {
  return {
    fetchPending: vi.fn().mockResolvedValue(rows),
    downloadFile: vi.fn().mockResolvedValue(Buffer.from("fake")),
    extract: vi.fn().mockResolvedValue({
      supplier: "Acme",
      invoiceNumber: "INV-001",
      issueDate: null,
      dueDate: null,
      poRef: null,
      preTaxTotal: 100,
      gst: 5,
      pst: 7,
      total: 112,
      lines: [],
    }),
    writeSuccess: vi.fn().mockResolvedValue(undefined),
    writeError: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runSweep — basic flow", () => {
  it("returns zero counts when there are no pending invoices", async () => {
    const deps = makeSuccessDeps([]);
    const result = await runSweep(deps);
    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.outcomes).toHaveLength(0);
    expect(deps.downloadFile).not.toHaveBeenCalled();
  });

  it("processes one pending invoice successfully", async () => {
    const deps = makeSuccessDeps();
    const result: SweepResult = await runSweep(deps);
    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.outcomes[0]).toMatchObject({ id: "inv-1", status: "ok" });
    expect(deps.writeSuccess).toHaveBeenCalledOnce();
    expect(deps.writeError).not.toHaveBeenCalled();
  });

  it("calls extract once on success (no retry needed)", async () => {
    const deps = makeSuccessDeps();
    await runSweep(deps);
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });
});

describe("runSweep — bounded retry", () => {
  it("retries extraction up to 3 attempts before recording error", async () => {
    const err = new Error("engine crash");
    const deps = makeSuccessDeps();
    // Always fail
    (deps.extract as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const result = await runSweep(deps);
    // 3 genuinely different attempts, then error
    expect(deps.extract).toHaveBeenCalledTimes(3);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.outcomes[0]).toMatchObject({ id: "inv-1", status: "error" });
    expect(deps.writeError).toHaveBeenCalledOnce();
    expect(deps.writeSuccess).not.toHaveBeenCalled();
  });

  it("succeeds on second attempt (1 failure then success)", async () => {
    const deps = makeSuccessDeps();
    const extract = deps.extract as ReturnType<typeof vi.fn>;
    extract
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        supplier: "Acme",
        invoiceNumber: "INV-002",
        issueDate: null,
        dueDate: null,
        poRef: null,
        preTaxTotal: 50,
        gst: 2.5,
        pst: 3.5,
        total: 56,
        lines: [],
      });
    const result = await runSweep(deps);
    expect(deps.extract).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("succeeds on third attempt (2 failures then success)", async () => {
    const deps = makeSuccessDeps();
    const extract = deps.extract as ReturnType<typeof vi.fn>;
    extract
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce({
        supplier: "Bob",
        invoiceNumber: "INV-003",
        issueDate: null,
        dueDate: null,
        poRef: null,
        preTaxTotal: 200,
        gst: 10,
        pst: 14,
        total: 224,
        lines: [],
      });
    const result = await runSweep(deps);
    expect(deps.extract).toHaveBeenCalledTimes(3);
    expect(result.succeeded).toBe(1);
  });

  it("records the last error message when all 3 attempts fail", async () => {
    const deps = makeSuccessDeps();
    const extract = deps.extract as ReturnType<typeof vi.fn>;
    extract
      .mockRejectedValueOnce(new Error("attempt 1 error"))
      .mockRejectedValueOnce(new Error("attempt 2 error"))
      .mockRejectedValueOnce(new Error("attempt 3 error"));
    const result = await runSweep(deps);
    const outcome = result.outcomes[0];
    expect(outcome.status).toBe("error");
    // Narrow to the error variant to access errorMessage.
    if (outcome.status !== "error") throw new Error("expected error outcome");
    expect(outcome.errorMessage).toBe("attempt 3 error");
    expect(deps.writeError).toHaveBeenCalledWith("inv-1", "attempt 3 error");
  });
});

describe("runSweep — multiple invoices", () => {
  it("processes multiple invoices independently (one failure does not block others)", async () => {
    const rows: PendingRow[] = [
      { id: "inv-a", storage_path: "inv-a/source.pdf", mime: "application/pdf" },
      { id: "inv-b", storage_path: "inv-b/source.pdf", mime: "application/pdf" },
      { id: "inv-c", storage_path: "inv-c/source.pdf", mime: "application/pdf" },
    ];
    const deps = makeSuccessDeps(rows);
    const extract = deps.extract as ReturnType<typeof vi.fn>;

    // inv-b always fails; inv-a and inv-c succeed
    extract.mockImplementation(({ id }: { id: string }) => {
      if (id === "inv-b") return Promise.reject(new Error("b failed"));
      return Promise.resolve({
        supplier: "Acme",
        invoiceNumber: null,
        issueDate: null,
        dueDate: null,
        poRef: null,
        preTaxTotal: null,
        gst: null,
        pst: null,
        total: null,
        lines: [],
      });
    });

    const result = await runSweep(deps);
    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
  });
});
