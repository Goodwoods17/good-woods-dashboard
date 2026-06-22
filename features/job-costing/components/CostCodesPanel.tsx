"use client";

// The "Labour cost codes" panel (ADR 0012 Slice 1) — a bespoke estimator block
// like Pre-work / Delivery. Shows the template's cost-code set with quantities
// auto-filled from the cabinet summary, grouped by phase, and reconciles the
// coded labour budget against the quote's labour subtotal before it freezes.
//
// Cabinet-driven rows (ASM-/INST-*) and DEL-LOAD take their qty from the counts
// (read-only). Non-cabinet driven codes (FIN-SPRAY sqft, CUT-SHEET sheets) and
// every code's minutes-per-unit are editable — manual entry now, Mozaik fill in
// Slice 2, and the learning loop sharpens minutes over time.

import { Lock } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { CostCodeBudget } from "../lib/budget";
import type { BudgetReconciliation } from "../lib/budget";
import { PHASE_LABELS, PHASE_ORDER, findCostCode, type PhaseId } from "../lib/costCodes";

function isQtyEditable(code: string): boolean {
  const def = findCostCode(code);
  if (!def) return false;
  // Cabinet counts and the total-count loading code come from the summary.
  return def.driver != null && !def.cabinetType && code !== "DEL-LOAD";
}

export function CostCodesPanel({
  budget,
  reconciliation,
  qtyByCode,
  minutesByCode,
  onQty,
  onMinutes,
}: {
  budget: CostCodeBudget;
  reconciliation: BudgetReconciliation;
  qtyByCode: Record<string, number>;
  minutesByCode: Record<string, number>;
  onQty: (code: string, qty: number) => void;
  onMinutes: (code: string, minutes: number) => void;
}) {
  const rowsByPhase = new Map<PhaseId, typeof budget.rows>();
  for (const r of budget.rows) {
    const list = rowsByPhase.get(r.phaseId) ?? [];
    list.push(r);
    rowsByPhase.set(r.phaseId, list);
  }
  const phases = PHASE_ORDER.filter((p) => rowsByPhase.has(p));

  return (
    <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-text-primary">Labour cost codes</h3>
        <span className="text-caption text-text-tertiary">
          Frozen as the budget when you save
        </span>
      </div>

      {budget.rows.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          This template has no cost codes. Pick a build template, or add cabinet
          counts below to populate assembly / install / delivery.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 gap-y-1 text-caption text-text-tertiary uppercase tracking-[0.04em]">
            <span>Code</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Min/unit</span>
            <span className="text-right">Hours</span>
            <span className="text-right">Budget</span>
          </div>

          {phases.map((phase) => (
            <div key={phase} className="space-y-1">
              <div className="text-caption font-medium text-text-secondary pt-1">
                {PHASE_LABELS[phase]}
              </div>
              {rowsByPhase.get(phase)!.map((r) => {
                const qtyEditable = isQtyEditable(r.code);
                return (
                  <div
                    key={r.code}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center text-sm py-0.5"
                  >
                    <span className="text-text-primary">
                      <span className="font-mono text-xs text-text-tertiary mr-2">
                        {r.code}
                      </span>
                      {r.name}
                    </span>
                    {/* Qty */}
                    {r.driver ? (
                      qtyEditable ? (
                        <NumCell
                          value={qtyByCode[r.code] ?? r.quantity}
                          onChange={(v) => onQty(r.code, v)}
                        />
                      ) : (
                        <span className="inline-flex items-center justify-end gap-1 tabular-nums text-text-secondary w-16 text-right">
                          <Lock className="h-3 w-3 text-text-disabled" strokeWidth={1.75} />
                          {r.quantity}
                        </span>
                      )
                    ) : (
                      <span className="text-text-disabled text-right w-16">—</span>
                    )}
                    {/* Minutes per unit (flat codes: total minutes) */}
                    <NumCell
                      value={minutesByCode[r.code] ?? r.minutesPerUnit}
                      onChange={(v) => onMinutes(r.code, v)}
                    />
                    <span className="tabular-nums text-text-tertiary text-right w-14">
                      {(r.budgetedMinutes / 60).toFixed(2)}
                    </span>
                    <span className="tabular-nums text-text-primary text-right w-20 font-medium">
                      {formatCAD(r.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">
              Total labour budget
            </span>
            <span className="text-base font-semibold tabular-nums text-text-primary">
              {formatCAD(budget.totalAmount)}
            </span>
          </div>

          <ReconciliationNote reconciliation={reconciliation} />
        </>
      )}
    </div>
  );
}

function ReconciliationNote({ reconciliation: r }: { reconciliation: BudgetReconciliation }) {
  if (r.quoteLabour <= 0) {
    return (
      <p className="text-caption text-text-tertiary">
        No labour lines on the quote to reconcile against yet.
      </p>
    );
  }
  const richer = r.delta > 0;
  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-caption",
        r.drifts
          ? "bg-status-at-risk-soft text-status-at-risk"
          : "bg-status-on-track-soft text-status-on-track",
      )}
    >
      {r.drifts ? (
        <>
          Coded budget {formatCAD(r.codedLabour)} is{" "}
          {richer ? "above" : "below"} the quote&apos;s labour {formatCAD(r.quoteLabour)} by{" "}
          {formatCAD(Math.abs(r.delta))} ({r.pctOfQuote.toFixed(0)}%). Review the
          counts / minutes before saving.
        </>
      ) : (
        <>
          Coded budget {formatCAD(r.codedLabour)} reconciles with the quote&apos;s
          labour {formatCAD(r.quoteLabour)} (within {r.pctOfQuote.toFixed(0)}%).
        </>
      )}
    </div>
  );
}

function NumCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(Number.isFinite(v) && v >= 0 ? v : 0);
      }}
      className="w-16 text-right tabular-nums bg-surface-muted border border-border rounded px-1.5 py-0.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
    />
  );
}
