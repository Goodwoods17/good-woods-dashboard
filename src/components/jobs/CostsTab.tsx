"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, FileDown } from "lucide-react";
import type { Job, CostLine } from "@/lib/types";
import { computeMargin } from "@/lib/types";
import { formatCADPrecise, formatCAD } from "@/lib/format";
import { MarginCell } from "@/components/ui/MarginCell";
import { generateInvoicePdf } from "@/lib/invoice";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<CostLine["category"], string> = {
  materials: "Materials",
  labour: "Labour",
  overhead: "Overhead",
};

const CATEGORY_ORDER: CostLine["category"][] = [
  "materials",
  "labour",
  "overhead",
];

export function CostsTab({
  job,
  onChange,
}: {
  job: Job;
  onChange: (job: Job) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const margin = computeMargin(job);

  function updateRevenue(value: number) {
    onChange({ ...job, revenue: value });
  }

  function updateCost(id: string, patch: Partial<CostLine>) {
    onChange({
      ...job,
      costs: job.costs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }

  function removeCost(id: string) {
    onChange({ ...job, costs: job.costs.filter((c) => c.id !== id) });
  }

  function addCost(category: CostLine["category"]) {
    const newCost: CostLine = {
      id: `c${Date.now()}`,
      category,
      label: "",
      amount: 0,
    };
    onChange({ ...job, costs: [...job.costs, newCost] });
  }

  async function exportPdf() {
    setExporting(true);
    try {
      await generateInvoicePdf(job);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 max-w-6xl">
      <div className="space-y-6">
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-surface-muted flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Revenue</h2>
            <span className="text-xs text-text-tertiary">CAD</span>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <label
              htmlFor="revenue"
              className="text-sm text-text-secondary"
            >
              Contract value
            </label>
            <CurrencyInput
              id="revenue"
              value={job.revenue}
              onChange={updateRevenue}
              className="text-base font-semibold"
            />
          </div>
        </section>

        {CATEGORY_ORDER.map((cat) => {
          const lines = job.costs.filter((c) => c.category === cat);
          const total = lines.reduce((s, l) => s + l.amount, 0);
          return (
            <section
              key={cat}
              className="bg-surface border border-border rounded-lg overflow-hidden"
            >
              <div className="px-5 py-3.5 border-b border-border bg-surface-muted flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">
                  {CATEGORY_LABELS[cat]}
                </h2>
                <span className="text-xs tabular-nums text-text-secondary">
                  {formatCAD(total)}
                </span>
              </div>

              <div className="divide-y divide-border">
                {lines.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-text-tertiary italic">
                    No {CATEGORY_LABELS[cat].toLowerCase()} costs yet.
                  </div>
                ) : (
                  lines.map((line) => (
                    <div
                      key={line.id}
                      className="px-5 py-2.5 flex items-center gap-3 group"
                    >
                      <input
                        type="text"
                        value={line.label}
                        onChange={(e) =>
                          updateCost(line.id, { label: e.target.value })
                        }
                        placeholder={`${CATEGORY_LABELS[cat]} item…`}
                        className="flex-1 text-sm bg-transparent border-0 px-0 py-1 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-0"
                      />
                      <CurrencyInput
                        value={line.amount}
                        onChange={(v) => updateCost(line.id, { amount: v })}
                      />
                      <button
                        onClick={() => removeCost(line.id)}
                        className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
                        aria-label={`Remove ${line.label || "cost line"}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  ))
                )}
                <button
                  onClick={() => addCost(cat)}
                  className="w-full px-5 py-2 flex items-center gap-2 text-sm text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Add {CATEGORY_LABELS[cat].toLowerCase()} line
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <aside className="lg:sticky lg:top-6 self-start space-y-4">
        <div className="bg-surface border border-border rounded-lg p-5">
          <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
            Margin readout
          </h3>
          <div className="space-y-2.5">
            <Row label="Revenue" value={formatCADPrecise(job.revenue)} />
            <Row
              label="Total costs"
              value={formatCADPrecise(margin.costsTotal)}
              muted
            />
            <div className="pt-2.5 mt-2.5 border-t border-border space-y-2.5">
              <Row
                label="Gross margin"
                value={formatCADPrecise(margin.marginAmount)}
                strong
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">GM%</span>
                <MarginCell margin={margin} showLabel />
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-[11px] text-text-tertiary leading-relaxed">
              Bands:{" "}
              <span className="text-status-on-track">≥30% healthy</span> ·{" "}
              <span className="text-status-at-risk">20–30% tight</span> ·{" "}
              <span className="text-status-blocked">&lt;20% below floor</span>
            </div>
          </div>
        </div>

        <button
          onClick={exportPdf}
          disabled={exporting}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors duration-fast ease-standard",
            "bg-accent text-white hover:bg-accent-hover active:bg-accent-active",
            "disabled:bg-text-disabled disabled:cursor-wait"
          )}
        >
          <FileDown className="h-4 w-4" strokeWidth={1.75} />
          {exporting ? "Generating PDF…" : "Export Invoice PDF"}
        </button>

        <div className="text-[11px] text-text-tertiary leading-relaxed px-1">
          Invoice {job.invoice.number} · {job.invoice.lineItems.length} line
          item{job.invoice.lineItems.length === 1 ? "" : "s"}
        </div>
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong
            ? "text-base font-semibold text-text-primary"
            : muted
              ? "text-sm text-text-secondary"
              : "text-sm text-text-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CurrencyInput({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setLocal(String(value));
  }, [value, focused]);

  return (
    <div className="flex items-center gap-1.5 bg-surface-muted border border-border rounded-md px-2.5 py-1 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-accent-soft transition-colors duration-fast">
      <span className="text-xs text-text-tertiary">$</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={local}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          setLocal(raw);
          const n = parseFloat(raw);
          if (!isNaN(n)) onChange(n);
          else if (raw === "") onChange(0);
        }}
        onBlur={() => {
          setFocused(false);
          setLocal(String(value));
        }}
        className={cn(
          "w-24 text-right tabular-nums bg-transparent border-0 p-0 text-sm text-text-primary focus:outline-none focus:ring-0",
          className
        )}
      />
    </div>
  );
}
