"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, AlertTriangle, Info, Loader2 } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { hasSupabase, getSupabase, SCHEDULING_MAKE_READY_ITEMS_TABLE } from "@shared/lib/supabase";
import { MILESTONE_STAGES } from "@shared/lib/types";
import type { MilestoneStage } from "@shared/lib/types";
import {
  STANDARD_MAKE_READY_ITEMS,
  buildMakeReadyItems,
  applyAutoSignals,
  phaseIsReady,
  makeReadySummary,
  type MakeReadyItem,
  type MakeReadySignals,
} from "../lib/makeReady";

// ─── DB row type (subset we actually read) ────────────────────────────────────

type SavedRow = {
  template_item_id: string;
  checked: boolean;
  overridden: boolean;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReadinessBadge({ ready, checkedCount, total }: { ready: boolean; checkedCount: number; total: number }) {
  return (
    <span
      data-testid="make-ready-badge"
      data-ready={ready}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        ready
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      )}
    >
      {ready ? <Check className="h-3 w-3" aria-hidden /> : <AlertTriangle className="h-3 w-3" aria-hidden />}
      {checkedCount}/{total}
    </span>
  );
}

function ChecklistItem({
  item,
  busy,
  onToggle,
  onOverride,
}: {
  item: MakeReadyItem;
  busy: boolean;
  onToggle: (id: string) => void;
  onOverride: (id: string) => void;
}) {
  const isAuto = Boolean(item.autoSignal);
  const resolved = item.checked || item.overridden;

  return (
    <li
      className="flex items-start gap-2.5"
      data-testid={`make-ready-item-${item.id}`}
      data-checked={item.checked}
      data-overridden={item.overridden}
    >
      {/* Check control */}
      {isAuto ? (
        // Auto-signal items: read-only checkbox driven by the signal state.
        <span
          aria-label={item.checked ? `${item.label} — auto-ticked` : `${item.label} — waiting for signal`}
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
            item.checked
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-border bg-surface-muted"
          )}
        >
          {item.checked && <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />}
        </span>
      ) : (
        // Manual items: interactive checkbox.
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          disabled={busy || item.overridden}
          data-testid={`make-ready-check-${item.id}`}
          aria-label={item.checked ? `Uncheck: ${item.label}` : `Check: ${item.label}`}
          aria-pressed={item.checked}
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-fast disabled:opacity-50",
            item.checked
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-border bg-surface hover:border-accent"
          )}
        >
          {item.checked && <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />}
        </button>
      )}

      {/* Label + auto-signal badge */}
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-sm",
            resolved ? "text-text-primary" : "text-text-secondary"
          )}
        >
          {item.label}
        </span>
        {isAuto && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-surface-muted px-1 py-0 text-xs text-text-tertiary">
            <Info className="h-2.5 w-2.5" aria-hidden />
            auto
          </span>
        )}
        {item.overridden && (
          <span className="ml-1.5 text-xs text-amber-600">overridden</span>
        )}
      </div>

      {/* Per-item override button (only for unchecked manual items) */}
      {!isAuto && !item.checked && !item.overridden && (
        <button
          type="button"
          onClick={() => onOverride(item.id)}
          disabled={busy}
          data-testid={`make-ready-override-${item.id}`}
          aria-label={`Override: proceed without completing "${item.label}"`}
          title="Proceed anyway without completing this item"
          className="shrink-0 rounded px-1.5 py-0.5 text-xs text-text-tertiary hover:bg-surface-muted hover:text-amber-700 transition-colors duration-fast disabled:opacity-50"
        >
          Proceed anyway
        </button>
      )}
    </li>
  );
}

// ─── Per-phase panel ──────────────────────────────────────────────────────────

