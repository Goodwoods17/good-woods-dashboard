import type { PhaseCapacityRow } from "@features/scheduling/lib/capacity";
import { detectFloatingBottleneck } from "@features/scheduling/lib/committedDate";
import { MILESTONE_STAGES } from "@shared/lib/types";

/**
 * S16 — Capacity-aware quote dates in estimator (issue #104).
 *
 * Pure helpers for surfacing the capacity-aware committed install date and
 * a one-line capacity warning at quote time. Ships behind
 * NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format an ISO date as a short human-readable "Jul 28". */
function fmtDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Build the one-line capacity warning shown in the QuoteSummary when a
 * work-center is near or over capacity this week.
 *
 * Returns null when all phases have room (nothing unusual to warn about).
 * When a bottleneck exists, names it + its utilization + the resulting
 * realistic committed date so the estimator can set honest expectations:
 *   "Assembly is at 150% this week → realistically Aug 28"
 */
export function capacityQuoteWarning(
  phaseRows: PhaseCapacityRow[],
  installDate: string
): string | null {
  const bottleneck = detectFloatingBottleneck(phaseRows);
  if (!bottleneck) return null;

  // Use the canonical label from MILESTONE_STAGES (e.g. "CNC / Cut") so the
  // warning matches the vocabulary the owner already sees in the capacity panel.
  const label = MILESTONE_STAGES.find((s) => s.key === bottleneck.phase)?.label ?? bottleneck.phase;

  const pct = `${Math.round(Math.min(bottleneck.ratio, 99) * 100)}%`;
  return `${label} is at ${pct} this week → realistically ${fmtDate(installDate)}`;
}
