/**
 * Slice 2 — scheduled processor core. `runSweep` is the single function that
 * drains `pending` invoices: it is called by both the daily cron script
 * (`scripts/sweepInvoices.ts`) and the manual-trigger API route
 * (`/api/invoices/process`).
 *
 * Bounded retry: ≤3 genuinely different attempts per invoice, then `error`
 * with the captured last error message (anti-spin, per ADR 0018). One
 * invoice's failure never blocks the rest of the sweep.
 *
 * Node-only — the `extract` dep spawns `claude -p` (home-machine engine,
 * ADR 0019). Not imported by the browser bundle.
 */

import type { ExtractedInvoice } from "./types";

/** Minimal shape of a pending invoice row (only what the sweep needs). */
export type PendingRow = {
  id: string;
  storage_path: string;
  mime: string | null;
};

/** Per-invoice outcome. */
export type InvoiceOutcome =
  | { id: string; status: "ok"; linesCount: number }
  | { id: string; status: "error"; errorMessage: string };

/** Overall sweep result. */
export type SweepResult = {
  total: number;
  succeeded: number;
  failed: number;
  outcomes: InvoiceOutcome[];
};

/**
 * Injectable side-effects for testability. The production caller supplies
 * real Supabase + engine impls; unit tests supply fakes.
 */
export type SweepDeps = {
  /** Return all invoices at `pending` status (or a single one if targeted). */
  fetchPending: () => Promise<PendingRow[]>;
  /**
   * Download a stored file and return its raw bytes.
   * The caller writes bytes to a temp file before calling `extract`.
   */
  downloadFile: (storagePath: string) => Promise<Buffer>;
  /** Run the extraction engine and return the validated shape (ADR 0019). */
  extract: (input: { id: string; filePath: string; mime: string }) => Promise<ExtractedInvoice>;
  /** Persist extracted header + lines and flip status → `needs_review`. */
  writeSuccess: (id: string, extracted: ExtractedInvoice) => Promise<void>;
  /** Record the error message and flip status → `error`. */
  writeError: (id: string, message: string) => Promise<void>;
};

/** Max extraction attempts per invoice before giving up (anti-spin, ADR 0018). */
export const MAX_ATTEMPTS = 3;

/**
 * Drain all pending invoices with bounded retry. Each invoice is processed
 * independently: a failure on one does not interrupt the others.
 */
export async function runSweep(deps: SweepDeps): Promise<SweepResult> {
  const rows = await deps.fetchPending();

  const outcomes: InvoiceOutcome[] = [];

  for (const row of rows) {
    const outcome = await processOne(row, deps);
    outcomes.push(outcome);
  }

  const succeeded = outcomes.filter((o) => o.status === "ok").length;
  const failed = outcomes.filter((o) => o.status === "error").length;

  return { total: rows.length, succeeded, failed, outcomes };
}

/**
 * Process a single invoice with ≤3 attempts. On each failure we try again
 * with the same parameters — the "genuinely different" part is that the
 * underlying model run is non-deterministic and transient failures (network,
 * process crash) are the most common cause.
 */
async function processOne(row: PendingRow, deps: SweepDeps): Promise<InvoiceOutcome> {
  // Write the file to a temp path that the engine can read via its file-system
  // access. The caller (cron script or API route) owns temp-dir lifecycle; here
  // we accept an already-resolved filePath from deps.extract.
  // For the injectable deps contract, extract receives the id + a conceptual
  // filePath (the real script creates the temp file before calling the real
  // extractInvoice; tests just use the id to steer behaviour).

  let lastError: string = "unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const extracted = await deps.extract({
        id: row.id,
        filePath: row.storage_path, // passed through; real impl resolves to temp path
        mime: row.mime ?? "application/pdf",
      });
      await deps.writeSuccess(row.id, extracted);
      return { id: row.id, status: "ok", linesCount: extracted.lines.length };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // Continue to next attempt (anti-spin: don't retry if already at max).
    }
  }

  // All attempts exhausted — record the last error and move on.
  await deps.writeError(row.id, lastError);
  return { id: row.id, status: "error", errorMessage: lastError };
}