function PhaseChecklist({
  phase,
  phaseLabel,
  items,
  busy,
  onToggle,
  onOverride,
}: {
  phase: MilestoneStage;
  phaseLabel: string;
  items: MakeReadyItem[];
  busy: boolean;
  onToggle: (id: string) => void;
  onOverride: (id: string) => void;
}) {
  const summary = makeReadySummary(items);

  return (
    <div
      data-testid={`make-ready-phase-${phase}`}
      data-ready={summary.ready}
      className="rounded-lg border border-border bg-surface shadow-resting"
    >
      {/* Phase header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex-1 text-sm font-medium text-text-primary">{phaseLabel}</span>
        <ReadinessBadge
          ready={summary.ready}
          checkedCount={summary.checkedCount}
          total={summary.total}
        />
      </div>

      {/* Not-ready warning */}
      {!summary.ready && (
        <div
          data-testid={`make-ready-warning-${phase}`}
          className="mx-4 mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          role="status"
          aria-live="polite"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Phase not ready — {summary.total - summary.checkedCount} item
          {summary.total - summary.checkedCount !== 1 ? "s" : ""} outstanding. You
          can still proceed (soft gate).
        </div>
      )}

      {/* Checklist items */}
      <ul className="flex flex-col gap-2 px-4 pb-4">
        {items.map((item) => (
          <ChecklistItem
            key={item.id}
            item={item}
            busy={busy}
            onToggle={onToggle}
            onOverride={onOverride}
          />
        ))}
      </ul>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Make-ready gate panel for the Schedule tab (S12, issue #100).
 *
 * Shows a per-phase readiness checklist. Items auto-tick from existing signals
 * (design sign-off, blocker resolved, material logged); the rest are manually
 * checked by the owner / shop lead. Phases warn when not ready but allow
 * override (soft gate, ADR 0013). Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED.
 *
 * Only renders the phases that have items in STANDARD_MAKE_READY_ITEMS (all six
 * currently). The current milestone phase is expanded by default; others show
 * their summary badge.
 */
export function MakeReadyChecklistPanel({
  jobId,
  currentMilestone,
  signals,
}: {
  jobId: string;
  currentMilestone: MilestoneStage;
  /**
   * Pre-computed signal states from the job's live data (passed down from the
   * parent so this component stays testable without needing to fetch signals).
   */
  signals: MakeReadySignals;
}) {
  // itemsByPhase: raw items (from standard items + saved state, without auto-signals applied).
  const [itemsByPhase, setItemsByPhase] = useState<
    Partial<Record<MilestoneStage, MakeReadyItem[]>>
  >({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load saved state from Supabase and merge onto standard items.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        let saved: SavedRow[] = [];
        if (hasSupabase()) {
          const { data, error: dbErr } = await getSupabase()
            .from(SCHEDULING_MAKE_READY_ITEMS_TABLE)
            .select("template_item_id, checked, overridden")
            .eq("job_id", jobId);
          if (!dbErr && data) saved = data as SavedRow[];
        }

        if (cancelled) return;

        const savedMapped = saved.map((r) => ({
          id: r.template_item_id,
          checked: r.checked,
          overridden: r.overridden,
        }));

        const built: Partial<Record<MilestoneStage, MakeReadyItem[]>> = {};
        for (const { key } of MILESTONE_STAGES) {
          built[key] = buildMakeReadyItems(key, savedMapped);
        }
        setItemsByPhase(built);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Upsert a single item's state to Supabase.
  const persist = useCallback(
    async (item: MakeReadyItem, update: Partial<Pick<MakeReadyItem, "checked" | "overridden">>) => {
      if (!hasSupabase()) return;
      await getSupabase()
        .from(SCHEDULING_MAKE_READY_ITEMS_TABLE)
        .upsert(
          {
            job_id: jobId,
            phase: item.phase,
            template_item_id: item.id,
            label: item.label,
            source: "template",
            auto_signal: item.autoSignal ?? null,
            checked: update.checked ?? item.checked,
            overridden: update.overridden ?? item.overridden,
            sort_order: item.sortOrder,
          },
          { onConflict: "job_id,template_item_id" }
        );
    },
    [jobId]
  );

  const updateItem = useCallback(
    async (
      phase: MilestoneStage,
      itemId: string,
      update: Partial<Pick<MakeReadyItem, "checked" | "overridden">>
    ) => {
      setBusyId(itemId);
      setError(null);
      try {
        const currentItems = itemsByPhase[phase] ?? [];
        const item = currentItems.find((i) => i.id === itemId);
        if (!item) return;

        const updated = { ...item, ...update };
        await persist(updated, update);

        setItemsByPhase((prev) => ({
          ...prev,
          [phase]: (prev[phase] ?? []).map((i) => (i.id === itemId ? updated : i)),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setBusyId(null);
      }
    },
    [itemsByPhase, persist]
  );

  const handleToggle = useCallback(
    (phase: MilestoneStage) => async (itemId: string) => {
      const item = (itemsByPhase[phase] ?? []).find((i) => i.id === itemId);
      if (!item || item.autoSignal) return;
      await updateItem(phase, itemId, { checked: !item.checked });
    },
    [itemsByPhase, updateItem]
  );

  const handleOverride = useCallback(
    (phase: MilestoneStage) => async (itemId: string) => {
      await updateItem(phase, itemId, { overridden: true });
    },
    [updateItem]
  );

  if (loading) {
    return (
      <section data-testid="make-ready-panel" className="bg-surface rounded-xl shadow-resting p-6">
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading make-ready checklist…
        </div>
      </section>
    );
  }

  // Apply auto-signals at render time so the derived state is always fresh.
  const displayPhases = MILESTONE_STAGES.map(({ key, label }) => {
    const raw = itemsByPhase[key] ?? [];
    const withSignals = applyAutoSignals(raw, signals);
    const summary = makeReadySummary(withSignals);
    const isCurrent = key === currentMilestone;
    return { phase: key, label, items: withSignals, summary, isCurrent };
  });

  const allReady = displayPhases.every((p) => p.summary.ready);

  return (
    <section
      data-testid="make-ready-panel"
      data-all-ready={allReady}
      className="bg-surface rounded-xl shadow-resting p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
          Make-Ready Gate
        </h3>
        {allReady ? (
          <span
            data-testid="make-ready-all-clear"
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
          >
            <Check className="h-3 w-3" aria-hidden />
            All phases clear
          </span>
        ) : (
          <span className="text-xs text-text-tertiary">
            Soft gate — warnings only (ADR 0013)
          </span>
        )}
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <p className="mb-4 text-xs text-text-tertiary">
        Before committing to start a phase, confirm all prerequisites are in place.
        Auto-ticked items are derived from existing job signals. Unchecked items warn
        but never block progress.
      </p>

      <div className="flex flex-col gap-3">
        {displayPhases.map(({ phase, label, items, isCurrent }) => (
          <PhaseChecklist
            key={phase}
            phase={phase}
            phaseLabel={isCurrent ? `${label} (current)` : label}
            items={items}
            busy={busyId !== null}
            onToggle={handleToggle(phase)}
            onOverride={handleOverride(phase)}
          />
        ))}
      </div>
    </section>
  );
}
