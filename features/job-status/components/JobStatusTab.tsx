"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X, Check } from "lucide-react";
import { Pill } from "@shared/components/ui/Pill";
import { formatError } from "@shared/lib/formatError";
import { hasSupabase } from "@shared/lib/supabase";
import { MILESTONE_STAGES } from "@shared/lib/types";
import { toTrackableItems } from "../lib/adapter";
import { phaseProgress, jobProgress } from "../lib/progress";
import { materialiseTemplates } from "../lib/templates";
import { useJobProgress } from "../lib/jobProgressStore";
import { JOB_ITEM_STATUS_LABELS, jobItemStatusTone } from "../lib/statusPill";
import type { JobItem, Phase } from "../lib/types";

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, testId }: { pct: number; testId?: string }) {
  const pctInt = Math.round(pct * 100);
  return (
    // testid lives on the always-full-width track, not the fill — the fill is
    // zero-width at 0% progress, which Playwright treats as not-visible.
    <div
      data-testid={testId}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
    >
      <div
        className="h-full rounded-full bg-accent transition-all duration-slow"
        style={{ width: `${pctInt}%` }}
        role="progressbar"
        aria-valuenow={pctInt}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

// ─── Phase section ────────────────────────────────────────────────────────────

type AddForm = { label: string };

function PhaseSection({
  phase,
  phaseLabel,
  phaseItems,
  pct,
  collapsed,
  onToggle,
  busyId,
  onCycle,
  addForm,
  onAddStart,
  onAddLabelChange,
  onAddSubmit,
  onAddCancel,
  addingBusy,
}: {
  phase: Phase;
  phaseLabel: string;
  phaseItems: JobItem[];
  pct: number;
  collapsed: boolean;
  onToggle: () => void;
  busyId: string | null;
  onCycle: (id: string) => Promise<void>;
  addForm: AddForm | null;
  onAddStart: () => void;
  onAddLabelChange: (label: string) => void;
  onAddSubmit: () => void;
  onAddCancel: () => void;
  addingBusy: boolean;
}) {
  const pctInt = Math.round(pct * 100);
  const doneCount = phaseItems.filter((i) => i.status === "done").length;

  return (
    <div
      className="rounded-lg border border-border bg-surface shadow-resting"
      data-testid={`phase-section-${phase}`}
    >
      {/* Phase header — tap to collapse/expand */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={!collapsed}
        aria-controls={`phase-items-${phase}`}
      >
        <span className="text-text-tertiary">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium text-text-primary">{phaseLabel}</span>
          <span className="ml-2 text-xs text-text-tertiary">
            {doneCount}/{phaseItems.length}
          </span>
        </span>
        <span
          className="text-xs font-medium text-text-secondary tabular-nums"
          aria-label={`${pctInt}% complete`}
        >
          {pctInt}%
        </span>
      </button>

      {/* Phase progress bar (always visible, even when collapsed) */}
      <div className="px-4 pb-2">
        <ProgressBar pct={pct} testId={`phase-progress-${phase}`} />
      </div>

      {/* Items + add form (hidden when collapsed) */}
      {!collapsed && (
        <div id={`phase-items-${phase}`} className="px-4 pb-3">
          {phaseItems.length === 0 && !addForm ? (
            <p className="py-2 text-xs text-text-tertiary">No steps yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 mt-1">
              {phaseItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onCycle(item.id)}
                    disabled={busyId === item.id}
                    data-testid="job-status-item"
                    data-status={item.status}
                    data-phase={item.phase}
                    aria-label={`${item.label} — ${JOB_ITEM_STATUS_LABELS[item.status]}, tap to advance`}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors duration-fast hover:bg-surface-muted disabled:opacity-60"
                  >
                    <span className="min-w-0 truncate text-sm text-text-primary">{item.label}</span>
                    <Pill
                      tone={jobItemStatusTone(item.status)}
                      label={JOB_ITEM_STATUS_LABELS[item.status]}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Inline add form */}
          {addForm ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={addForm.label}
                onChange={(e) => onAddLabelChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onAddSubmit();
                  if (e.key === "Escape") onAddCancel();
                }}
                placeholder="Step description…"
                aria-label={`New step for ${phaseLabel}`}
                data-testid={`add-step-input-${phase}`}
                className="flex-1 min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={onAddSubmit}
                disabled={addingBusy || !addForm.label.trim()}
                data-testid={`add-step-submit-${phase}`}
                aria-label="Add step"
                className="inline-flex items-center justify-center rounded-md bg-accent px-2.5 py-2 text-white shadow-resting transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onAddCancel}
                aria-label="Cancel"
                className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-2.5 py-2 text-text-secondary shadow-resting transition-colors duration-fast hover:bg-surface-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAddStart}
              disabled={!hasSupabase()}
              data-testid={`add-step-btn-${phase}`}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-tertiary transition-colors duration-fast hover:bg-surface-muted hover:text-text-secondary disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add step
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

/**
 * Full mobile field view for one job: all 6 phases as collapsible sections,
 * items as tap-to-cycle rows, per-phase + job progress bars, and an inline
 * "add step" form per phase. Template steps are materialised on first open
 * (idempotent — slice 2). Photos + notes land in slice 3.
 */
export function JobStatusTab({ jobId }: { jobId: string }) {
  const { items, loading, cycleItem, addItem, refresh } = useJobProgress(jobId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<Phase>>(new Set());
  const [addPhase, setAddPhase] = useState<Phase | null>(null);
  const [addLabel, setAddLabel] = useState("");
  const [addingBusy, setAddingBusy] = useState(false);

  // Materialise template steps on first mount, then refresh so newly inserted
  // rows appear even if Realtime hasn't pushed them yet.
  const materialisedRef = useRef(false);
  useEffect(() => {
    if (!loading && !materialisedRef.current && hasSupabase()) {
      materialisedRef.current = true;
      materialiseTemplates(jobId)
        .then(() => refresh())
        .catch(() => {});
    }
  }, [jobId, loading, refresh]);

  const trackable = useMemo(() => toTrackableItems(items), [items]);
  const jobPct = jobProgress(trackable);

  const togglePhase = useCallback((phase: Phase) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }, []);

  const onCycle = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        await cycleItem(id);
      } catch (e) {
        setError(formatError(e));
      } finally {
        setBusyId(null);
      }
    },
    [cycleItem]
  );

  const onAddStart = useCallback((phase: Phase) => {
    setAddPhase(phase);
    setAddLabel("");
  }, []);

  const onAddCancel = useCallback(() => {
    setAddPhase(null);
    setAddLabel("");
  }, []);

  const onAddSubmit = useCallback(
    async (phase: Phase) => {
      const label = addLabel.trim();
      if (!label) return;
      setAddingBusy(true);
      setError(null);
      try {
        await addItem(label, phase);
        setAddPhase(null);
        setAddLabel("");
      } catch (e) {
        setError(formatError(e));
      } finally {
        setAddingBusy(false);
      }
    },
    [addItem, addLabel]
  );

  return (
    <section className="px-4 pb-10" data-testid="job-status-tab">
      {/* Job-level progress */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-text-secondary">Overall progress</span>
          <span className="text-xs text-text-tertiary tabular-nums" data-testid="job-progress-pct">
            {Math.round(jobPct * 100)}%
          </span>
        </div>
        <ProgressBar pct={jobPct} testId="job-progress-bar" />
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {MILESTONE_STAGES.map(({ key, label }) => {
            const phaseItems = items.filter((i) => i.phase === key);
            const pct = phaseProgress(trackable, key);
            return (
              <PhaseSection
                key={key}
                phase={key}
                phaseLabel={label}
                phaseItems={phaseItems}
                pct={pct}
                collapsed={collapsedPhases.has(key)}
                onToggle={() => togglePhase(key)}
                busyId={busyId}
                onCycle={onCycle}
                addForm={addPhase === key ? { label: addLabel } : null}
                onAddStart={() => onAddStart(key)}
                onAddLabelChange={setAddLabel}
                onAddSubmit={() => onAddSubmit(key)}
                onAddCancel={onAddCancel}
                addingBusy={addingBusy}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
