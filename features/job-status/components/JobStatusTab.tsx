"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X, Check, Eye, EyeOff } from "lucide-react";
import { Pill } from "@shared/components/ui/Pill";
import type { PillTone } from "@shared/components/ui/Pill";
import { formatError } from "@shared/lib/formatError";
import { hasSupabase } from "@shared/lib/supabase";
import { MILESTONE_STAGES } from "@shared/lib/types";
import { stageLabel, DONE as PIECE_DONE } from "@features/drawings/lib/pipelines";
import { toTrackableItems, piecesToTrackableItems, pieceToPhase } from "../lib/adapter";
import { phaseProgress, jobProgress } from "../lib/progress";
import { materialiseTemplates } from "../lib/templates";
import { useJobProgress } from "../lib/jobProgressStore";
import { JOB_ITEM_STATUS_LABELS, jobItemStatusTone } from "../lib/statusPill";
import { nextVisibility, isClientFacing, VISIBILITY_LABELS, VISIBILITY_SHORT_LABELS, visibilityTone } from "../lib/visibilityPill";
import type { Phase, TrackableItemKind, Visibility } from "../lib/types";

// ─── Unified display row (job_items + Drawings pieces) ────────────────────────

type StatusRow = {
  id: string;
  label: string;
  kind: TrackableItemKind;
  /** Raw status string — used in data-status attribute for tests and status pill. */
  rawStatus: string;
  /** Normalised done flag (true = counts toward progress). */
  done: boolean;
  statusLabel: string;
  tone: PillTone;
  /** Slice 6: which audience can see this item. Default 'owner'. */
  visibility: Visibility;
};

/** Pill tone for a Drawings piece status. Production statuses look like in_progress;
 *  terminal ('done') is green; not_started is muted. */
function pieceStatusTone(status: string): PillTone {
  if (status === PIECE_DONE)
    return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" };
  if (status === "not_started")
    return { bg: "bg-surface-muted", text: "text-text-secondary", dot: "bg-text-tertiary" };
  // Any intermediate production/delivery/install status: blue in-progress tone.
  return { bg: "bg-accent-soft", text: "text-accent", dot: "bg-accent" };
}

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

// ─── Visibility badge button ───────────────────────────────────────────────────

/**
 * Compact inline button that shows the current visibility and cycles it on tap.
 * Client-facing values (client | both) are highlighted in amber/blue; owner is
 * muted so the default state doesn't distract from item labels.
 */
