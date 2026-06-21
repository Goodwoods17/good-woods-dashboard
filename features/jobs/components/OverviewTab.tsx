"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, ArrowUpRight } from "lucide-react";
import type { Job, SiteAccess } from "@shared/lib/types";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { useContacts } from "@features/contacts/lib/contactsStore";
import { SiteAccessForm } from "@features/jobs/components/SiteAccessForm";
import { DocumentsCard } from "@features/documents/components/DocumentsCard";
import { TradesCard } from "@features/partners/components/TradesCard";
import { formatCAD, formatDate } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";

type SlotKey = "payer" | "designer" | "gc" | "architect" | "homeowner";
const SLOT_LABELS: Record<SlotKey, string> = {
  payer: "Payer",
  designer: "Designer",
  gc: "GC",
  architect: "Architect",
  homeowner: "Homeowner",
};

const TEMPLATE_LABELS: Record<Job["template"], string> = {
  refacing: "Refacing",
  spray_finishing: "Spray Finishing",
  install_only: "Install Only",
  full_project: "Full Project",
};

export function OverviewTab({ job }: { job: Job }) {
  const { deleteJob, updateJob } = useJobs();
  const { contacts } = useContacts();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const parties: { key: SlotKey; id: string | null | undefined }[] = [
    { key: "payer", id: job.payerId },
    { key: "designer", id: job.designerId },
    { key: "gc", id: job.gcId },
    { key: "architect", id: job.architectId },
    { key: "homeowner", id: job.homeownerId },
  ];
  const populated = parties
    .map(({ key, id }) => ({ key, contact: id ? contacts.find((c) => c.id === id) : null }))
    .filter((p) => p.contact !== null && p.contact !== undefined) as {
      key: SlotKey;
      contact: NonNullable<ReturnType<typeof contacts.find>>;
    }[];

  async function handleDelete() {
    setDeleting(true);
    await deleteJob(job.id);
    router.push("/");
  }

  // Local mirrors for the blocker / next-step inputs so editing feels
  // responsive without thrashing the upsert pipeline. Save on blur.
  const [blockerDraft, setBlockerDraft] = useState(job.blocker ?? "");
  const [nextStepDraft, setNextStepDraft] = useState(job.nextStep ?? "");

  // Site & access draft + debounced save. Mirrors the store value so
  // edits feel snappy; commits to Supabase 1.2s after the last change.
  const [siteAccessDraft, setSiteAccessDraft] = useState<SiteAccess>(
    job.siteAccess ?? {}
  );
  const siteAccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setSiteAccessDraft(job.siteAccess ?? {});
  }, [job.siteAccess]);

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

  function changeSiteAccess(next: SiteAccess) {
    setSiteAccessDraft(next);
    if (siteAccessTimer.current) clearTimeout(siteAccessTimer.current);
    siteAccessTimer.current = setTimeout(() => {
      updateJob(job.id, { siteAccess: next });
    }, 1200);
  }

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      {/* Lead section: the reason a user clicked into this job from the Hitlist. */}
      <section className="bg-surface rounded-xl shadow-resting p-6">
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
            <div className="text-caption text-text-tertiary mt-1">
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
            <div className="text-caption text-text-tertiary mt-1">
              Shows up as the lead text in the Hitlist row.
            </div>
          </label>
        </div>
      </section>

      {populated.length > 0 && (
        <section className="bg-surface rounded-xl shadow-resting p-6">
          <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
            Parties
          </h3>
          <ul className="divide-y divide-[rgba(26,25,22,0.05)]">
            {populated.map(({ key, contact }) => (
              <li key={key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-medium w-24 shrink-0">
                  {SLOT_LABELS[key]}
                </span>
                <Link
                  href={`/crm/${contact.id}`}
                  className="flex-1 min-w-0 flex items-center justify-between gap-2 text-text-primary hover:text-accent transition-colors duration-fast"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    {contact.isAnchor && (
                      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{contact.name}</span>
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-text-tertiary shrink-0" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TradesCard jobId={job.id} />

      <DocumentsCard projectId={job.id} />

      <section className="bg-surface rounded-xl shadow-resting p-6">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
          Site & access
        </h3>
        <p className="text-xs text-text-tertiary mb-4">
          Install-day intel for the crew. Saves automatically as you edit. Surfaces on the Installer screen.
        </p>
        <SiteAccessForm value={siteAccessDraft} onChange={changeSiteAccess} />
      </section>

      <section className="bg-surface rounded-xl shadow-resting p-6">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
          Job details
        </h3>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <Field label="Template" value={TEMPLATE_LABELS[job.template]} />
          <Field label="Address" value={job.address} />
          <Field label="Install date" value={formatDate(job.installDate)} />
          <Field label="Job code" value={job.code} mono />
          <Field label="Invoice" value={job.invoice.number} mono />
          {job.source && <Field label="Source" value={job.source} />}
          {typeof job.estimatedRevenue === "number" && job.estimatedRevenue > 0 && (
            <Field
              label="Estimated revenue"
              value={formatCAD(job.estimatedRevenue)}
            />
          )}
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

      {/* Danger zone — Ghost-Border Rule: no panel framing, ink-pill destructive. */}
      <section className="pt-6">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-2">
          Danger zone
        </h3>
        <p className="text-sm text-text-secondary mb-4 leading-relaxed max-w-2xl">
          Deleting this job removes it from the database and erases its costs,
          activity log, and invoice. Cannot be undone.
        </p>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full bg-text-primary text-white px-4 py-1.5 text-sm font-medium",
              "hover:bg-status-blocked-soft hover:text-status-blocked transition-colors duration-fast"
            )}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Delete this project
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-text-primary flex-1 min-w-[200px]">
              Permanently delete <strong>{job.name}</strong>?
            </span>
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                "rounded-full bg-text-primary text-white px-4 py-1.5 text-sm font-medium",
                "hover:bg-status-blocked-soft hover:text-status-blocked transition-colors duration-fast",
                "disabled:opacity-50"
              )}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </section>
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
