import type { Job, CostLine } from "@shared/lib/types";
import { newActivity } from "@features/jobs/lib/activity";
import { formatCAD } from "@shared/lib/format";
import type { LineItem, CabinetSummary, Room } from "./types";
import type { EstimateTotals } from "./totals";
import type { EstimateTemplate } from "./templates";
import { totalCabinetCount, totalCabinetLinearFt } from "./types";
import {
  seedPhaseDurationsFromHistory,
  type PhaseCapacityRow,
  type CapacitySession,
} from "@features/scheduling/lib/capacity";
import {
  phaseVarianceNudgeDays,
  computeCapacityAwareSchedule,
  computeRiskTieredBuffer,
  capacityAwareCommittedDate,
} from "@features/scheduling/lib/committedDate";

/**
 * Optional S16 capacity input. When provided (and SCHEDULING_ENABLED is on),
 * the committed install date is derived from the shop's real capacity + load
 * instead of the flat '+45 days' fallback.
 */
export type SchedulingInput = {
  /** Phase capacity rows for the current week (from buildCapacityModel). */
  phaseRows: PhaseCapacityRow[];
  /** Completed labour sessions used to seed phase durations from history. */
  sessions: CapacitySession[];
  /**
   * Earliest bookable start date (ISO YYYY-MM-DD) from findEarliestBookableStart.
   * Falls back to today when the capacity finder finds nothing.
   */
  startDate: string;
};

type Input = {
  client: string;
  /**
   * The billable contact (jobs.payer_id, NOT NULL FK -> contacts). Required:
   * the DB rejects a null payer, so "Save as Job" cannot omit it.
   */
  payerId: string;
  project: string;
  lines: LineItem[];
  overheadPct: number;
  totals: EstimateTotals;
  existingJobs: Job[];
  cabinetSummary: CabinetSummary;
  rooms?: Room[];
  template?: EstimateTemplate;
  /** When provided, computes a capacity-aware committed install date (S16). */
  scheduling?: SchedulingInput;
};

