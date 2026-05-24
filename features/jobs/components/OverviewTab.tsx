"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { Job } from "@shared/lib/types";
import { computeMargin } from "@shared/lib/types";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { formatCAD, formatDate, formatPct } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";

const TEMPLATE_LABELS: Record<Job["template"], string> = {
  refacing: "Refacing",
  spray_finishing: "Spray Finishing",
  install_only: "Install Only",
  full_project: "Full Project",
};

export function OverviewTab({ job }: { job: Job }) {
  const margin = computeMargin(job);
  const { deleteJob, updateJob } = useJobs();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteJob(job.id);
    router.push("/");
  }

  // Local mirrors for the blocker / next-step inputs so editing feels
  // responsive without thrashing the upsert pipeline. Save on blur.
  const [blockerDraft, setBlockerDraft] = useState(job.blocker ?? "");
  const [nextStepDraft, setNextStepDraft] = useState(job.nextStep ?? "");

  // Sync local state back to the job when the store-side value changes
  // (e.g., after a fresh refresh from Supabase or undo from another tab).
  useEffect(() => {
    setBlockerDraft(job.blocker ?? "");
  }, [job.blocker]);
  useEffect(() => {
    setNextStepDraft(job.nextStep ?? "");
  }, [job.nextStep]);

  function commitBlocker() {
    const next = blockerDraft.trim() || undefined;
    if (next === (job.blocker ?? undefined)) return;
    updateJob(job.id, { blocker: next });
  }
  function commitNextStep() {
    const next = nextStepDraft.trim() || undefined;
    if (next === (job.nextStep ?? undefined)) return;
    updateJob(job.id, { nextStep: next });
  }

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

      <section className="lg:col-span-3 bg-surface rounded-xl shadow-resting p-6">
        <h3 className="font-serif text-lg font-medium text-text-primary tracking-[-0.01em] mb-4">
          What's blocking this
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
              Current blocker
            </div>
            <textarea
              value={blockerDraft}
              onChange={(e) => setBlockerDraft(e.target.value)}
              onBlur={commitBlocker}
              placeholder="e.g. Waiting on Toolpath CNC slot · client deciding on door pulls"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast resize-y leading-relaxed"
            />
            <div className="text-[11px] text-text-tertiary mt-1">
              Empty falls back to the synthetic heuristic with a{" "}
              <span className="inline-block rounded-sm bg-surface-sunken px-1 text-[9px] uppercase tracking-[0.04em] text-text-tertiary">demo</span>{" "}
              tag.
            </div>
          </label>
          <label className="block">
            <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
              Next concrete step
            </div>
            <textarea
              value={nextStepDraft}
              onChange={(e) => setNextStepDraft(e.target.value)}
              onBlur={commitNextStep}
              placeholder="e.g. Issue cut list to shop · order edgebanding · schedule install crew"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast resize-y leading-relaxed"
            />
            <div className="text-[11px] text-text-tertiary mt-1">
              Shows up as the lead text in the Hitlist row.
            </div>
          </label>
        </div>
      </section>

      <section className="lg:col-span-3 bg-surface rounded-xl shadow-resting p-6">
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

      <section className="lg:col-span-3 bg-surface rounded-xl shadow-resting p-6">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-2">
          Danger zone
        </h3>
        <p className="text-sm text-text-secondary mb-4 leading-relaxed">
          Deleting this job removes it from the database and erases its costs,
          activity log, and invoice. Cannot be undone.
        </p>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium",
              "text-text-secondary hover:border-status-blocked hover:text-status-blocked transition-colors duration-fast"
            )}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Delete this job
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 bg-status-blocked-soft border border-status-blocked/30 rounded-md p-3">
            <span className="text-sm text-status-blocked flex-1 min-w-[200px]">
              Permanently delete <strong>{job.name}</strong>?
            </span>
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="px-3 py-1.5 text-sm rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors duration-fast"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 text-sm rounded-md bg-status-blocked text-white hover:opacity-90 transition-opacity duration-fast disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
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
    <div className="bg-surface rounded-xl shadow-resting p-5">
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
