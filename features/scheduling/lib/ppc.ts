/**
 * S25 — PPC (Percent-Plan-Complete) + on-time-delivery reliability scorecard
 * + public reliability stat (issue #113). Pure + dependency-free.
 * Ships behind NEXT_PUBLIC_SCHEDULING_P6_ENABLED (off in prod).
 *
 * PPC is the standard Last-Planner metric: how many phase promises were kept
 * vs. planned (open entries excluded). On-time delivery tracks the client-facing
 * committed install date. Coded reasons-for-variance (from S14 re-commits) reveal
 * WHERE reliability is lost, filtered to shop-attributable reasons only
 * (dings_reliability=true, excluding scope_change and client_delay per the issue
 * spec). An optional public reliability stat lets the shop quote its install
 * on-time percentage to clients ("we hit 94% of committed install dates").
 */

import { RECOMMIT_REASON_CODES, reasonCodeMeta } from "./recommit";

// ── Input types ───────────────────────────────────────────────────────────────

/**
 * A ledger entry as needed for the scorecard computation.
 * Drawn from `commitment_ledger` rows — includes `level` (client vs. phase)
 * and the resolution status (open / kept / missed).
 */
export type ScorecardLedgerEntry = {
  /** Whether this is a client-facing install promise or an internal phase target. */
  level: "client" | "phase";
  /** Current state of the commitment. Open entries are excluded from rates. */
  status: "open" | "kept" | "missed";
  /** True when the committed date passed and the promise was not kept. */
  missed: boolean;
};

/**
 * A revision entry as needed for variance analysis.
 * Drawn from `commitment_revisions` rows.
 */
export type ScorecardRevisionEntry = {
  /** The reason code for the re-commit (from S14's RECOMMIT_REASON_CODES). */
  reasonCode: string;
  /**
   * True when this revision counts against shop reliability (S14 `dingsReliability`).
   * False for scope_change, client_delay, and change_orders — those don't reflect
   * shop's own date-keeping.
   */
  dingsReliability: boolean;
};

// ── Output types ──────────────────────────────────────────────────────────────

/** A resolved rate metric with full numerator/denominator detail. */
export type RateMetric = {
  /** Rate in [0, 1]. 0 = none kept; 1 = all kept. */
  rate: number;
  kept: number;
  missed: number;
  /** kept + missed (open entries excluded). */
  total: number;
};

/** One row in the variance-by-reason breakdown. */
export type ReasonVariance = {
  reasonCode: string;
  /** Human-readable label from RECOMMIT_REASON_CODES, or the code itself. */
  label: string;
  /** Count of attributable re-commits with this reason. */
  count: number;
};

/** The assembled reliability scorecard for the whole shop. */
export type ReliabilityScorecard = {
  /**
   * Percent-Plan-Complete: phase-level commitments only, open excluded.
   * Null when there are no resolved phase commitments in the ledger.
   */
  ppc: RateMetric | null;
  /**
   * On-time install delivery: client-level commitments only, open excluded.
   * Null when there are no resolved client install commitments in the ledger.
   */
  onTimeDelivery: RateMetric | null;
  /**
   * Reasons-for-variance breakdown. Only attributable re-commits
   * (dings_reliability=true) — excludes client-initiated and scope changes.
   * Sorted by count descending (worst offenders first).
   */
  varianceByReason: ReasonVariance[];
  /**
   * Optional quote-ready public reliability stat. Null when fewer than 3
   * resolved client install commitments exist (too small a sample to quote
   * reliably). A minimum sample prevents misleading early stats.
   */
  publicReliabilityStat: string | null;
};

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Percent-Plan-Complete: what share of PHASE promises (internal targets) were
 * kept as planned. Excludes open (not-yet-due) entries and client-level installs.
 * Returns null when there are no resolved phase commitments to measure.
 */
export function computePPC(entries: ScorecardLedgerEntry[]): RateMetric | null {
  const resolved = entries.filter((e) => e.level === "phase" && e.status !== "open");
  if (resolved.length === 0) return null;
  const kept = resolved.filter((e) => !e.missed).length;
  const missed = resolved.filter((e) => e.missed).length;
  return { rate: kept / resolved.length, kept, missed, total: resolved.length };
}

/**
 * On-time install delivery: what share of CLIENT-level committed install dates
 * were kept. Excludes open entries and phase-level internal targets.
 * Returns null when there are no resolved client commitments to measure.
 */
export function computeOnTimeDelivery(entries: ScorecardLedgerEntry[]): RateMetric | null {
  const resolved = entries.filter((e) => e.level === "client" && e.status !== "open");
  if (resolved.length === 0) return null;
  const kept = resolved.filter((e) => !e.missed).length;
  const missed = resolved.filter((e) => e.missed).length;
  return { rate: kept / resolved.length, kept, missed, total: resolved.length };
}

/**
 * Variance-by-reason breakdown from re-commit history. Only includes
 * shop-attributable re-commits (dings_reliability=true) so scope changes and
 * client-caused delays don't pollute the shop's self-assessment.
 * Sorted by count descending (worst offender first).
 */
export function varianceByReason(revisions: ScorecardRevisionEntry[]): ReasonVariance[] {
  const counts = new Map<string, number>();
  for (const rev of revisions) {
    if (!rev.dingsReliability) continue;
    counts.set(rev.reasonCode, (counts.get(rev.reasonCode) ?? 0) + 1);
  }
  const entries: ReasonVariance[] = [];
  counts.forEach((count, code) => {
    const meta = RECOMMIT_REASON_CODES.find((r) => r.code === code);
    entries.push({
      reasonCode: code,
      label: meta?.label ?? code,
      count,
    });
  });
  // Sort worst (most frequent) first
  entries.sort((a, b) => b.count - a.count);
  return entries;
}

/**
 * Format a reliability rate [0, 1] as a whole-number percentage string.
 * Uses Math.floor so we never over-represent the stat (94.9% → "94%", not "95%").
 */
export function formatReliabilityRate(rate: number): string {
  return `${Math.floor(rate * 100)}%`;
}

/**
 * Produce a quote-ready public reliability stat sentence, or null when the
 * sample is too small to quote reliably (< 3 resolved client installs).
 * The minimum threshold prevents a single project inflating the number.
 */
export function publicReliabilityStat(onTimeDelivery: RateMetric | null): string | null {
  if (!onTimeDelivery || onTimeDelivery.total < 3) return null;
  const pct = formatReliabilityRate(onTimeDelivery.rate);
  return `We've delivered on our committed install date ${pct} of the time.`;
}

/**
 * Assemble the full reliability scorecard from the shop's commitment ledger
 * and re-commit history. All inputs span ALL jobs (not per-job) — this is a
 * shop-wide aggregate that feeds both the owner dashboard and the public quote stat.
 */
export function buildReliabilityScorecard(
  ledger: ScorecardLedgerEntry[],
  revisions: ScorecardRevisionEntry[]
): ReliabilityScorecard {
  const ppc = computePPC(ledger);
  const onTimeDelivery = computeOnTimeDelivery(ledger);
  return {
    ppc,
    onTimeDelivery,
    varianceByReason: varianceByReason(revisions),
    publicReliabilityStat: publicReliabilityStat(onTimeDelivery),
  };
}

// ── Reason codes re-export (convenience for the UI layer) ────────────────────
// The full catalogue is in recommit.ts; we re-export it so the panel only needs
// this one import.
export { reasonCodeMeta, RECOMMIT_REASON_CODES };
