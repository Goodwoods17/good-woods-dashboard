"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { Job, MilestoneStage } from "@shared/lib/types";
import { computeMargin, MILESTONE_STAGES } from "@shared/lib/types";
import { formatCAD, formatPct } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { useBudgetVsActual } from "@features/job-costing/lib/budgetVsActualStore";
import { computeBudgetVsActual, marginTone } from "@features/job-costing/lib/budgetVsActual";
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
  const [amount, setAmount] = useState("");
  const [phaseId, setPhaseId] = useState<MilestoneStage | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetLogForm() {
    setAmount("");
    setPhaseId("");
    setNote("");
  }

  async function handleLogSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) return;
    setSubmitting(true);
    try {
      await logActual({
        kind: "material",
        amount: parsedAmount,
        phaseId: phaseId === "" ? null : phaseId,
        note,
      });
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
              <span className="text-xs text-text-tertiary">
                projected margin (excl. subtrade actuals)
              </span>
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

            {/* Phase */}
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
                disabled={!(Number(amount) > 0) || submitting}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium bg-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-fast min-h-[44px]"
              >
                {submitting ? "Saving…" : "Log cost"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {/* Materials */}
          <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
            <span className="text-sm font-medium text-text-primary">Materials</span>
            <div className="flex items-center gap-6 text-sm tabular-nums">
              <span className="text-text-tertiary">
                Budget: {formatCAD(bva.other.materials.budget)}
              </span>
              <span className="text-text-secondary">
                Actual: {formatCAD(bva.other.materials.actual)}
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

          {/* Subtrades */}
          <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
            <span className="text-sm font-medium text-text-primary">Subtrades</span>
            <div className="flex items-center gap-6 text-sm tabular-nums">
              <span className="text-text-tertiary">
                Budget: {formatCAD(bva.other.subtrades.budget)}
              </span>
              <span className="text-text-tertiary text-xs italic">actuals tracked later</span>
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
