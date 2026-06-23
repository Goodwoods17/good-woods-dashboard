"use client";
import { useState } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useWorkCards } from "../lib/workCardsStore";
import { useLabour } from "@features/labour/lib/labourStore";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { JobBoard } from "./JobBoard";
import { AddCardModal } from "./AddCardModal";

export function ShopFloorView() {
  const { cards, updateCard } = useWorkCards();
  const { running, workerById, operationById, operations } = useLabour();
  const { jobs } = useJobs();
  const codedOps = operations.filter((o) => o.code);
  const [jobId, setJobId] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);

  const jobName = (id: string) => jobs.find((j) => j.id === id)?.name ?? id;
  const stuck = cards.filter((c) => c.status === "stuck");
  const uncoded = cards.filter((c) => !c.operationId && c.status !== "done");

  return (
    <>
      <PageHeader eyebrow="Shop floor" title="Work board"
        subtitle="Cards are tasks on a job. Tap your name + Start to clock time against a cost code." />
      <div className="px-6 py-5 space-y-5 max-w-6xl">
        {/* Needs attention (stuck) */}
        {stuck.length > 0 && (
          <section className="bg-status-at-risk-soft rounded-lg p-3">
            <h3 className="text-caption font-medium text-status-at-risk mb-1">⚠ Needs attention</h3>
            {stuck.map((c) => (
              <div key={c.id} className="text-sm text-text-primary">
                {c.description} — <span className="text-status-at-risk">stuck</span>
                {c.stuckReason ? `: ${c.stuckReason}` : ""} · {jobName(c.jobId)}
              </div>
            ))}
          </section>
        )}

        {/* Running now */}
        <section>
          <h3 className="text-caption uppercase tracking-[0.04em] text-text-tertiary mb-1">Running now ({running.length})</h3>
          {running.length === 0 ? <p className="text-sm text-text-tertiary">Nothing running.</p> : (
            running.map((s) => (
              <div key={s.id} className="text-sm text-text-secondary">
                {workerById.get(s.workerId ?? "")?.name ?? "—"} · {operationById.get(s.operationId ?? "")?.name ?? "—"} · {jobName(s.jobId ?? "")}
              </div>
            ))
          )}
        </section>

        {/* Needs a code triage (admin) */}
        {uncoded.length > 0 && (
          <section className="bg-surface border border-border rounded-lg p-3">
            <h3 className="text-caption font-medium text-text-secondary mb-1">Needs a code ({uncoded.length})</h3>
            {uncoded.map((c) => (
              <UncodedRow key={c.id} description={c.description} job={jobName(c.jobId)}
                codedOps={codedOps}
                onAssign={(opId, phaseId) => updateCard(c.id, { operationId: opId, phaseId })} />
            ))}
            <p className="text-caption text-text-tertiary mt-1">Create new codes in /labour → Setup.</p>
          </section>
        )}

        {/* Job picker → per-job board */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <select value={jobId} onChange={(e) => setJobId(e.target.value)}
              className="rounded-md bg-surface-muted border border-border px-2 py-1.5 text-sm text-text-primary">
              <option value="">Pick a job…</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.name}</option>)}
            </select>
            {jobId && (
              <button onClick={() => setAddOpen(true)} className="text-sm text-accent">+ Add card</button>
            )}
          </div>
          {jobId && <JobBoard jobId={jobId} jobName={jobName(jobId)} />}
        </section>
      </div>
      {jobId && <AddCardModal open={addOpen} jobId={jobId} onClose={() => setAddOpen(false)} />}
    </>
  );
}

type Operation = ReturnType<typeof useLabour>["operations"][number];

function UncodedRow({ description, job, codedOps, onAssign }: {
  description: string;
  job: string;
  codedOps: Operation[];
  onAssign: (opId: string, phaseId: string) => void;
}) {
  const [selected, setSelected] = useState("");
  return (
    <div className="flex items-center justify-between gap-3 py-0.5 text-sm">
      <span className="text-text-secondary truncate">{description} · {job}</span>
      <select value={selected} onChange={(e) => {
          const op = codedOps.find((o) => o.id === e.target.value);
          if (op && op.categoryId) { onAssign(op.id, op.categoryId); setSelected(""); }
          else setSelected(e.target.value);
        }}
        className="rounded-md bg-surface-muted border border-border px-2 py-1 text-caption text-text-primary">
        <option value="">Assign code…</option>
        {codedOps.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
      </select>
    </div>
  );
}
