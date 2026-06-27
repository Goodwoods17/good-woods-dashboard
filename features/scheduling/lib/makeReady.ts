/**
 * S12 — Make-ready gate (templated checklist, soft gate).
 *
 * Last-Planner "make-ready" principle: before committing to start a phase,
 * verify that all prerequisites are in place. This module provides:
 *
 *  1. STANDARD_MAKE_READY_ITEMS — a per-phase checklist seeded from shop best
 *     practice (e.g. CNC/Cut: drawings final + materials/Toolpath ready).
 *  2. buildMakeReadyItems — merge stored state onto the standard items.
 *  3. applyAutoSignals — tick items whose signal has fired (design sign-off,
 *     blocker resolved, material logged) without requiring manual action.
 *  4. phaseIsReady — true when every item is checked OR overridden (soft gate,
 *     ADR 0013: warns but allows the owner to proceed).
 *  5. makeReadySummary — counts for the "N of M ready" badge.
 *
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod). Pure + dependency-
 * free: all Supabase I/O lives in the store / component.
 */

import type { MilestoneStage } from "@shared/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Named signals derived from existing job data that auto-tick checklist items,
 * eliminating redundant manual taps when the data already proves readiness.
 *
 * - `blocker_resolved`: no active job_blockers gate this phase → supplier / client
 *   sign-off isn't blocking us.
 * - `design_signoff`: the Design phase is 100% complete → drawings are approved.
 * - `material_logged`: materials have been logged (inventory / job items in cnc phase).
 */
export type AutoSignal = "blocker_resolved" | "design_signoff" | "material_logged";

/** Definition of one standard make-ready checklist item (phase-level template). */
export type MakeReadyItemDef = {
  /** Stable string id (namespaced per phase so cross-phase uniqueness is guaranteed). */
  id: string;
  label: string;
  phase: MilestoneStage;
  /**
   * When set, this item's `checked` state is derived from the named signal rather
   * than stored manually. The crew doesn't tap this — the system ticks it for them.
   */
  autoSignal?: AutoSignal;
  sortOrder: number;
};

/** A make-ready checklist item with per-job runtime state. */
export type MakeReadyItem = MakeReadyItemDef & {
  /**
   * True when the item is ticked. For auto-signal items this is set by
   * `applyAutoSignals`; for manual items it's the stored state.
   */
  checked: boolean;
  /**
   * Soft-gate override (ADR 0013): the owner acknowledged "not ready" and chose
   * to proceed. An overridden item is treated as checked for readiness purposes.
   */
  overridden: boolean;
};

/**
 * Signal states derived from job data at the call site (component / server).
 * Pure functions receive these so they stay dependency-free.
 */
export type MakeReadySignals = {
  /** True when no active job_blockers gate this phase. */
  blockerResolved: boolean;
  /** True when the Design phase is 100% complete (all items done). */
  designSignoff: boolean;
  /** True when materials have been logged (cnc items exist or inventory logged). */
  materialLogged: boolean;
};

/** Readiness summary for the badge / warning in the UI. */
export type MakeReadySummary = {
  total: number;
  /** Items that are checked OR overridden (both count toward gate passage). */
  checkedCount: number;
  /** True when every item is checked or overridden — phase is clear to start. */
  ready: boolean;
  /** True when at least one item was overridden (so the UI can show a caveat). */
  hasOverride: boolean;
};

// ─── Standard checklist items ─────────────────────────────────────────────────

/**
 * Standard make-ready checklist items per phase (the "seeded template").
 * Auto-signal items are ticked by `applyAutoSignals`; the rest require a manual
 * tap from the owner or shop lead.
 *
 * Design philosophy: items should be the minimal set that, when all ticked,
 * genuinely indicates the phase is safe to start. Over-checking leads to
 * friction and bypassing the gate entirely.
 */