function VisibilityBadge({
  visibility,
  onCycle,
  busy,
}: {
  visibility: Visibility;
  onCycle: () => void;
  busy: boolean;
}) {
  const facing = isClientFacing(visibility);
  const tone = visibilityTone(visibility);
  return (
    <button
      type="button"
      onClick={onCycle}
      disabled={busy}
      data-testid="visibility-toggle"
      data-visibility={visibility}
      aria-label={`Visibility: ${VISIBILITY_LABELS[visibility]}, tap to change`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-fast disabled:opacity-50 ${tone.bg} ${tone.text}`}
    >
      {facing ? (
        <Eye className="h-3 w-3" aria-hidden />
      ) : (
        <EyeOff className="h-3 w-3" aria-hidden />
      )}
      <span>{VISIBILITY_SHORT_LABELS[visibility]}</span>
    </button>
  );
}

// ─── Phase section ────────────────────────────────────────────────────────────

type AddForm = { label: string };

function PhaseSection({
  phase,
  phaseLabel,
  rows,
  pct,
  collapsed,
  onToggle,
  busyId,
  onCycle,
  visibilityBusyId,
  onSetVisibility,
  addForm,
  onAddStart,
  onAddLabelChange,
  onAddSubmit,
  onAddCancel,
  addingBusy,
}: {
  phase: Phase;
  phaseLabel: string;
  /** Unified display rows: job_items + Drawings pieces merged and sorted. */
  rows: StatusRow[];
  pct: number;
  collapsed: boolean;
  onToggle: () => void;
  busyId: string | null;
  onCycle: (id: string, kind: TrackableItemKind) => Promise<void>;
  /** Slice 6: id of the item whose visibility is being updated right now. */
  visibilityBusyId: string | null;
  /** Slice 6: update the visibility on an item to the next value in the cycle. */
  onSetVisibility: (id: string, kind: TrackableItemKind, next: Visibility) => Promise<void>;
  addForm: AddForm | null;
  onAddStart: () => void;
  onAddLabelChange: (label: string) => void;
  onAddSubmit: () => void;
  onAddCancel: () => void;
  addingBusy: boolean;
}) {
  const pctInt = Math.round(pct * 100);
  const doneCount = rows.filter((r) => r.done).length;

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
            {doneCount}/{rows.length}
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
          {rows.length === 0 && !addForm ? (
            <p className="py-2 text-xs text-text-tertiary">No steps yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 mt-1">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-1.5">
                  {/* Status cycle button (flex-1 so it takes remaining width) */}
                  <button
                    type="button"
                    onClick={() => onCycle(row.id, row.kind)}
                    disabled={busyId === row.id}
                    data-testid="job-status-item"
                    data-status={row.rawStatus}
                    data-kind={row.kind}
                    data-phase={phase}
                    aria-label={`${row.label} — ${row.statusLabel}, tap to advance`}
                    className="flex flex-1 min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors duration-fast hover:bg-surface-muted disabled:opacity-60"
                  >
                    <span className="min-w-0 truncate text-sm text-text-primary">{row.label}</span>
                    <Pill tone={row.tone} label={row.statusLabel} />
                  </button>

                  {/* Visibility toggle (slice 6) — separate tap target, no nesting */}
                  <VisibilityBadge
                    visibility={row.visibility}
                    busy={visibilityBusyId === row.id}
                    onCycle={() =>
                      onSetVisibility(row.id, row.kind, nextVisibility(row.visibility))
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Inline add form (job_items only — pieces live in their own table). */}
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
 * (idempotent — slice 2). Photos + notes land in slice 3. Visibility tagging
 * (owner | client | both) per item: slice 6.
 */
export function JobStatusTab({ jobId }: { jobId: string }) {
  const { items, pieces, loading, cycleItem, cyclePiece, addItem, refresh, setItemVisibility, setPieceVisibility } = useJobProgress(jobId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [visibilityBusyId, setVisibilityBusyId] = useState<string | null>(null);
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

  // Unified trackable items for progress math (job_items + pieces).
  const trackable = useMemo(
    () => [...toTrackableItems(items), ...piecesToTrackableItems(pieces)],
    [items, pieces]
  );
  const jobPct = jobProgress(trackable);

  // Unified display rows per phase for the PhaseSection list.
  const rowsByPhase = useMemo(() => {
    const map = new Map<Phase, StatusRow[]>();
    for (const item of items) {
      const row: StatusRow = {
        id: item.id,
        label: item.label,
        kind: "job_item",
        rawStatus: item.status,
        done: item.status === "done",
        statusLabel: JOB_ITEM_STATUS_LABELS[item.status],
        tone: jobItemStatusTone(item.status),
        visibility: item.visibility,
      };
      if (!map.has(item.phase)) map.set(item.phase, []);
      map.get(item.phase)!.push(row);
    }
    for (const piece of pieces) {
      const phase = pieceToPhase(piece.status);
      // JobPiece.visibility is optional string; coerce to Visibility with safe fallback.
      const rawVis = piece.visibility ?? "owner";
      const visibility: Visibility =
        rawVis === "client" || rawVis === "both" ? rawVis : "owner";
      const row: StatusRow = {
        id: piece.id,
        label: piece.label,
        kind: "piece",
        rawStatus: piece.status,
        done: piece.status === PIECE_DONE,
        statusLabel: stageLabel(piece.status),
        tone: pieceStatusTone(piece.status),
        visibility,
      };
      if (!map.has(phase)) map.set(phase, []);
      map.get(phase)!.push(row);
    }
    return map;
  }, [items, pieces]);

  const togglePhase = useCallback((phase: Phase) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }, []);

  const onCycle = useCallback(
    async (id: string, kind: TrackableItemKind) => {
      setBusyId(id);
      setError(null);
      try {
        if (kind === "job_item") await cycleItem(id);
        else await cyclePiece(id);
      } catch (e) {
        setError(formatError(e));
      } finally {
        setBusyId(null);
      }
    },
    [cycleItem, cyclePiece]
  );

  // Slice 6: cycle visibility on an item (job_item or piece).
  const onSetVisibility = useCallback(
    async (id: string, kind: TrackableItemKind, next: Visibility) => {
      setVisibilityBusyId(id);
      setError(null);
      try {
        if (kind === "job_item") await setItemVisibility(id, next);
        else await setPieceVisibility(id, next);
      } catch (e) {
        setError(formatError(e));
      } finally {
        setVisibilityBusyId(null);
      }
    },
    [setItemVisibility, setPieceVisibility]
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
      {error && (
        <p className="mb-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : (
        <>
          {/* Job-level progress — rendered only once BOTH job_items and pieces
              have loaded (combinedLoading), so the % reflects the full trackable
              set in one paint instead of flickering items-only → +pieces. */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-text-secondary">Overall progress</span>
              <span
                className="text-xs text-text-tertiary tabular-nums"
                data-testid="job-progress-pct"
              >
                {Math.round(jobPct * 100)}%
              </span>
            </div>
            <ProgressBar pct={jobPct} testId="job-progress-bar" />
          </div>

          <div className="flex flex-col gap-3">
            {MILESTONE_STAGES.map(({ key, label }) => {
              const rows = rowsByPhase.get(key) ?? [];
              const pct = phaseProgress(trackable, key);
              return (
                <PhaseSection
                  key={key}
                  phase={key}
                  phaseLabel={label}
                  rows={rows}
                  pct={pct}
                  collapsed={collapsedPhases.has(key)}
                  onToggle={() => togglePhase(key)}
                  busyId={busyId}
                  onCycle={onCycle}
                  visibilityBusyId={visibilityBusyId}
                  onSetVisibility={onSetVisibility}
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
        </>
      )}
    </section>
  );
}