export function createJobFromEstimate(input: Input): Job {
  const {
    client,
    payerId,
    project,
    lines,
    overheadPct,
    totals,
    existingJobs,
    cabinetSummary,
    rooms,
    template,
  } = input;

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const code = nextJobCode(existingJobs);

  // The job-level CostLine schema is (materials | labour | overhead). We
  // also expose pre-work as a separate labour-flavoured bucket so margin
  // reports can see it isolated. Contingency is recorded at FULL value
  // since the estimator's effectiveMarginPct already treats it as
  // expected labour (i.e. not as bonus profit) — bookkeeping reconciles
  // with the in-app margin.
  const costs: CostLine[] = [
    {
      id: "c-mat",
      category: "materials",
      label: "Materials (estimator)",
      amount: round2(totals.costs.materials),
    },
    {
      id: "c-lab",
      category: "labour",
      label: "Labour (estimator)",
      amount: round2(totals.costs.labour),
    },
    {
      id: "c-oh",
      category: "overhead",
      label: `Overhead (${overheadPct}%)`,
      amount: round2(totals.overhead),
    },
  ];
  if (totals.costs.prework > 0) {
    costs.push({
      id: "c-prework",
      category: "labour",
      label: "Pre-work (internal, not billed)",
      amount: round2(totals.costs.prework),
    });
  }
  if (totals.contingency > 0) {
    // Contingency is expected labour for unknowns. Recording it as a
    // labour cost line means revenue - sum(costs) = the same profit
    // figure as totals.effectiveMarginPct (now treats contingency as
    // expected labour) so the estimator preview and the saved Job
    // reconcile.
    costs.push({
      id: "c-contingency",
      category: "labour",
      label: "Contingency budget (expected unknowns)",
      amount: round2(totals.contingency),
    });
  }

  // S16: capacity-aware committed install date when scheduling context is
  // provided; falls back to the original flat '+45 days' heuristic so the
  // estimator stays functional when the flag is off or data is unavailable.
  let installDateStr: string;
  if (input.scheduling && input.scheduling.phaseRows.length > 0) {
    const { phaseRows, sessions, startDate } = input.scheduling;
    const durations = seedPhaseDurationsFromHistory(sessions);
    const schedule = computeCapacityAwareSchedule(startDate, durations, phaseRows);
    const varianceNudge = phaseVarianceNudgeDays(sessions);
    const buffer = computeRiskTieredBuffer({
      totalInternalDays: schedule.totalWorkDays,
      subDependencyCount: 0,
      varianceNudgeDays: varianceNudge,
    });
    installDateStr = capacityAwareCommittedDate(schedule.internalTargetDate, buffer.totalDays);
  } else {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 45);
    installDateStr = fallback.toISOString().slice(0, 10);
  }

  const issued = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 14);

  const cabCount = totalCabinetCount(cabinetSummary);
  const cabLf = totalCabinetLinearFt(cabinetSummary);
  const cabNote = cabCount > 0 ? ` · ${cabCount} cabinets, ${cabLf.toFixed(2)} lf` : "";

  // Filter out disabled rooms' lines + excluded-from-quote (pre-work)
  // lines so the invoice only carries billable rows. Build invoice lines
  // FIRST, then append overhead + contingency at the bottom so
  // Σ(qty × unitPrice) reconciles to job.revenue.
  const disabledRoomIds = new Set((rooms ?? []).filter((r) => !r.enabled).map((r) => r.id));

  type IndexedLine = { line: LineItem; sub: EstimateTotals["lineSubtotals"][number] };
  const billable: IndexedLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.roomId && disabledRoomIds.has(l.roomId)) continue;
    if (l.excludeFromQuote) continue;
    const sub = totals.lineSubtotals[i];
    if (!sub) continue;
    if (sub.excludedFromQuote || sub.disabledByRoom) continue;
    billable.push({ line: l, sub });
  }

  const invoiceLineItems = billable.map(({ line, sub }) => {
    // Per-line invoice math: show what the customer sees (finished qty +
    // marked-up unit price). When qty is 0 we collapse to a single-unit
    // line so the dollar math still reconciles.
    const safeQty = line.qty > 0 ? line.qty : 1;
    const lineUnitPrice = sub.price / safeQty;
    return {
      description: [line.item || line.description || "Line item", maybeRoomLabel(line, rooms)]
        .filter(Boolean)
        .join(" — "),
      qty: safeQty,
      unitPrice: round2(lineUnitPrice),
    };
  });

  // Append overhead + contingency as their own invoice lines so the
  // printed invoice's line-item sum matches totals.quoted (which is what
  // we store as job.revenue). Without these the client sees less than
  // the agreed quote.
  if (totals.overhead > 0) {
    invoiceLineItems.push({
      description: `Workshop overhead (${overheadPct}%)`,
      qty: 1,
      unitPrice: round2(totals.overhead),
    });
  }
  if (totals.contingency > 0) {
    invoiceLineItems.push({
      description: `Contingency`,
      qty: 1,
      unitPrice: round2(totals.contingency),
    });
  }

  const roomsNote =
    rooms && rooms.length > 0
      ? ` · rooms: ${rooms
          .filter((r) => r.enabled)
          .map((r) => r.name)
          .join(", ")}`
      : "";

  const tplNote = template ? ` · template: ${template.name}` : "";

  return {
    id,
    code,
    name: project.trim(),
    client: client.trim(),
    payerId,
    address: "",
    template: "full_project",
    pipelineStatus: "sold",
    healthStatus: "on_track",
    currentMilestone: "design",
    installDate: installDateStr,
    revenue: round2(totals.quoted),
    costs,
    notes:
      `Created from estimator with ${lines.length} line(s); effective margin ${totals.effectiveMarginPct.toFixed(1)}%` +
      cabNote +
      roomsNote +
      tplNote,
    activity: [
      newActivity("note", `Job created from estimator at price ${formatCAD(totals.quoted)}.`),
    ],
    invoice: {
      number: `INV-${code.slice(3)}`,
      issuedDate: issued.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      lineItems: invoiceLineItems,
    },
  };
}

function maybeRoomLabel(l: LineItem, rooms?: Room[]): string {
  if (!l.roomId || !rooms) return "";
  const room = rooms.find((r) => r.id === l.roomId);
  return room ? room.name : "";
}

function nextJobCode(existingJobs: Job[]): string {
  const year = new Date().getFullYear();
  const prefix = `GW-${year}-`;
  const max = existingJobs
    .map((j) => j.code)
    .filter((c) => c.startsWith(prefix))
    .map((c) => parseInt(c.slice(prefix.length), 10))
    .filter((n) => !isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
