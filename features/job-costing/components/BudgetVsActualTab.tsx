"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { Job, MilestoneStage } from "@shared/lib/types";
import { computeMargin, MILESTONE_STAGES } from "@shared/lib/types";
import { formatCAD, formatPct } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { useBudgetVsActual } from "@features/job-costing/lib/budgetVsActualStore";
import {
  computeBudgetVsActual,
  marginTone,
  UNASSIGNED_LINE,
} from "@features/job-costing/lib/budgetVsActual";
import { TimelineView } from "@features/job-costing/components/bva/TimelineView";
import { PhaseBarsView } from "@features/job-costing/components/bva/PhaseBarsView";
import { PaceMarginView } from "@features/job-costing/components/bva/PaceMarginView";
import { ChevronDown, ChevronRight, Plus, ChevronUp } from "lucide-react";

type BvaView = "timeline" | "bars" | "pace";

const VIEWS: { key: BvaView; label: string }[] = [
  { key: "timeline", label: "Timeline" },
  { key: "bars", label: "Bars" },
  { key: "pace", label: "Pace" },
];

export function BudgetVsActualTab({ job }: { job: Job }) {
  const { data, loading, logActual } = useBudgetVsActual(job.id);
  const [activeView, setActiveView] = useState<BvaView>("timeline");
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<string[]>([]);

  // ── Log actual form state ──────────────────────────────────────────────────
  const [logOpen, setLogOpen] = useState(false);
  const [logKind, setLogKind] = useState<"material" | "subtrade">("material");
  const [amount, setAmount] = useState("");
  const [phaseId, setPhaseId] = useState<MilestoneStage | "">("");
  const [tradeLineId, setTradeLineId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetLogForm() {
    setLogKind("material");
    setAmount("");
    setPhaseId("");
    setTradeLineId("");
    setNote("");
  }

  async function handleLogSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) return;
    setSubmitting(true);
    try {
      if (logKind === "subtrade") {
        if (!tradeLineId) return;
        // Look up subtradeId from the derived lines (bva is guaranteed present here).
        const chosenLine = bva.other.subtrades.lines.find((l) => l.lineId === tradeLineId);
        await logActual({
          kind: "subtrade",
          tradeLineId,
          partnerId: chosenLine?.subtradeId ?? null,
          amount: parsedAmount,
          note,
        });
      } else {
        await logActual({
          kind: "material",
          amount: parsedAmount,
          phaseId: phaseId === "" ? null : phaseId,
          note,
        });
      }
      resetLogForm();
      setLogOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  // Derive job-level inputs
  const materialsBudget = job.costs
    .filter((c) => c.category === "materials")
    .reduce((s, c) => s + c.amount, 0);
  const overhead = job.costs
    .filter((c) => c.category === "overhead")
    .reduce((s, c) => s + c.amount, 0);
  const quotedMargin = computeMargin(job).marginAmount;
  const pipelineComplete = job.pipelineStatus === "complete";

  // Loading state
  if (loading) {
    return (
      <div className="rounded-xl bg-surface shadow-resting p-6 text-sm text-text-tertiary">
        Loading…
      </div>
    );
  }

  // Empty state — data present but no budget lines
  if (!data || data.labourBudget.length === 0) {
    return (
      <div className="rounded-xl bg-surface shadow-resting p-6">
        <p className="text-sm text-text-secondary">
          No budget for this job yet. Build it in the{" "}
          <Link
            href="/estimator"
            className="text-accent hover:text-accent-hover underline underline-offset-2 transition-colors duration-fast"
          >
            Estimator
          </Link>{" "}
          (Save as Job).
        </p>
      </div>
    );
  }

  const bva = computeBudgetVsActual({
    ...data,
    materialsBudget,
    overhead,
    quotedMargin,
    currentMilestone: job.currentMilestone,
    pipelineComplete,
  });

  // Group posted material actuals by their source bill so the BvA report can
  // link each back to its originating invoice (provenance — invoice slice 5).
  const billMap = new Map<
    string,
    { invoiceId: string; amount: number; amountWithTax: number; lineCount: number }
  >();
  for (const a of data.materialActuals) {
    if (a.sourceInvoiceId == null) continue;
    const existing = billMap.get(a.sourceInvoiceId) ?? {
      invoiceId: a.sourceInvoiceId,
      amount: 0,
      amountWithTax: 0,
      lineCount: 0,
    };
    existing.amount += a.amount;
    existing.amountWithTax += a.amountWithTax;
    existing.lineCount += 1;
    billMap.set(a.sourceInvoiceId, existing);
  }
  const sourceBills = Array.from(billMap.values());

  const tone = marginTone(bva.clawback, bva.budgetedMargin);
  const toneChip = {
    on_track: "bg-status-on-track-soft text-status-on-track",
    at_risk: "bg-status-at-risk-soft text-status-at-risk",
    blocked: "bg-status-blocked-soft text-status-blocked",
  }[tone];

  function togglePhase(phaseId: string) {
    setExpandedPhaseIds((prev) =>
      prev.includes(phaseId) ? prev.filter((id) => id !== phaseId) : [...prev, phaseId]
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="rounded-xl bg-surface shadow-resting p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-3xl font-semibold tabular-nums text-text-primary">
              {formatCAD(bva.projectedMargin)}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  toneChip
                )}
              >
                {tone === "on_track" ? "On track" : tone === "at_risk" ? "At risk" : "Blocked"}
              </span>
              <span className="text-xs text-text-tertiary">projected margin</span>
            </div>
            {bva.clawback > 0 && (
              <div className="mt-2 text-sm text-status-blocked tabular-nums">
                Clawback: {formatCAD(bva.clawback)}
              </div>
            )}
          </div>

          {/* View switcher */}
          <div className="inline-flex items-center gap-0.5 bg-white/60 backdrop-blur-md rounded-full p-1 shadow-floating shrink-0">
            {VIEWS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveView(key)}
                aria-pressed={activeView === key}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full transition-colors duration-fast",
                  activeView === key
                    ? "bg-ink-pill text-white"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* View placeholders (Tasks 5–7) */}
      <div className="rounded-xl bg-surface shadow-resting p-6">
        {activeView === "timeline" && <TimelineView bva={bva} job={job} />}
        {activeView === "bars" && <PhaseBarsView bva={bva} />}
        {activeView === "pace" && <PaceMarginView bva={bva} job={job} />}
      </div>

      {/* Per-phase labour table */}
      <div className="rounded-xl bg-surface shadow-resting p-6">
        <h2 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
          Labour by Phase
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-tertiary border-b border-border">
                <th className="text-left pb-2 pr-4 font-medium">Phase</th>
                <th className="text-right pb-2 px-3 font-medium">Budget</th>
                <th className="text-right pb-2 px-3 font-medium">Actual</th>
                <th className="text-right pb-2 px-3 font-medium">Variance</th>
                <th className="text-right pb-2 px-3 font-medium">Var%</th>
                <th className="text-left pb-2 pl-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bva.phases.map((phase) => {
                const isExpanded = expandedPhaseIds.includes(phase.phaseId);
                return (
                  <Fragment key={phase.phaseId}>
                    <tr className="group">
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => togglePhase(phase.phaseId)}
                          aria-label={
                            isExpanded ? `Collapse ${phase.label}` : `Expand ${phase.label}`
                          }
                          className="inline-flex items-center gap-1.5 min-h-[44px] text-left font-medium text-text-primary hover:text-accent transition-colors duration-fast"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          )}
                          {phase.label}
                        </button>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-secondary">
                        {formatCAD(phase.budget)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-primary">
                        {formatCAD(phase.actual)}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right tabular-nums",
                          phase.variance > 0
                            ? "text-status-blocked"
                            : phase.variance < 0
                              ? "text-status-on-track"
                              : "text-text-secondary"
                        )}
                      >
                        {formatCAD(phase.variance)}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right tabular-nums",
                          phase.variance > 0
                            ? "text-status-blocked"
                            : phase.variance < 0
                              ? "text-status-on-track"
                              : "text-text-secondary"
                        )}
                      >
                        {phase.variancePct != null ? formatPct(phase.variancePct) : "—"}
                      </td>
                      <td className="py-2 pl-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            phase.complete
                              ? "bg-status-on-track-soft text-status-on-track"
                              : "bg-surface-muted text-text-tertiary"
                          )}
                        >
                          {phase.complete ? "Complete" : "Open"}
                        </span>
                      </td>
                    </tr>
                    {isExpanded &&
                      phase.codes.map((code) => (
                        <tr
                          key={`${phase.phaseId}-${code.codeId ?? code.codeName}`}
                          className="bg-surface-muted/50"
                        >
                          <td className="py-1.5 pr-4 pl-8 text-xs text-text-secondary">
                            {code.codeName}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-xs text-text-tertiary">
                            {formatCAD(code.budget)}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-xs text-text-secondary">
                            {formatCAD(code.actual)}
                          </td>
                          <td
                            className={cn(
                              "py-1.5 px-3 text-right tabular-nums text-xs",
                              code.variance > 0
                                ? "text-status-blocked"
                                : code.variance < 0
                                  ? "text-status-on-track"
                                  : "text-text-tertiary"
                            )}
                          >
                            {formatCAD(code.variance)}
                          </td>
                          <td
                            className={cn(
                              "py-1.5 px-3 text-right tabular-nums text-xs",
                              code.variance > 0
                                ? "text-status-blocked"
                                : code.variance < 0
                                  ? "text-status-on-track"
                                  : "text-text-tertiary"
                            )}
                          >
                            {code.variancePct != null ? formatPct(code.variancePct) : "—"}
                          </td>
                          <td className="py-1.5 pl-3" />
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Other-costs panel */}
      <div className="rounded-xl bg-surface shadow-resting p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Other Costs</h2>
          <button
            type="button"
            onClick={() => {
              const closing = logOpen;
              setLogOpen((p) => !p);
              if (closing) resetLogForm();
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-fast min-h-[44px]",
              logOpen
                ? "bg-surface-muted text-text-secondary hover:text-text-primary"
                : "bg-ink-pill text-white hover:bg-accent-active"
            )}
          >
            {logOpen ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                Close
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Log actual cost
              </>
            )}
          </button>
        </div>

        {/* Log actual form */}
        {logOpen && (
          <form
            onSubmit={handleLogSubmit}
            className="mb-4 rounded-lg bg-surface-muted/30 p-3 flex flex-col gap-3"
          >
            {/* Material | Subtrade toggle */}
            <div
              role="group"
              aria-label="Cost type"
              className="inline-flex items-center gap-0.5 self-start bg-white/60 backdrop-blur-md rounded-full p-1 shadow-floating"
            >
              {(["material", "subtrade"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={logKind === k}
                  onClick={() => setLogKind(k)}
                  className={cn(
                    "inline-flex items-center px-3 py-1 text-xs font-medium rounded-full transition-colors duration-fast min-h-[44px]",
                    logKind === k
                      ? "bg-ink-pill text-white"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {k === "material" ? "Material" : "Subtrade"}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs text-text-secondary mb-1">
                Amount (CAD) <span className="text-status-blocked">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                aria-label="Actual cost amount in CAD"
                className="w-full bg-surface-muted border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Material: Phase selector */}
            {logKind === "material" && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">Phase</label>
                <select
                  value={phaseId}
                  onChange={(e) => setPhaseId(e.target.value as MilestoneStage | "")}
                  aria-label="Phase this cost belongs to"
                  className="w-full bg-surface-muted border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Whole job</option>
                  {MILESTONE_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Subtrade: Trade-line selector */}
            {logKind === "subtrade" && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  Trade line <span className="text-status-blocked">*</span>
                </label>
                <select
                  value={tradeLineId}
                  onChange={(e) => setTradeLineId(e.target.value)}
                  required
                  aria-label="Trade line this subtrade cost belongs to"
                  className="w-full bg-surface-muted border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Select trade line…</option>
                  {bva.other.subtrades.lines
                    .filter((l) => l.lineId !== UNASSIGNED_LINE)
                    .map((l) => (
                      <option key={l.lineId} value={l.lineId}>
                        {l.tradeName} — {l.subtradeName ?? "TBD"}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-xs text-text-secondary mb-1">Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. Lumber from Rona, invoice #1234"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="Note (optional)"
                className="w-full bg-surface-muted border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={
                  !(Number(amount) > 0) || (logKind === "subtrade" && !tradeLineId) || submitting
                }
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium bg-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-fast min-h-[44px]"
              >
                {submitting ? "Saving…" : "Log cost"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {/* Materials */}
          <div className="border-b border-border pb-2">
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm font-medium text-text-primary">Materials</span>
              <div className="flex items-center gap-6 text-sm tabular-nums">
                <span className="text-text-tertiary">
                  Budget: {formatCAD(bva.other.materials.budget)}
                </span>
                <span className="text-text-secondary">
                  Actual: {formatCAD(bva.other.materials.actual)}
                  {data.materialsActualWithTax > bva.other.materials.actual && (
                    <span className="ml-1 text-xs text-text-tertiary">
                      (with PST {formatCAD(data.materialsActualWithTax)})
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "font-medium",
                    bva.other.materials.variance > 0
                      ? "text-status-blocked"
                      : bva.other.materials.variance < 0
                        ? "text-status-on-track"
                        : "text-text-secondary"
                  )}
                >
                  {formatCAD(bva.other.materials.variance)}
                </span>
              </div>
            </div>

            {/* Source bills — provenance for posted invoice actuals (#50). */}
            {sourceBills.length > 0 && (
              <div className="mt-1" data-testid="material-source-bills">
                <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
                  Source bills
                </div>
                <ul className="space-y-0.5">
                  {sourceBills.map((bill) => (
                    <li
                      key={bill.invoiceId}
                      className="flex items-center justify-between gap-4 text-xs"
                    >
                      <Link
                        href={`/invoices/${bill.invoiceId}`}
                        data-testid="material-source-bill-link"
                        className="text-accent hover:text-accent-hover underline underline-offset-2 transition-colors duration-fast"
                      >
                        View bill ({bill.lineCount} {bill.lineCount === 1 ? "line" : "lines"})
                      </Link>
                      <span className="tabular-nums text-text-secondary">
                        {formatCAD(bill.amount)}
                        <span className="ml-1 text-text-tertiary">
                          (with PST {formatCAD(bill.amountWithTax)})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Subtrades — per-line table */}
          <div className="border-b border-border pb-3">
            <div className="text-sm font-medium text-text-primary mb-2">Subtrades</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-text-tertiary border-b border-border">
                    <th className="text-left pb-2 pr-4 font-medium">Trade</th>
                    <th className="text-left pb-2 pr-4 font-medium">Subtrade</th>
                    <th className="text-left pb-2 pr-4 font-medium">Status</th>
                    <th className="text-right pb-2 px-3 font-medium">Budget</th>
                    <th className="text-right pb-2 px-3 font-medium">Actual</th>
                    <th className="text-right pb-2 px-3 font-medium">Variance</th>
                    <th className="text-right pb-2 pl-3 font-medium">Var%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bva.other.subtrades.lines.map((l) => (
                    <tr key={l.lineId}>
                      <td className="py-2 pr-4 text-text-primary">{l.tradeName}</td>
                      <td className="py-2 pr-4 text-text-secondary">
                        {l.subtradeName ?? <span className="text-text-tertiary italic">TBD</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            l.status === "done"
                              ? "bg-status-on-track-soft text-status-on-track"
                              : l.status === "booked"
                                ? "bg-status-at-risk-soft text-status-at-risk"
                                : "bg-surface-muted text-text-tertiary"
                          )}
                        >
                          {l.status === "done"
                            ? "Done"
                            : l.status === "booked"
                              ? "Booked"
                              : "Needed"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-secondary">
                        {formatCAD(l.budget)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-primary">
                        {formatCAD(l.actual)}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right tabular-nums",
                          l.variance > 0
                            ? "text-status-blocked"
                            : l.variance < 0
                              ? "text-status-on-track"
                              : "text-text-secondary"
                        )}
                      >
                        {formatCAD(l.variance)}
                      </td>
                      <td
                        className={cn(
                          "py-2 pl-3 text-right tabular-nums",
                          l.variance > 0
                            ? "text-status-blocked"
                            : l.variance < 0
                              ? "text-status-on-track"
                              : "text-text-secondary"
                        )}
                      >
                        {l.variancePct != null ? formatPct(l.variancePct) : "—"}
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="font-medium border-t border-border">
                    <td className="pt-2 pr-4 text-text-primary" colSpan={3}>
                      Total
                    </td>
                    <td className="pt-2 px-3 text-right tabular-nums text-text-secondary">
                      {formatCAD(bva.other.subtrades.budget)}
                    </td>
                    <td className="pt-2 px-3 text-right tabular-nums text-text-primary">
                      {formatCAD(bva.other.subtrades.actual)}
                    </td>
                    <td
                      className={cn(
                        "pt-2 px-3 text-right tabular-nums",
                        bva.other.subtrades.variance > 0
                          ? "text-status-blocked"
                          : bva.other.subtrades.variance < 0
                            ? "text-status-on-track"
                            : "text-text-secondary"
                      )}
                    >
                      {formatCAD(bva.other.subtrades.variance)}
                    </td>
                    <td
                      className={cn(
                        "pt-2 pl-3 text-right tabular-nums",
                        bva.other.subtrades.variance > 0
                          ? "text-status-blocked"
                          : bva.other.subtrades.variance < 0
                            ? "text-status-on-track"
                            : "text-text-secondary"
                      )}
                    >
                      {bva.other.subtrades.variancePct != null
                        ? formatPct(bva.other.subtrades.variancePct)
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Overhead */}
          <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm font-medium text-text-primary">Overhead</span>
            <div className="flex items-center gap-6 text-sm tabular-nums">
              <span className="text-text-secondary">{formatCAD(bva.other.overhead)}</span>
              <span className="text-text-tertiary text-xs italic">fixed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
