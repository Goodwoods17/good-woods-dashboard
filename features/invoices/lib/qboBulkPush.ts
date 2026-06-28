/**
 * Pure, I/O-free helpers for QBO S11 — bulk catch-up push (issue #157).
 * No Supabase, no QBO API, no React.
 *
 * Server I/O (querying unpushed invoices, orchestrating the push loop) lives
 * in `qboBulkPushServer.ts`.
 *
 * The bulk push is rate-limit-aware: QBO allows ~500 API calls per minute
 * per realm.  To leave headroom for normal per-invoice pushes we use a
 * conservative inter-push delay of 500 ms (120 calls/min).  The batch is
 * capped at 30 invoices per run to stay safely under Vercel's 60 s timeout;
 * the owner can run again if the backlog exceeds the cap.
 */

/** How many ms to wait between individual invoice pushes. */
export const BULK_PUSH_DELAY_MS = 500;

/** Maximum invoices pushed in a single bulk-push run. */
export const BULK_PUSH_MAX = 30;

/** Outcome of pushing one invoice during a bulk run. */
export type BulkPushItem = {
  invoiceId: string;
  /** "pushed" | "already_pushed" | "blocked" | "error" */
  outcome: "pushed" | "already_pushed" | "blocked" | "error";
  billId?: string | null;
  message?: string | null;
};

/** Aggregated summary returned by a bulk-push run. */
export type BulkPushSummary = {
  pushed: number;
  alreadyPushed: number;
  blocked: number;
  failed: number;
  /** Individual results in push order. */
  items: BulkPushItem[];
};

/**
 * Aggregate a list of per-invoice outcomes into a summary.
 * Pure — deterministic, no I/O.
 */
export function summarizeBulkPush(items: BulkPushItem[]): BulkPushSummary {
  let pushed = 0;
  let alreadyPushed = 0;
  let blocked = 0;
  let failed = 0;

  for (const item of items) {
    switch (item.outcome) {
      case "pushed":
        pushed++;
        break;
      case "already_pushed":
        alreadyPushed++;
        break;
      case "blocked":
        blocked++;
        break;
      case "error":
        failed++;
        break;
    }
  }

  return { pushed, alreadyPushed, blocked, failed, items };
}
