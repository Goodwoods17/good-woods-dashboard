"use client";

import type { Job } from "@/lib/types";
import { computeMargin } from "@/lib/types";
import { formatCAD, formatDate, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const TEMPLATE_LABELS: Record<Job["template"], string> = {
  refacing: "Refacing",
  spray_finishing: "Spray Finishing",
  install_only: "Install Only",
  full_project: "Full Project",
};

export function OverviewTab({ job }: { job: Job }) {
  const margin = computeMargin(job);
  const matCost = job.costs
    .filter((c) => c.category === "materials")
    .reduce((s, c) => s + c.amount, 0);
  const labCost = job.costs
    .filter((c) => c.category === "labour")
    .reduce((s, c) => s + c.amount, 0);
  const ovrCost = job.costs
    .filter((c) => c.category === "overhead")
    .reduce((s, c) => s + c.amount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl">
      <KpiCard label="Revenue" value={formatCAD(job.revenue)} />
      <KpiCard
        label="Total cost"
        value={formatCAD(margin.costsTotal)}
        sub={`${formatCAD(matCost)} mat · ${formatCAD(labCost)} lab · ${formatCAD(ovrCost)} oh`}
      />
      <KpiCard
        label="Gross margin"
        value={formatPct(margin.marginPct)}
        sub={formatCAD(margin.marginAmount)}
        tone={margin.band}
      />

      <section className="lg:col-span-3 bg-surface border border-border rounded-lg p-5">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
          Job details
        </h3>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <Field label="Template" value={TEMPLATE_LABELS[job.template]} />
          <Field label="Client" value={job.client} />
          <Field label="Address" value={job.address} />
          <Field label="Install date" value={formatDate(job.installDate)} />
          <Field label="Job code" value={job.code} mono />
          <Field label="Invoice" value={job.invoice.number} mono />
        </dl>
        {job.notes && (
          <div className="mt-5 pt-4 border-t border-border">
            <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
              Notes
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{job.notes}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "on_track" | "at_risk" | "blocked";
}) {
  const toneClass = tone
    ? tone === "on_track"
      ? "text-status-on-track"
      : tone === "at_risk"
        ? "text-status-at-risk"
        : "text-status-blocked"
    : "text-text-primary";
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-2">
        {label}
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </div>
      {sub && (
        <div className="text-xs text-text-tertiary tabular-nums mt-1.5">{sub}</div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-0.5">
        {label}
      </dt>
      <dd className={cn("text-text-primary", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}
