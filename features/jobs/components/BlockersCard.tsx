"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, CheckCircle2 } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { MILESTONE_STAGES } from "@shared/lib/types";
import { useJobBlockers, type NewJobBlocker } from "@features/jobs/lib/jobBlockersStore";
import { useJob } from "@features/jobs/lib/jobsStore";
import { useContacts } from "@features/contacts/lib/contactsStore";
import { partyLabel, blockerAgeDays } from "@features/jobs/lib/jobBlockers";

export function BlockersCard({ jobId }: { jobId: string }) {
  const { blockers, activeForJob, addBlocker, resolveBlocker, reopenBlocker } = useJobBlockers();
  const { contacts } = useContacts();
  const job = useJob(jobId);

  // ── Form state ────────────────────────────────────────────────────────────
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState("");
  const [waitingOnContactId, setWaitingOnContactId] = useState<string | null>(null);
  const [waitingOnLabel, setWaitingOnLabel] = useState("");
  const [useOtherLabel, setUseOtherLabel] = useState(false);
  const [gatedPhaseId, setGatedPhaseId] = useState<string>(""); // "" = null (whole job)
  const [submitting, setSubmitting] = useState(false);

  // ── History collapsible ───────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);

  // ── Derived data ──────────────────────────────────────────────────────────
  const now = new Date();
  const active = activeForJob(jobId);
  const resolved = blockers.filter((b) => b.jobId === jobId && b.resolvedAt !== null);

  // Linked contact ids to pin at top of picker (mirror OverviewTab.tsx:39–51)
  const linkedIds = [
    job?.payerId,
    job?.designerId,
    job?.gcId,
    job?.architectId,
    job?.homeownerId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);

  const linkedContacts = contacts.filter((c) => linkedIds.includes(c.id));
  const otherContacts = contacts.filter((c) => !linkedIds.includes(c.id));

  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name;

  // ── Phase label lookup ────────────────────────────────────────────────────
  function phaseLabel(key: string | null): string {
    if (!key) return "Whole job";
    return MILESTONE_STAGES.find((s) => s.key === key)?.label ?? key;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function resetForm() {
    setReason("");
    setWaitingOnContactId(null);
    setWaitingOnLabel("");
    setUseOtherLabel(false);
    setGatedPhaseId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const payload: NewJobBlocker = {
        jobId,
        reason: reason.trim(),
        waitingOnContactId: useOtherLabel ? null : (waitingOnContactId ?? null),
        waitingOnLabel: useOtherLabel ? waitingOnLabel.trim() || null : null,
        gatedPhaseId: gatedPhaseId
          ? (gatedPhaseId as import("@shared/lib/types").MilestoneStage)
          : null,
      };
      await addBlocker(payload);
      resetForm();
      setAdding(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleWaitingOnChange(val: string) {
    if (val === "__other__") {
      setUseOtherLabel(true);
      setWaitingOnContactId(null);
    } else if (val === "") {
      setUseOtherLabel(false);
      setWaitingOnContactId(null);
    } else {
      setUseOtherLabel(false);
      setWaitingOnContactId(val);
      setWaitingOnLabel("");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mt-5 rounded-xl border border-border bg-surface-muted/40 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
          Blockers
          {active.length > 0 && (
            <span className="ml-1.5 tabular-nums text-status-blocked">({active.length})</span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => {
            setAdding((p) => !p);
            if (adding) resetForm();
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-fast min-h-[44px]",
            adding
              ? "bg-surface-muted text-text-secondary hover:text-text-primary"
              : "bg-ink-pill text-white hover:bg-accent-active"
          )}
        >
          {adding ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
              Close
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add blocker
            </>
          )}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 rounded-lg bg-surface-muted/30 p-3 flex flex-col gap-3"
        >
          {/* Reason */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Reason <span className="text-status-blocked">*</span>
            </label>
            <input
              type="text"
              placeholder="What's blocking this job?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="w-full bg-surface-muted border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Waiting on */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Waiting on</label>
            <select
              value={useOtherLabel ? "__other__" : (waitingOnContactId ?? "")}
              onChange={(e) => handleWaitingOnChange(e.target.value)}
              className="w-full bg-surface-muted border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">— none —</option>
              {linkedContacts.length > 0 && (
                <optgroup label="— linked —">
                  {linkedContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherContacts.length > 0 && (
                <optgroup label="All contacts">
                  {otherContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="__other__">Other (type a label)</option>
            </select>
            {useOtherLabel && (
              <input
                type="text"
                placeholder="Who are we waiting on?"
                value={waitingOnLabel}
                onChange={(e) => setWaitingOnLabel(e.target.value)}
                className="mt-2 w-full bg-surface-muted border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            )}
          </div>

          {/* Gates phase */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Gates phase</label>
            <select
              value={gatedPhaseId}
              onChange={(e) => setGatedPhaseId(e.target.value)}
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

          {/* Submit */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!reason.trim() || submitting}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium bg-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-fast min-h-[44px]"
            >
              {submitting ? "Adding…" : "Add blocker"}
            </button>
          </div>
        </form>
      )}

      {/* Active list */}
      {active.length === 0 && (
        <p className="text-xs text-text-tertiary py-1">No active blockers.</p>
      )}
      {active.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {active.map((b) => {
            const days = blockerAgeDays(b, now);
            const party = partyLabel(b, contactName);
            const aged = days >= 7;
            return (
              <li
                key={b.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary font-medium leading-snug mb-1">
                    {b.reason}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-text-secondary">Waiting on {party}</span>
                    <span
                      className={cn(
                        "text-xs tabular-nums font-medium",
                        aged ? "text-status-blocked" : "text-text-tertiary"
                      )}
                    >
                      {days}d
                    </span>
                    <span className="inline-flex items-center rounded-full bg-surface-muted px-1.5 py-0 text-[10px] uppercase tracking-[0.06em] text-text-tertiary font-medium">
                      {phaseLabel(b.gatedPhaseId)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => resolveBlocker(b.id)}
                  aria-label={`Resolve blocker: ${b.reason}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:text-status-on-track hover:border-status-on-track transition-colors duration-fast shrink-0 min-h-[44px]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Resolve
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Resolved history */}
      {resolved.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setHistoryOpen((p) => !p)}
            className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast min-h-[44px]"
          >
            {historyOpen ? (
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            Resolved ({resolved.length})
          </button>

          {historyOpen && (
            <ul className="mt-2 flex flex-col gap-2">
              {resolved.map((b) => {
                const party = partyLabel(b, contactName);
                const days = b.resolvedAt
                  ? Math.max(
                      0,
                      Math.floor(
                        (new Date(b.resolvedAt).getTime() - new Date(b.raisedAt).getTime()) /
                          86_400_000
                      )
                    )
                  : blockerAgeDays(b, now);
                return (
                  <li
                    key={b.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-muted/30 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-secondary leading-snug mb-1">{b.reason}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-text-tertiary">Waiting on {party}</span>
                        <span className="text-xs text-text-tertiary tabular-nums">{days}d</span>
                        <span className="text-xs text-status-on-track font-medium">Resolved</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => reopenBlocker(b.id)}
                      aria-label={`Reopen blocker: ${b.reason}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs text-text-tertiary hover:text-text-secondary hover:border-border-strong transition-colors duration-fast shrink-0 min-h-[44px]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Reopen
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