export const STANDARD_MAKE_READY_ITEMS: Record<MilestoneStage, MakeReadyItemDef[]> = {
  design: [
    {
      id: "design-mr-01",
      label: "Site measure complete",
      phase: "design",
      sortOrder: 0,
    },
    {
      id: "design-mr-02",
      label: "Client brief confirmed",
      phase: "design",
      sortOrder: 1,
    },
  ],
  cnc: [
    {
      // Issue spec: "Cut: drawings final + materials/Toolpath ready"
      id: "cnc-mr-01",
      label: "Drawings final",
      phase: "cnc",
      // Auto-tick when the Design phase hits 100% (drawings approved sign-off).
      autoSignal: "design_signoff",
      sortOrder: 0,
    },
    {
      id: "cnc-mr-02",
      label: "Materials ordered",
      phase: "cnc",
      // Auto-tick when materials have been logged against this job.
      autoSignal: "material_logged",
      sortOrder: 1,
    },
    {
      id: "cnc-mr-03",
      label: "Toolpath / CNC file ready",
      phase: "cnc",
      sortOrder: 2,
    },
  ],
  assembly: [
    {
      id: "assembly-mr-01",
      label: "Cut list approved",
      phase: "assembly",
      sortOrder: 0,
    },
    {
      id: "assembly-mr-02",
      label: "All parts labeled and staged",
      phase: "assembly",
      sortOrder: 1,
    },
    {
      // No active blocker gating Assembly means subs / suppliers are cleared.
      id: "assembly-mr-03",
      label: "No outstanding blockers",
      phase: "assembly",
      autoSignal: "blocker_resolved",
      sortOrder: 2,
    },
  ],
  finishing: [
    {
      id: "finishing-mr-01",
      label: "Surface prep signed off",
      phase: "finishing",
      sortOrder: 0,
    },
    {
      id: "finishing-mr-02",
      label: "Spray schedule confirmed",
      phase: "finishing",
      sortOrder: 1,
    },
  ],
  delivery: [
    {
      id: "delivery-mr-01",
      label: "Packing list complete",
      phase: "delivery",
      sortOrder: 0,
    },
    {
      id: "delivery-mr-02",
      label: "Delivery route confirmed",
      phase: "delivery",
      sortOrder: 1,
    },
    {
      id: "delivery-mr-03",
      label: "Client notified of delivery window",
      phase: "delivery",
      sortOrder: 2,
    },
  ],
  install: [
    {
      id: "install-mr-01",
      label: "Site access confirmed",
      phase: "install",
      sortOrder: 0,
    },
    {
      id: "install-mr-02",
      label: "Installer briefed",
      phase: "install",
      sortOrder: 1,
    },
    {
      id: "install-mr-03",
      label: "No outstanding blockers",
      phase: "install",
      autoSignal: "blocker_resolved",
      sortOrder: 2,
    },
  ],
};

// ─── Pure functions ───────────────────────────────────────────────────────────

/**
 * Build the full item list for a phase, merging any saved per-job state onto the
 * standard template items. Items without saved state default to unchecked + not
 * overridden. The result is ready for `applyAutoSignals`.
 */
export function buildMakeReadyItems(
  phase: MilestoneStage,
  saved?: Pick<MakeReadyItem, "id" | "checked" | "overridden">[]
): MakeReadyItem[] {
  const savedMap = new Map(
    (saved ?? []).map((s) => [s.id, { checked: s.checked, overridden: s.overridden }])
  );

  return STANDARD_MAKE_READY_ITEMS[phase].map((def) => {
    const state = savedMap.get(def.id);
    return {
      ...def,
      checked: state?.checked ?? false,
      overridden: state?.overridden ?? false,
    };
  });
}

/**
 * Apply auto-signals to a set of items, ticking any whose named signal has fired.
 * Pure: returns a new array, never mutates the input.
 *
 * Called at render time with signals derived from live job data (design phase
 * progress, active blockers, material items), so auto-tick state is always fresh
 * without requiring a write path.
 */
export function applyAutoSignals(
  items: MakeReadyItem[],
  signals: MakeReadySignals
): MakeReadyItem[] {
  return items.map((item) => {
    if (!item.autoSignal) return item;

    const fired =
      (item.autoSignal === "design_signoff" && signals.designSignoff) ||
      (item.autoSignal === "blocker_resolved" && signals.blockerResolved) ||
      (item.autoSignal === "material_logged" && signals.materialLogged);

    if (fired === item.checked) return item; // avoid unnecessary new object
    return { ...item, checked: fired };
  });
}

/**
 * True when every item is either checked or overridden (soft gate, ADR 0013).
 * An overridden item is treated identically to a checked item for gate purposes —
 * the owner has consciously acknowledged the risk.
 */
export function phaseIsReady(items: MakeReadyItem[]): boolean {
  return items.every((item) => item.checked || item.overridden);
}

/**
 * Summary of readiness state for the badge / warning callout.
 * `checkedCount` counts items that are checked OR overridden (both pass the gate).
 */
export function makeReadySummary(items: MakeReadyItem[]): MakeReadySummary {
  const total = items.length;
  const checkedCount = items.filter((i) => i.checked || i.overridden).length;
  const hasOverride = items.some((i) => i.overridden);
  const ready = phaseIsReady(items);
  return { total, checkedCount, ready, hasOverride };
}
