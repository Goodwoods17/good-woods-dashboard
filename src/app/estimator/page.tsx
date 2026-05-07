"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@/lib/jobsStore";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import { newActivity } from "@/lib/activity";
import type { Job, CostLine } from "@shared/lib/types";
import { formatCAD, formatPct } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";

type LineItem = {
  id: string;
  description: string;
  qty: number;
  materialId: string | null;
  materialPricePerSqft: number;
  labourHours: number;
  labourRate: number;
};

const DEFAULT_LABOUR_RATE = 85;

export default function EstimatorPage() {
  const router = useRouter();
  const { createJob, jobs } = useJobs();
  const { materials } = useCatalog();

  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [overheadPct, setOverheadPct] = useState(8);
  const [marginPct, setMarginPct] = useState(35);
  const [lines, setLines] = useState<LineItem[]>([
    {
      id: "l1",
      description: "Upper cabinets — 5 boxes",
      qty: 1,
      materialId: materials[0]?.id ?? null,
      materialPricePerSqft: materials[0]?.pricePerSqft ?? 0,
      labourHours: 18,
      labourRate: DEFAULT_LABOUR_RATE,
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: `l${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
        description: "",
        qty: 1,
        materialId: materials[0]?.id ?? null,
        materialPricePerSqft: materials[0]?.pricePerSqft ?? 0,
        labourHours: 0,
        labourRate: DEFAULT_LABOUR_RATE,
      },
    ]);
  }

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function pickMaterial(lineId: string, materialId: string) {
    const m = materials.find((mat) => mat.id === materialId);
    if (!m) return;
    updateLine(lineId, {
      materialId: m.id,
      materialPricePerSqft: m.pricePerSqft,
    });
  }

  const totals = useMemo(() => {
    const lineSubtotals = lines.map((l) => {
      const matCost = l.qty * l.materialPricePerSqft;
      const labCost = l.labourHours * l.labourRate;
      return { id: l.id, matCost, labCost, total: matCost + labCost };
    });
    const directs = lineSubtotals.reduce(
      (acc, l) => ({
        mat: acc.mat + l.matCost,
        lab: acc.lab + l.labCost,
        total: acc.total + l.total,
      }),
      { mat: 0, lab: 0, total: 0 }
    );
    const overhead = directs.total * (overheadPct / 100);
    const cost = directs.total + overhead;
    // Quoted price uses margin-on-revenue model: price = cost / (1 - marginPct/100)
    const denom = Math.max(0.01, 1 - marginPct / 100);
    const price = cost / denom;
    const grossMargin = price - cost;

    return { lineSubtotals, directs, overhead, cost, price, grossMargin };
  }, [lines, overheadPct, marginPct]);

  async function saveAsJob() {
    if (!client.trim() || !project.trim()) return;
    setSubmitting(true);

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const year = new Date().getFullYear();
    const prefix = `GW-${year}-`;
    const max = jobs
      .map((j) => j.code)
      .filter((c) => c.startsWith(prefix))
      .map((c) => parseInt(c.slice(prefix.length), 10))
      .filter((n) => !isNaN(n))
      .reduce((a, b) => Math.max(a, b), 0);
    const code = `${prefix}${String(max + 1).padStart(3, "0")}`;

    const costs: CostLine[] = [
      { id: "c-mat", category: "materials", label: "Materials (estimator)", amount: totals.directs.mat },
      { id: "c-lab", category: "labour", label: "Labour (estimator)", amount: totals.directs.lab },
      { id: "c-oh", category: "overhead", label: `Overhead (${overheadPct}%)`, amount: totals.overhead },
    ];

    const installDate = new Date();
    installDate.setDate(installDate.getDate() + 45);

    const job: Job = {
      id,
      code,
      name: project.trim(),
      client: client.trim(),
      address: "",
      template: "full_project",
      pipelineStatus: "sold",
      healthStatus: "on_track",
      currentMilestone: "sold",
      installDate: installDate.toISOString().slice(0, 10),
      revenue: Math.round(totals.price * 100) / 100,
      costs,
      notes: `Created from estimator with ${lines.length} line item(s) at ${marginPct}% target margin.`,
      activity: [newActivity("note", `Job created from estimator at price ${formatCAD(totals.price)}.`)],
      invoice: {
        number: `INV-${code.slice(3)}`,
        issuedDate: new Date().toISOString().slice(0, 10),
        dueDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 14);
          return d.toISOString().slice(0, 10);
        })(),
        lineItems: lines.map((l) => ({
          description: l.description || "Line item",
          qty: l.qty,
          unitPrice: (l.qty * l.materialPricePerSqft + l.labourHours * l.labourRate) / Math.max(1, l.qty),
        })),
      },
    };

    await createJob(job);
    router.push(`/jobs/${id}`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Estimator"
        title="New estimate"
        subtitle="Direct cost + overhead + margin = quoted price. Convert to a Job in one click."
      />
      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 max-w-6xl">
        <div className="space-y-5">
          <section className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3">
              Project
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldInput
                label="Client"
                value={client}
                onChange={setClient}
                placeholder="e.g. SayWell Developments"
              />
              <FieldInput
                label="Project"
                value={project}
                onChange={setProject}
                placeholder="e.g. Suite 305 kitchen + island"
              />
            </div>
          </section>

          <section className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-surface-muted flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                Line items
              </h2>
              <span className="text-xs text-text-tertiary">
                {lines.length} item{lines.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="divide-y divide-border">
              {lines.map((line) => {
                const sub = totals.lineSubtotals.find((s) => s.id === line.id)!;
                return (
                  <div key={line.id} className="p-4 group">
                    <div className="flex items-start gap-3 mb-3">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) =>
                          updateLine(line.id, { description: e.target.value })
                        }
                        placeholder="Line description (e.g. Lower cabinets — 7 boxes)"
                        className="flex-1 text-sm bg-surface-muted border border-border rounded-md px-3 py-1.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
                      />
                      <button
                        onClick={() => removeLine(line.id)}
                        className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast mt-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                      <Sub label="Qty (sqft)">
                        <NumberInput
                          value={line.qty}
                          onChange={(v) => updateLine(line.id, { qty: v })}
                        />
                      </Sub>
                      <Sub label="Material">
                        <select
                          value={line.materialId ?? ""}
                          onChange={(e) => pickMaterial(line.id, e.target.value)}
                          className="w-full text-sm bg-surface-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:border-border-strong"
                        >
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </Sub>
                      <Sub label="$ / sqft">
                        <NumberInput
                          value={line.materialPricePerSqft}
                          onChange={(v) =>
                            updateLine(line.id, { materialPricePerSqft: v })
                          }
                        />
                      </Sub>
                      <Sub label="Labour hrs">
                        <NumberInput
                          value={line.labourHours}
                          onChange={(v) =>
                            updateLine(line.id, { labourHours: v })
                          }
                        />
                      </Sub>
                      <Sub label="$ / hr">
                        <NumberInput
                          value={line.labourRate}
                          onChange={(v) =>
                            updateLine(line.id, { labourRate: v })
                          }
                        />
                      </Sub>
                    </div>
                    <div className="text-xs text-text-tertiary tabular-nums mt-2 pt-2 border-t border-border flex items-center gap-4">
                      <span>Materials: {formatCAD(sub.matCost)}</span>
                      <span>Labour: {formatCAD(sub.labCost)}</span>
                      <span className="ml-auto font-medium text-text-secondary">
                        Direct: {formatCAD(sub.total)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={addLine}
                className="w-full px-5 py-2.5 flex items-center gap-2 text-sm text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add line
              </button>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3">
              Markup
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <FieldInput
                label="Overhead %"
                value={String(overheadPct)}
                onChange={(v) => setOverheadPct(parseFloat(v) || 0)}
                type="number"
              />
              <FieldInput
                label="Target margin %"
                value={String(marginPct)}
                onChange={(v) => setMarginPct(parseFloat(v) || 0)}
                type="number"
              />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 self-start space-y-4">
          <div className="bg-surface border border-border rounded-lg p-5">
            <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
              Quote summary
            </h3>
            <SummaryRow label="Materials" value={formatCAD(totals.directs.mat)} />
            <SummaryRow label="Labour" value={formatCAD(totals.directs.lab)} />
            <SummaryRow
              label={`Overhead (${overheadPct}%)`}
              value={formatCAD(totals.overhead)}
              muted
            />
            <div className="border-t border-border my-3" />
            <SummaryRow label="Total cost" value={formatCAD(totals.cost)} />
            <SummaryRow
              label={`Margin (${formatPct(marginPct)})`}
              value={formatCAD(totals.grossMargin)}
              muted
            />
            <div className="border-t border-border my-3" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                Quoted price
              </span>
              <span className="text-xl font-semibold tabular-nums text-accent">
                {formatCAD(totals.price)}
              </span>
            </div>
          </div>

          <button
            onClick={saveAsJob}
            disabled={submitting || !client.trim() || !project.trim()}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors duration-fast",
              "bg-accent text-white hover:bg-accent-hover active:bg-accent-active",
              "disabled:bg-text-disabled disabled:cursor-not-allowed"
            )}
          >
            {submitting ? "Creating job…" : "Save as Job"}
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
          </button>

          <p className="text-[11px] text-text-tertiary leading-relaxed px-1">
            Saving creates a job in pipeline stage Sold with these costs and the
            quoted price as revenue. You can adjust everything from the job
            detail.
          </p>
        </aside>
      </div>
    </>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-1.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
      />
    </label>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      step="0.01"
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full text-sm tabular-nums bg-surface-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:border-border-strong"
    />
  );
}

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-2 last:mb-0">
      <span
        className={cn(
          "text-sm",
          muted ? "text-text-tertiary" : "text-text-secondary"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-sm tabular-nums",
          muted ? "text-text-tertiary" : "text-text-primary font-medium"
        )}
      >
        {value}
      </span>
    </div>
  );
}
