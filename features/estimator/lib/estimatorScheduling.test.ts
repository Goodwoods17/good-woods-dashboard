import { describe, it, expect } from "vitest";
import { capacityQuoteWarning } from "./estimatorScheduling";
import type { PhaseCapacityRow } from "@features/scheduling/lib/capacity";

function makeRow(
  phase: PhaseCapacityRow["phase"],
  ratio: number,
  status: PhaseCapacityRow["status"]
): PhaseCapacityRow {
  return {
    phase,
    label: phase.charAt(0).toUpperCase() + phase.slice(1),
    loadHours: ratio * 40,
    capacityHours: 40,
    ratio,
    status,
  };
}

const UNDER_ROWS: PhaseCapacityRow[] = [
  makeRow("design", 0.5, "under"),
  makeRow("cnc", 0.3, "under"),
  makeRow("assembly", 0.6, "under"),
  makeRow("finishing", 0.4, "under"),
  makeRow("delivery", 0.2, "under"),
  makeRow("install", 0.7, "under"),
];

describe("capacityQuoteWarning", () => {
  it("returns null when all phases are under capacity", () => {
    expect(capacityQuoteWarning(UNDER_ROWS, "2026-08-15")).toBeNull();
  });

  it("returns null for an empty row list", () => {
    expect(capacityQuoteWarning([], "2026-08-15")).toBeNull();
  });

  it("returns a warning when the bottleneck phase is near capacity", () => {
    const rows: PhaseCapacityRow[] = [
      makeRow("design", 0.5, "under"),
      makeRow("cnc", 0.3, "under"),
      makeRow("assembly", 0.95, "near"),
      makeRow("finishing", 0.4, "under"),
      makeRow("delivery", 0.2, "under"),
      makeRow("install", 0.7, "under"),
    ];
    const warning = capacityQuoteWarning(rows, "2026-08-15");
    expect(warning).not.toBeNull();
    // Names the phase work-center
    expect(warning).toContain("Assembly");
    // Shows the utilization percentage (95%)
    expect(warning).toContain("95%");
    // Contains the install date in human-readable form
    expect(warning).toContain("Aug 15");
  });

  it("returns a warning when the bottleneck phase is over capacity", () => {
    const rows: PhaseCapacityRow[] = [
      makeRow("design", 0.5, "under"),
      makeRow("cnc", 1.5, "over"),
      makeRow("assembly", 0.4, "under"),
      makeRow("finishing", 0.4, "under"),
      makeRow("delivery", 0.2, "under"),
      makeRow("install", 0.7, "under"),
    ];
    const warning = capacityQuoteWarning(rows, "2026-09-01");
    expect(warning).not.toBeNull();
    expect(warning).toContain("CNC");
    expect(warning).toContain("150%");
    expect(warning).toContain("Sep 1");
  });

  it("names the MOST overloaded phase when multiple phases are constrained", () => {
    const rows: PhaseCapacityRow[] = [
      makeRow("design", 0.5, "under"),
      makeRow("cnc", 0.95, "near"),
      makeRow("assembly", 1.2, "over"),
      makeRow("finishing", 0.4, "under"),
      makeRow("delivery", 0.2, "under"),
      makeRow("install", 0.7, "under"),
    ];
    const warning = capacityQuoteWarning(rows, "2026-09-15");
    expect(warning).not.toBeNull();
    // Assembly (1.2 ratio) beats CNC (0.95 ratio) → assembly is named
    expect(warning).toContain("Assembly");
    expect(warning).not.toContain("CNC / Cut");
    expect(warning).toContain("Sep 15");
  });

  it("formats install date correctly for all months", () => {
    const rows: PhaseCapacityRow[] = [...UNDER_ROWS.slice(0, 5), makeRow("install", 0.9, "near")];
    expect(capacityQuoteWarning(rows, "2026-01-01")).toContain("Jan 1");
    expect(capacityQuoteWarning(rows, "2026-07-04")).toContain("Jul 4");
    expect(capacityQuoteWarning(rows, "2026-12-25")).toContain("Dec 25");
  });

  it("uses the MILESTONE_STAGES canonical label (not the raw phase key)", () => {
    const rows: PhaseCapacityRow[] = [
      makeRow("design", 0.5, "under"),
      makeRow("cnc", 0.95, "near"),
      makeRow("assembly", 0.4, "under"),
      makeRow("finishing", 0.4, "under"),
      makeRow("delivery", 0.2, "under"),
      makeRow("install", 0.7, "under"),
    ];
    const warning = capacityQuoteWarning(rows, "2026-08-01");
    // "cnc" key → "CNC / Cut" label from MILESTONE_STAGES
    expect(warning).toContain("CNC");
    // Not the raw key
    expect(warning).not.toContain('"cnc"');
  });
});
