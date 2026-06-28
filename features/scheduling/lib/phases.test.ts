import { describe, it, expect } from "vitest";
import {
  PHASE_LIST,
  phaseIndex,
  internalPhaseLabel,
  clientPhaseLabel,
  CLIENT_PHASE_LABELS,
  DEFAULT_PHASE_DURATION_DAYS,
  defaultPhaseDurationDays,
} from "./phases";
import type { MilestoneStage } from "@shared/lib/types";

const EXPECTED_ORDER: MilestoneStage[] = [
  "design",
  "cnc",
  "assembly",
  "finishing",
  "delivery",
  "install",
];

describe("PHASE_LIST", () => {
  it("is the six phases in canonical milestone order", () => {
    expect([...PHASE_LIST]).toEqual(EXPECTED_ORDER);
  });
});

describe("phaseIndex", () => {
  it("round-trips: PHASE_LIST[phaseIndex(p)] === p for every phase", () => {
    for (const phase of PHASE_LIST) {
      expect(PHASE_LIST[phaseIndex(phase)]).toBe(phase);
    }
  });

  it("returns each phase's ordinal position", () => {
    EXPECTED_ORDER.forEach((phase, idx) => {
      expect(phaseIndex(phase)).toBe(idx);
    });
  });

  it("returns -1 for a phase not in the list", () => {
    expect(phaseIndex("not-a-phase" as MilestoneStage)).toBe(-1);
  });
});

describe("internalPhaseLabel", () => {
  it("gives the shop-facing label (CNC kept for the shop)", () => {
    expect(internalPhaseLabel("cnc")).toBe("CNC / Cut");
    expect(internalPhaseLabel("design")).toBe("Design");
  });
});

describe("CLIENT_PHASE_LABELS / clientPhaseLabel", () => {
  it("covers all six phases", () => {
    for (const phase of PHASE_LIST) {
      expect(CLIENT_PHASE_LABELS[phase]).toBeTruthy();
      expect(clientPhaseLabel(phase)).toBe(CLIENT_PHASE_LABELS[phase]);
    }
    expect(Object.keys(CLIENT_PHASE_LABELS)).toHaveLength(6);
  });

  it("hides the shop term 'CNC' from the client label", () => {
    expect(CLIENT_PHASE_LABELS.cnc).not.toMatch(/CNC/i);
  });
});

describe("DEFAULT_PHASE_DURATION_DAYS / defaultPhaseDurationDays", () => {
  it("covers all six phases with positive work-day defaults", () => {
    for (const phase of PHASE_LIST) {
      expect(DEFAULT_PHASE_DURATION_DAYS[phase]).toBeGreaterThan(0);
      expect(defaultPhaseDurationDays(phase)).toBe(DEFAULT_PHASE_DURATION_DAYS[phase]);
    }
    expect(Object.keys(DEFAULT_PHASE_DURATION_DAYS)).toHaveLength(6);
  });
});
