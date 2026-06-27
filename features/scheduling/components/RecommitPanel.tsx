"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Mail, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { formatDate } from "@shared/lib/format";
import { hasSupabase, getSupabase, COMMITMENT_REVISIONS_TABLE } from "@shared/lib/supabase";
import { useAuth } from "@shared/lib/authStore";
import { MILESTONE_STAGES } from "@shared/lib/types";
import type { Job } from "@shared/lib/types";
import {
  computeBufferBurn,
  chainCompletionPct,
  feverZone,
  type FeverZone,
} from "../lib/bufferBurn";
import {
  RECOMMIT_REASON_CODES,
  reasonCodeMeta,
  dingsReliability,
  recommitRecoveryGate,
  changeOrderImpact,
  pushCommittedDate,
  buildCommitmentRevision,
  draftRecommitEmail,
  friendlyDate,
  type RevisionKind,
  type RecommitReasonCode,
} from "../lib/recommit";

// ─── DB row shape (subset we read) ────────────────────────────────────────────

type RevisionRow = {
  id: string;
  kind: RevisionKind;
  reason_code: RecommitReasonCode;
  old_committed_date: string | null;
  new_committed_date: string;
  new_buffer_days: number | null;
  dings_reliability: boolean;
  note: string | null;
  revised_by: string | null;
  revised_at: string;
};

const ZONE_STYLE: Record<FeverZone, string> = {
  green: "bg-status-on-track-soft text-status-on-track",
  yellow: "bg-amber-50 text-amber-700",
  red: "bg-status-blocked-soft text-status-blocked",
};

const ZONE_LABEL: Record<FeverZone, string> = {
  green: "On track",
  yellow: "At risk",
  red: "Recovery window",
};

/**
 * Re-commit flow + revision history + reason codes + change-order handling
 * (S14, issue #102).
 *
 * The client-committed install date is a versioned PROMISE — never silently
 * overwritten. This panel lets the owner deliberately re-commit (pick a reason →
 * new date + fresh buffer → log a revision → draft a concrete client email) or
 * bundle a change order (added scope re-evaluates the date; small ones absorb
 * into the buffer). Recovery-first: a plain re-commit is only recommended once
 * the buffer is truly blown (RED). Change orders never ding reliability.
 *
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED; the parent only mounts it when the
 * flag is on, so it renders unconditionally once slotted in.
 */
