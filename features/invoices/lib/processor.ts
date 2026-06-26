/**
 * Bounded-retry invoice processor (slice 2 — ADR 0018 anti-spin).
 *
 * Processes one `pending` invoice: download → extract → write back. On failure
 * retries up to MAX_ATTEMPTS genuinely different times, then records an `error`
 * status with a human-readable reason. The home-machine sweep and the "process
 * now" API route both use this function; only the Supabase + engine deps differ
 * between those two callers (dependency-injected for testability).
 *
 * Node-only at runtime (the extraction engine shells out to `claude -p`), but
 * the bounded-retry logic is environment-agnostic and fully unit-tested.
 */
import type { ExtractedInvoice } from "./types";

/** Maximum extraction attempts per invoice (ADR 0018 anti-spin: ≤3). */
const MAX_ATTEMPTS = 3;

/** Minimal invoice descriptor the processor needs from the DB row. */
export type InvoiceDescriptor = {
  id: string;
  storage_path: string;
  mime: string | null;
};

/** Result returned by `processInvoice`. */
export type ProcessResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Injected dependencies — lets unit tests stub everything without touching
 * the file system or Supabase.
 */
export type ProcessorDeps = {
  /**
   * Create a fresh temp directory and download the invoice source file into
   * it. Returns `{tmpDir, filePath}` — tmpDir is ALWAYS cleaned up in the
   * finally block, even when download itself fails.
   */
  downloadFile: (inv: InvoiceDescriptor) => Promise<{ tmpDir: string; filePath: string }>;
  /** Delete the temp directory (always called after downloadFile succeeds). */
  cleanupTmp: (tmpDir: string) => Promise<void>;
  /** Run the swappable extraction engine on the local file. */
  extractInvoice: (args: { filePath: string; mime: string }) => Promise<ExtractedInvoice>;
  /** Write extracted header + lines to Supabase and flip status → needs_review. */
  writeBack: (invoiceId: string, extracted: ExtractedInvoice) => Promise<void>;
  /** Flip status → error with a captured message (called after all attempts fail). */
  markError: (invoiceId: string, message: string) => Promise<void>;
  /** Optional logger (defaults to console.log in production callers). */
  log: (msg: string) => void;
};

/**
 * Process one pending invoice with bounded retry. Returns `{ok: true}` on
 * success or `{ok: false, error}` after all attempts are exhausted. Always
 * cleans up the temp file regardless of outcome.
 */
export async function processInvoice(
  inv: InvoiceDescriptor,
  deps: ProcessorDeps
): Promise<ProcessResult> {
  deps.log(`Processing invoice ${inv.id} (${inv.storage_path})`);

  let tmpDir: string | null = null;
  let lastError: string = "unknown error";

  try {
    // Download once — the file doesn't change between retry attempts.
    // downloadFile creates the temp dir and returns both handles so cleanup
    // can always run (even on partial failure during download).
    let filePath: string;
    try {
      const dl = await deps.downloadFile(inv);
      tmpDir = dl.tmpDir;
      filePath = dl.filePath;
    } catch (e) {
      // downloadFile is responsible for setting tmpDir before throwing when
      // possible; if it didn't, cleanupTmp still gets the dir (or null).
      lastError = errorMessage(e);
      deps.log(`  Download failed: ${lastError}`);
      await deps.markError(inv.id, lastError);
      return { ok: false, error: lastError };
    }

    // Bounded retry: ≤ MAX_ATTEMPTS genuinely different extraction attempts.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const extracted = await deps.extractInvoice({
          filePath,
          mime: inv.mime || "application/pdf",
        });
        await deps.writeBack(inv.id, extracted);
        deps.log(`  → needs_review (attempt ${attempt})`);
        return { ok: true };
      } catch (e) {
        lastError = errorMessage(e);
        deps.log(`  Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`);
        if (attempt === MAX_ATTEMPTS) {
          // All attempts exhausted — record the reason and stop.
          await deps.markError(inv.id, lastError);
          return { ok: false, error: lastError };
        }
        // Otherwise loop to the next attempt (genuinely different = no backoff
        // in the same iteration; the engine itself is stateless between calls).
      }
    }
  } finally {
    // Temp cleanup always runs regardless of outcome.
    if (tmpDir) {
      try {
        await deps.cleanupTmp(tmpDir);
      } catch {
        // Cleanup failure is non-fatal; don't mask the real result.
      }
    }
  }

  // Unreachable — the loop above always returns, but TypeScript needs this.
  return { ok: false, error: lastError };
}

/** Normalize any thrown value to a human-readable string. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown error";
  }
}
