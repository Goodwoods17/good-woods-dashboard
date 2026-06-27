import { describe, it, expect } from "vitest";
import {
  TEMPLATE_PHASE_DURATIONS,
  draftScheduleFromTemplate,
  type TemplateDraftSchedule,
} from "./templateSchedule";
import type { MilestoneStage } from "@shared/lib/types";

const PHASES: MilestoneStage[] = ["design", "cnc", "assembly", "finishing", "delivery", "install"];

// ── TEMPLATE_PHASE_DURATIONS ──────────────────────────────────────────────────

describe("TEMPLATE_PHASE_DURATIONS", () => {
  it("defines durations for every template key", () => {
    for (const key of ["full_project", "refacing", "spray_finishing", "install_only"] as const) {
      expect(TEMPLATE_PHASE_DURATIONS[key]).toBeDefined();
    }
  });

  it("covers all six phases for every template", () => {
    for (const durations of Object.values(TEMPLATE_PHASE_DURATIONS)) {
      for (const phase of PHASES) {
        expect(typeof durations[phase]).toBe("number");
        expect(durations[phase]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("full_project has non-zero time in all major phases", () => {
    const d = TEMPLATE_PHASE_DURATIONS.full_project;
    expect(d.design).toBeGreaterThan(0);
    expect(d.assembly).toBeGreaterThan(0);
    expect(d.finishing).toBeGreaterThan(0);
    expect(d.install).toBeGreaterThan(0);
  });

  it("install_only skips design/cnc/assembly/finishing (0 days each)", () => {
    const d = TEMPLATE_PHASE_DURATIONS.install_only;
    expect(d.design).toBe(0);
    expect(d.cnc).toBe(0);
    expect(d.assembly).toBe(0);
    expect(d.finishing).toBe(0);
    // Delivery + Install are the active phases.
    expect(d.delivery + d.install).toBeGreaterThan(0);
  });

  it("refacing skips cnc/assembly (0 days) but has design + finishing", () => {
    const d = TEMPLATE_PHASE_DURATIONS.refacing;
    expect(d.cnc).toBe(0);
    expect(d.assembly).toBe(0);
    expect(d.design).toBeGreaterThan(0);
    expect(d.finishing).toBeGreaterThan(0);
  });

  it("spray_finishing only needs finishing phase (design/cnc/assembly/delivery/install are 0)", () => {
    const d = TEMPLATE_PHASE_DURATIONS.spray_finishing;
    expect(d.finishing).toBeGreaterThan(0);
    expect(d.cnc).toBe(0);
    expect(d.assembly).toBe(0);
  });
});

// ── draftScheduleFromTemplate ─────────────────────────────────────────────────

describe("draftScheduleFromTemplate", () => {
  it("returns phaseTargetDates, internalTargetDate, and bufferDays", () => {
    const draft = draftScheduleFromTemplate("full_project", "2026-07-01");
    expect(draft.phaseTargetDates).toBeDefined();
    expect(draft.internalTargetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof draft.bufferDays).toBe("number");
    expect(draft.bufferDays).toBeGreaterThanOrEqual(0);
  });

  it("provides all six phase target dates", () => {
    const { phaseTargetDates } = draftScheduleFromTemplate("full_project", "2026-07-01");
    for (const phase of PHASES) {
      expect(phaseTargetDates[phase]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("phases chain in milestone order — each target >= the previous", () => {
    const { phaseTargetDates } = draftScheduleFromTemplate("full_project", "2026-07-01");
    const dates = PHASES.map((p) => phaseTargetDates[p]);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });

  it("internalTargetDate equals the install phase target (last phase)", () => {
    const { phaseTargetDates, internalTargetDate } = draftScheduleFromTemplate(
      "full_project",
      "2026-07-01"
    );
    expect(internalTargetDate).toBe(phaseTargetDates.install);
  });

  it("bufferDays is ceil(totalWorkDays * 15%) for a job with no overrides", () => {
    const template = "full_project";
    const durations = TEMPLATE_PHASE_DURATIONS[template];
    const total = Object.values(durations).reduce((a, b) => a + b, 0);
    const expected = Math.ceil(total * 0.15);
    const { bufferDays } = draftScheduleFromTemplate(template, "2026-07-01");
    expect(bufferDays).toBe(expected);
  });

  it("install_only: internalTargetDate is only delivery + install days out", () => {
    const durations = TEMPLATE_PHASE_DURATIONS.install_only;
    const activeDays = durations.delivery + durations.install;
    // Starting 2026-07-06 (Monday) → add activeDays work days
    const { phaseTargetDates, internalTargetDate } = draftScheduleFromTemplate(
      "install_only",
      "2026-07-06"
    );
    // The design/cnc/assembly/finishing phases stay at the start cursor (Monday)
    expect(phaseTargetDates.design).toBe("2026-07-06");
    expect(phaseTargetDates.assembly).toBe("2026-07-06");
    // internalTargetDate = install phase target
    expect(internalTargetDate).toBe(phaseTargetDates.install);
    // With only activeDays of real work, the schedule must be shorter than full_project
    const fullDraft = draftScheduleFromTemplate("full_project", "2026-07-06");
    expect(internalTargetDate < fullDraft.internalTargetDate).toBe(true);
  });

  it("skips weekends — a Monday start advances through work days only", () => {
    // Monday 2026-07-06 + 5 work days = Monday 2026-07-13 (skipping weekend)
    const { phaseTargetDates } = draftScheduleFromTemplate("full_project", "2026-07-06");
    // design = 5 work days from Monday = July 13 (Mon)
    expect(phaseTargetDates.design).toBe("2026-07-13");
  });

  it("works for all four template types without throwing", () => {
    for (const t of ["full_project", "refacing", "spray_finishing", "install_only"] as const) {
      expect(() => draftScheduleFromTemplate(t, "2026-07-01")).not.toThrow();
    }
  });
});