export function RecommitPanel({
  job,
  onRecommit,
}: {
  job: Job;
  onRecommit?: (patch: { installDate: string; bufferDays: number }) => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // ── Form state ──
  const [kind, setKind] = useState<RevisionKind>("recommit");
  const [reasonCode, setReasonCode] = useState<RecommitReasonCode>("sub_delay");
  const [addedDays, setAddedDays] = useState(3);
  const [newDate, setNewDate] = useState(job.installDate);
  const [newBuffer, setNewBuffer] = useState<number>(job.bufferDays ?? 0);
  const [note, setNote] = useState("");

  // ── Derived schedule signals ──
  const milestoneIndex = MILESTONE_STAGES.findIndex((s) => s.key === job.currentMilestone);
  const zone: FeverZone = useMemo(() => {
    if (!job.internalTargetDate) return "green";
    const burn = computeBufferBurn(job.internalTargetDate, job.installDate, new Date());
    const chainPct = chainCompletionPct({ currentMilestoneIndex: Math.max(0, milestoneIndex) });
    return feverZone(burn.bufferConsumedPct, chainPct);
  }, [job.internalTargetDate, job.installDate, milestoneIndex]);

  const gate = recommitRecoveryGate(zone);
  const remainingBuffer = job.bufferDays ?? 0;
  const impact = changeOrderImpact(addedDays, remainingBuffer);

  // The change-order proposed date is derived from the impact (absorbs → hold).
  const changeOrderDate = useMemo(
    () => pushCommittedDate(job.installDate, impact.committedDateDeltaDays),
    [job.installDate, impact.committedDateDeltaDays]
  );

  // When switching to a change order, snap the new date to the proposed one.
  useEffect(() => {
    if (kind === "change_order") {
      setReasonCode("scope_change");
      setNewDate(changeOrderDate);
    } else {
      setNewDate(job.installDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    if (kind === "change_order") setNewDate(changeOrderDate);
  }, [kind, changeOrderDate]);

  const reasonLabel = reasonCodeMeta(reasonCode).label;
  const willDing = dingsReliability(kind, reasonCode);

  const emailDraft = useMemo(
    () =>
      draftRecommitEmail({
        clientName: job.client || "there",
        jobName: job.name,
        oldCommittedDate: job.installDate,
        newCommittedDate: newDate,
        kind,
        reasonLabel,
      }),
    [job.client, job.name, job.installDate, newDate, kind, reasonLabel]
  );

  const loadRevisions = useCallback(async () => {
    setLoading(true);
    try {
      if (hasSupabase()) {
        const { data, error } = await getSupabase()
          .from(COMMITMENT_REVISIONS_TABLE)
          .select(
            "id, kind, reason_code, old_committed_date, new_committed_date, new_buffer_days, dings_reliability, note, revised_by, revised_at"
          )
          .eq("job_id", job.id)
          .order("revised_at", { ascending: false });
        if (!error && data) setRevisions(data as RevisionRow[]);
      }
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => {
    void loadRevisions();
  }, [loadRevisions]);

  async function handleSubmit() {
    setSaving(true);
    try {
      const revisedAt = new Date().toISOString();
      const rev = buildCommitmentRevision({
        jobId: job.id,
        kind,
        reasonCode,
        oldCommittedDate: job.installDate,
        newCommittedDate: newDate,
        oldBufferDays: job.bufferDays ?? null,
        newBufferDays: newBuffer,
        note: note.trim() || null,
        revisedBy: user?.email ?? null,
        revisedAt,
      });

      if (hasSupabase()) {
        await getSupabase().from(COMMITMENT_REVISIONS_TABLE).insert({
          job_id: rev.jobId,
          kind: rev.kind,
          reason_code: rev.reasonCode,
          old_committed_date: rev.oldCommittedDate,
          new_committed_date: rev.newCommittedDate,
          old_buffer_days: rev.oldBufferDays,
          new_buffer_days: rev.newBufferDays,
          dings_reliability: rev.dingsReliability,
          note: rev.note,
          revised_by: rev.revisedBy,
          revised_at: rev.revisedAt,
        });
      }

      // The committed date is versioned: persist the new install date + fresh
      // buffer onto the job, then reload the history so the new row shows.
      await onRecommit?.({ installDate: newDate, bufferDays: newBuffer });
      await loadRevisions();
      setSavedAt(revisedAt);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section data-testid="recommit-panel" className="bg-surface rounded-xl shadow-resting p-6">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
          Re-commit &amp; change orders
        </h3>
        <span className="text-xs text-text-tertiary">Committed date is versioned</span>
      </div>
      <p className="mb-4 text-xs text-text-tertiary">
        The client&rsquo;s install date is a promise — it&rsquo;s never silently overwritten. Every
        change picks a reason, lands a concrete new date, and is logged here.
      </p>

      {/* ── Current committed + zone ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-muted p-4">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-text-tertiary">
            Current committed install
          </div>
          <div className="text-sm font-medium text-text-primary tabular-nums">
            {formatDate(job.installDate)}{" "}
            <span className="text-xs text-text-tertiary">· {remainingBuffer}d buffer</span>
          </div>
        </div>
        <span
          data-testid="recommit-zone-pill"
          data-zone={zone}
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-label font-medium",
            ZONE_STYLE[zone]
          )}
        >
          {ZONE_LABEL[zone]}
        </span>
      </div>

      {/* ── Kind toggle ── */}
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5">
        {(
          [
            ["recommit", "Re-commit"],
            ["change_order", "Change order"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            data-testid={`recommit-kind-${k === "change_order" ? "change-order" : k}`}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors duration-fast",
              kind === k ? "bg-ink-pill text-white" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Recovery-first advisory (re-commit only) ── */}
      {kind === "recommit" && !gate.canRecommit && (
        <div
          data-testid="recommit-recovery-note"
          className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{gate.message}</span>
        </div>
      )}

      {/* ── Change-order impact ── */}
      {kind === "change_order" && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-text-secondary">
            <span className="mb-1 block uppercase tracking-wide text-text-tertiary">
              Added work (days)
            </span>
            <input
              type="number"
              min={0}
              aria-label="Added work days"
              data-testid="recommit-added-days-input"
              value={addedDays}
              onChange={(e) => setAddedDays(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm tabular-nums"
            />
          </label>
          <div
            data-testid="recommit-change-order-impact"
            data-absorbs={impact.absorbs}
            className="self-end rounded-md bg-surface-muted px-3 py-2 text-xs text-text-secondary"
          >
            {impact.absorbs ? (
              <>Absorbs into the {remainingBuffer}d buffer — committed date holds.</>
            ) : (
              <>
                Exceeds buffer by {impact.committedDateDeltaDays}d → new date{" "}
                {friendlyDate(changeOrderDate)}.
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Form fields ── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-text-secondary">
          <span className="mb-1 block uppercase tracking-wide text-text-tertiary">Reason</span>
          <select
            aria-label="Re-commit reason"
            data-testid="recommit-reason-select"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as RecommitReasonCode)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          >
            {RECOMMIT_REASON_CODES.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          <span className="mb-1 block uppercase tracking-wide text-text-tertiary">
            New committed date
          </span>
          <input
            type="date"
            aria-label="New committed install date"
            data-testid="recommit-new-date-input"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs text-text-secondary">
          <span className="mb-1 block uppercase tracking-wide text-text-tertiary">
            Fresh buffer (days)
          </span>
          <input
            type="number"
            min={0}
            aria-label="Fresh buffer days"
            data-testid="recommit-new-buffer-input"
            value={newBuffer}
            onChange={(e) => setNewBuffer(Math.max(0, Number(e.target.value)))}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm tabular-nums"
          />
        </label>
      </div>

      <label className="mb-4 block text-xs text-text-secondary">
        <span className="mb-1 block uppercase tracking-wide text-text-tertiary">
          Note (optional)
        </span>
        <textarea
          aria-label="Re-commit note"
          data-testid="recommit-note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          placeholder="What changed, in plain English"
        />
      </label>

      {/* ── Reliability badge ── */}
      <div className="mb-4 text-xs text-text-tertiary">
        Reliability impact:{" "}
        <span
          data-testid="recommit-dings-badge"
          data-dings={willDing}
          className={cn(
            "rounded px-1.5 py-0.5 font-medium",
            willDing
              ? "bg-status-blocked-soft text-status-blocked"
              : "bg-surface-muted text-text-secondary"
          )}
        >
          {willDing ? "Counts against reliability" : "Does not ding reliability"}
        </span>
      </div>

      {/* ── Drafted client email (live preview) ── */}
      <div
        data-testid="recommit-email-draft"
        className="mb-4 rounded-lg border border-border bg-surface-muted p-4"
      >
        <div className="mb-2 flex items-center gap-2">
          <Mail className="h-4 w-4 text-text-tertiary" aria-hidden />
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
            Draft client email for approval
          </h4>
        </div>
        <div className="text-xs text-text-secondary">
          <div className="mb-1">
            <span className="text-text-tertiary">Subject:</span>{" "}
            <span data-testid="recommit-email-subject" className="font-medium text-text-primary">
              {emailDraft.subject}
            </span>
          </div>
          <pre
            data-testid="recommit-email-body"
            className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-text-secondary"
          >
            {emailDraft.body}
          </pre>
        </div>
      </div>

      {/* ── Submit ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="recommit-submit"
          onClick={handleSubmit}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-ink-pill px-4 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          )}
          Log revision &amp; update committed date
        </button>
        {savedAt && (
          <span data-testid="recommit-saved" className="text-xs text-status-on-track">
            Logged. Send the drafted email when ready.
          </span>
        )}
      </div>

      {/* ── Revision history ── */}
      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2">
          <History className="h-4 w-4 text-text-tertiary" aria-hidden />
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
            Revision history
          </h4>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading revisions…
          </div>
        ) : revisions.length === 0 ? (
          <p data-testid="recommit-empty" className="text-xs text-text-tertiary">
            No re-commits yet — the original committed date stands.
          </p>
        ) : (
          <ul data-testid="recommit-revision-history" className="flex flex-col gap-2">
            {revisions.map((r) => (
              <li
                key={r.id}
                data-testid={`recommit-revision-${r.id}`}
                data-kind={r.kind}
                data-dings={r.dings_reliability}
                className="rounded-lg border border-border px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-medium uppercase tracking-wide text-[10px] text-text-secondary">
                    {r.kind === "change_order" ? "Change order" : "Re-commit"}
                  </span>
                  <span className="text-text-tertiary tabular-nums">
                    {friendlyDate(r.old_committed_date)} → {friendlyDate(r.new_committed_date)}
                  </span>
                  <span className="text-text-tertiary">
                    · {reasonCodeMeta(r.reason_code).label}
                  </span>
                  {r.dings_reliability ? (
                    <span className="rounded bg-status-blocked-soft px-1 py-0.5 text-[10px] text-status-blocked">
                      dings reliability
                    </span>
                  ) : (
                    <span className="rounded bg-surface-muted px-1 py-0.5 text-[10px] text-text-tertiary">
                      no ding
                    </span>
                  )}
                </div>
                <div className="mt-1 text-text-tertiary">
                  {r.revised_by ? `${r.revised_by} · ` : ""}
                  {formatDate(r.revised_at.slice(0, 10))}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
