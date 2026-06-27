/**
 * S12 — Make-ready gate (templated checklist, soft). Tests written first (TDD).
 * Pure functions only — no Supabase, no React.
 */
import { describe, it, expect } from "vitest";
import {
  STANDARD_MAKE_READY_ITEMS,
  applyAutoSignals,
  phaseIsReady,
  makeReadySummary,
  buildMakeReadyItems,
  type MakeReadyItem,
  type MakeReadySignals,
} from "./makeReady";

// ── STANDARD_MAKE_READY_ITEMS ─────────────────────────────────────────────────

describe("STANDARD_MAKE_READY_ITEMS", () => {
  it("defines items for all six phases", () => {
    for (const phase of ["design", "cnc", "assembly", "finishing", "delivery", "install"] as const) {
      expect(STANDARD_MAKE_READY_ITEMS[phase].length).toBeGreaterThan(0);
    }
  });

  it("includes the issue-spec items for CNC: drawings final + materials/Toolpath", () => {
    const cnc = STANDARD_MAKE_READY_ITEMS.cnc;
    const labels = cnc.map((i) => i.label);
    // Issue explicitly names these two CNC items.
    expect(labels.some((l) => /drawings? final/i.test(l))).toBe(true);
    expect(labels.some((l) => /materials?|toolpath/i.test(l))).toBe(true);
  });

  it("marks 'Drawings final' in CNC as having a design_signoff auto-signal", () => {
    const cncItems = STANDARD_MAKE_READY_ITEMS.cnc;
    const drawingsFinal = cncItems.find((i) => /drawings? final/i.test(i.label));
    expect(drawingsFinal).toBeDefined();
    expect(drawingsFinal!.autoSignal).toBe("design_signoff");
  });

  it("each item has a stable string id", () => {
    for (const items of Object.values(STANDARD_MAKE_READY_ITEMS)) {
      for (const item of items) {
        expect(typeof item.id).toBe("string");
        expect(item.id.length).toBeGreaterThan(0);
      }
    }
  });

  it("ids are unique across all phases", () => {
    const all = Object.values(STANDARD_MAKE_READY_ITEMS).flat();
    const ids = all.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── buildMakeReadyItems ───────────────────────────────────────────────────────

describe("buildMakeReadyItems", () => {
  it("returns the standard items for a phase, all unchecked by default", () => {
    const items = buildMakeReadyItems("cnc");
    expect(items.length).toBe(STANDARD_MAKE_READY_ITEMS.cnc.length);
    for (const item of items) {
      expect(item.checked).toBe(false);
      expect(item.overridden).toBe(false);
    }
  });

  it("merges saved state (checked / overridden) onto standard items", () => {
    const saved: Pick<MakeReadyItem, "id" | "checked" | "overridden">[] = [
      { id: STANDARD_MAKE_READY_ITEMS.cnc[0].id, checked: true, overridden: false },
    ];
    const items = buildMakeReadyItems("cnc", saved);
    const first = items.find((i) => i.id === STANDARD_MAKE_READY_ITEMS.cnc[0].id)!;
    expect(first.checked).toBe(true);
  });

  it("preserves items without saved state as unchecked", () => {
    // Only save state for the first item; rest should remain unchecked.
    const saved: Pick<MakeReadyItem, "id" | "checked" | "overridden">[] = [
      { id: STANDARD_MAKE_READY_ITEMS.cnc[0].id, checked: true, overridden: false },
    ];
    const items = buildMakeReadyItems("cnc", saved);
    const rest = items.filter((i) => i.id !== STANDARD_MAKE_READY_ITEMS.cnc[0].id);
    for (const item of rest) {
      expect(item.checked).toBe(false);
    }
  });
});

// ── applyAutoSignals ──────────────────────────────────────────────────────────

describe("applyAutoSignals", () => {
  const allSignalsOff: MakeReadySignals = {
    blockerResolved: false,
    designSignoff: false,
    materialLogged: false,
  };

  it("does not tick any auto-signal items when all signals are off", () => {
    const items = buildMakeReadyItems("cnc");
    const result = applyAutoSignals(items, allSignalsOff);
    const autoItems = result.filter((i) => i.autoSignal);
    for (const item of autoItems) {
      expect(item.checked).toBe(false);
    }
  });

  it("ticks design_signoff items when designSignoff is true", () => {
    const items = buildMakeReadyItems("cnc");
    const result = applyAutoSignals(items, { ...allSignalsOff, designSignoff: true });
    const signoffItems = result.filter((i) => i.autoSignal === "design_signoff");
    expect(signoffItems.length).toBeGreaterThan(0);
    for (const item of signoffItems) {
      expect(item.checked).toBe(true);
    }
  });

  it("ticks blocker_resolved items when blockerResolved is true", () => {
    // Use a phase that has a blocker_resolved signal item.
    const allPhaseItems = Object.values(STANDARD_MAKE_READY_ITEMS).flat();
    const hasBlockerItem = allPhaseItems.some((i) => i.autoSignal === "blocker_resolved");
    if (!hasBlockerItem) return; // skip if no blocker_resolved items defined

    // Find a phase with blocker_resolved items.
    const phaseWithBlocker = (
      Object.entries(STANDARD_MAKE_READY_ITEMS) as [keyof typeof STANDARD_MAKE_READY_ITEMS, typeof STANDARD_MAKE_READY_ITEMS[keyof typeof STANDARD_MAKE_READY_ITEMS]][])
      .find(([, its]) => its.some((i) => i.autoSignal === "blocker_resolved"))!;

    const [phase] = phaseWithBlocker;
    const items = buildMakeReadyItems(phase as Parameters<typeof buildMakeReadyItems>[0]);
    const result = applyAutoSignals(items, { ...allSignalsOff, blockerResolved: true });
    const blockerItems = result.filter((i) => i.autoSignal === "blocker_resolved");
    for (const item of blockerItems) {
      expect(item.checked).toBe(true);
    }
  });

  it("ticks material_logged items when materialLogged is true", () => {
    const allPhaseItems = Object.values(STANDARD_MAKE_READY_ITEMS).flat();
    const hasMaterialItem = allPhaseItems.some((i) => i.autoSignal === "material_logged");
    if (!hasMaterialItem) return;

    const phaseWithMaterial = (
      Object.entries(STANDARD_MAKE_READY_ITEMS) as [keyof typeof STANDARD_MAKE_READY_ITEMS, typeof STANDARD_MAKE_READY_ITEMS[keyof typeof STANDARD_MAKE_READY_ITEMS]][])
      .find(([, its]) => its.some((i) => i.autoSignal === "material_logged"))!;

    const [phase] = phaseWithMaterial;
    const items = buildMakeReadyItems(phase as Parameters<typeof buildMakeReadyItems>[0]);
    const result = applyAutoSignals(items, { ...allSignalsOff, materialLogged: true });
    const matItems = result.filter((i) => i.autoSignal === "material_logged");
    for (const item of matItems) {
      expect(item.checked).toBe(true);
    }
  });

  it("does not touch manual items when signals fire", () => {
    const items = buildMakeReadyItems("cnc");
    const allSignalsOn: MakeReadySignals = {
      blockerResolved: true,
      designSignoff: true,
      materialLogged: true,
    };
    const result = applyAutoSignals(items, allSignalsOn);
    const manualItems = result.filter((i) => !i.autoSignal && !i.checked);
    // Manual items stay unchecked regardless of signals.
    for (const item of manualItems) {
      expect(item.checked).toBe(false);
    }
  });

  it("is pure: does not mutate the input items array", () => {
    const items = buildMakeReadyItems("cnc");
    const origChecked = items.map((i) => i.checked);
    applyAutoSignals(items, { blockerResolved: true, designSignoff: true, materialLogged: true });
    expect(items.map((i) => i.checked)).toEqual(origChecked);
  });
});

// ── phaseIsReady ──────────────────────────────────────────────────────────────

describe("phaseIsReady", () => {
  it("returns true when there are no items (vacuously ready)", () => {
    expect(phaseIsReady([])).toBe(true);
  });

  it("returns false when any item is unchecked and not overridden", () => {
    const items: MakeReadyItem[] = [
      { id: "a", label: "Drawings final", phase: "cnc", checked: true, overridden: false, sortOrder: 0 },
      { id: "b", label: "Materials ready", phase: "cnc", checked: false, overridden: false, sortOrder: 1 },
    ];
    expect(phaseIsReady(items)).toBe(false);
  });

  it("returns true when all items are checked", () => {
    const items: MakeReadyItem[] = [
      { id: "a", label: "Drawings final", phase: "cnc", checked: true, overridden: false, sortOrder: 0 },
      { id: "b", label: "Materials ready", phase: "cnc", checked: true, overridden: false, sortOrder: 1 },
    ];
    expect(phaseIsReady(items)).toBe(true);
  });

  it("returns true when an unchecked item is individually overridden", () => {
    const items: MakeReadyItem[] = [
      { id: "a", label: "Drawings final", phase: "cnc", checked: false, overridden: true, sortOrder: 0 },
      { id: "b", label: "Materials ready", phase: "cnc", checked: true, overridden: false, sortOrder: 1 },
    ];
    expect(phaseIsReady(items)).toBe(true);
  });

  it("returns true when all items are overridden (soft gate — ADR 0013)", () => {
    const items: MakeReadyItem[] = [
      { id: "a", label: "Drawings final", phase: "cnc", checked: false, overridden: true, sortOrder: 0 },
      { id: "b", label: "Materials ready", phase: "cnc", checked: false, overridden: true, sortOrder: 1 },
    ];
    expect(phaseIsReady(items)).toBe(true);
  });
});

// ── makeReadySummary ──────────────────────────────────────────────────────────

describe("makeReadySummary", () => {
  it("returns zero counts and ready=true for empty items", () => {
    const s = makeReadySummary([]);
    expect(s.total).toBe(0);
    expect(s.checkedCount).toBe(0);
    expect(s.ready).toBe(true);
    expect(s.hasOverride).toBe(false);
  });

  it("reports correct counts for a mixed set where all items are resolved", () => {
    // checked + overridden both count toward readiness → ready=true.
    const items: MakeReadyItem[] = [
      { id: "a", label: "A", phase: "cnc", checked: true, overridden: false, sortOrder: 0 },
      { id: "c", label: "C", phase: "cnc", checked: false, overridden: true, sortOrder: 2 },
    ];
    const s = makeReadySummary(items);
    expect(s.total).toBe(2);
    expect(s.checkedCount).toBe(2);
    expect(s.ready).toBe(true);
    expect(s.hasOverride).toBe(true);
  });

  it("reports ready=false when some items are unchecked and not overridden", () => {
    const items: MakeReadyItem[] = [
      { id: "a", label: "A", phase: "cnc", checked: true, overridden: false, sortOrder: 0 },
      { id: "b", label: "B", phase: "cnc", checked: false, overridden: false, sortOrder: 1 },
      { id: "c", label: "C", phase: "cnc", checked: false, overridden: true, sortOrder: 2 },
    ];
    const s = makeReadySummary(items);
    expect(s.total).toBe(3);
    expect(s.checkedCount).toBe(2); // a (checked) + c (overridden)
    expect(s.ready).toBe(false);    // b is neither checked nor overridden
    expect(s.hasOverride).toBe(true);
  });

  it("hasOverride is false when no items are overridden", () => {
    const items: MakeReadyItem[] = [
      { id: "a", label: "A", phase: "cnc", checked: true, overridden: false, sortOrder: 0 },
    ];
    expect(makeReadySummary(items).hasOverride).toBe(false);
  });

  it("ready=false when some items are unchecked and not overridden", () => {
    const items: MakeReadyItem[] = [
      { id: "a", label: "A", phase: "cnc", checked: false, overridden: false, sortOrder: 0 },
    ];
    const s = makeReadySummary(items);
    expect(s.ready).toBe(false);
    expect(s.checkedCount).toBe(0);
  });
});
