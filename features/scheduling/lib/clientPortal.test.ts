import { describe, it, expect } from "vitest";
import {
  clientScheduleStatus,
  clientPercentDone,
  clientNextStepLabel,
  businessWeekWindow,
  buildClientScheduleView,
  clientNextMilestoneNudge,
  buildClientActionItems,
  CLIENT_STATUS_LABELS,
  type ClientScheduleInput,
} from "./clientPortal";
import { CLIENT_PHASE_LABELS } from "./phases";

describe("clientScheduleStatus", () => {
  it("is on_track when the live committed date matches the snapshot", () => {
    expect(clientScheduleStatus("2026-12-01", "2026-12-01")).toBe("on_track");
  });

  it("flips to date_updated only when the committed date actually moves", () => {
    expect(clientScheduleStatus("2026-12-08", "2026-12-01")).toBe("date_updated");
    // Moving earlier still counts as a change the client should see.
    expect(clientScheduleStatus("2026-11-24", "2026-12-01")).toBe("date_updated");
  });
});

describe("clientPercentDone", () => {
  it("maps the milestone pointer to completed-phase progress", () => {
    expect(clientPercentDone("design")).toBe(0);
    expect(clientPercentDone("cnc")).toBe(17);
    expect(clientPercentDone("assembly")).toBe(33);
    expect(clientPercentDone("finishing")).toBe(50);
    expect(clientPercentDone("delivery")).toBe(67);
    expect(clientPercentDone("install")).toBe(83);
  });
});

describe("clientNextStepLabel", () => {
  it("names the next upcoming phase in client-friendly language", () => {
    expect(clientNextStepLabel("cnc")).toBe(CLIENT_PHASE_LABELS.assembly);
    expect(clientNextStepLabel("design")).toBe(CLIENT_PHASE_LABELS.cnc);
  });

  it("calls install the final step when already at install", () => {
    expect(clientNextStepLabel("install")).toMatch(/install/i);
  });

  it("never leaks the CNC shop term to the client", () => {
    expect(clientNextStepLabel("design")).not.toMatch(/cnc/i);
  });
});

describe("businessWeekWindow", () => {
  it("returns the Mon–Fri window containing a mid-week target (fuzzes the exact day)", () => {
    // 2026-07-08 is a Wednesday.
    expect(businessWeekWindow("2026-07-08")).toEqual({ start: "2026-07-06", end: "2026-07-10" });
  });

  it("anchors a Monday target to its own week", () => {
    expect(businessWeekWindow("2026-07-06")).toEqual({ start: "2026-07-06", end: "2026-07-10" });
  });

  it("anchors a weekend target back to the preceding Monday", () => {
    // 2026-07-12 is a Sunday → week of Mon 2026-07-06.
    expect(businessWeekWindow("2026-07-12")).toEqual({ start: "2026-07-06", end: "2026-07-10" });
  });
});

const BASE_INPUT: ClientScheduleInput = {
  currentMilestone: "assembly",
  installDate: "2026-12-01",
  committedDateSnapshot: "2026-12-01",
  phaseTargetDates: {
    design: "2026-09-02",
    cnc: "2026-10-07",
    assembly: "2026-11-04",
    finishing: "2026-11-18",
  },
};

describe("clientNextMilestoneNudge", () => {
  it("returns the next upcoming phase with its week window when a target exists", () => {
    const nudge = clientNextMilestoneNudge("assembly", {
      design: "2026-09-02",
      cnc: "2026-10-07",
      assembly: "2026-11-04",
      finishing: "2026-11-18",
    });
    expect(nudge).not.toBeNull();
    expect(nudge!.label).toBe(CLIENT_PHASE_LABELS.finishing);
    // 2026-11-18 is a Wednesday → week Mon 16 – Fri 20.
    expect(nudge!.window).toEqual({ start: "2026-11-16", end: "2026-11-20" });
  });

  it("returns null window when the next phase has no internal target", () => {
    const nudge = clientNextMilestoneNudge("assembly", { design: "2026-09-02" });
    expect(nudge).not.toBeNull();
    expect(nudge!.label).toBe(CLIENT_PHASE_LABELS.finishing);
    expect(nudge!.window).toBeNull();
  });

  it("returns null at the install phase (no next milestone)", () => {
    const nudge = clientNextMilestoneNudge("install", {});
    expect(nudge).toBeNull();
  });

  it("never leaks the CNC shop term in the nudge label", () => {
    const nudge = clientNextMilestoneNudge("design", {});
    expect(nudge).not.toBeNull();
    expect(nudge!.label).not.toMatch(/cnc/i);
  });
});

describe("buildClientActionItems", () => {
  it("returns empty when there is no blocker", () => {
    expect(buildClientActionItems(null)).toHaveLength(0);
    expect(buildClientActionItems(undefined)).toHaveLength(0);
    expect(buildClientActionItems("")).toHaveLength(0);
    expect(buildClientActionItems("   ")).toHaveLength(0);
  });

  it("surfaces the blocker text as a client action item", () => {
    const items = buildClientActionItems("We need your handle selection by Friday.");
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("We need your handle selection by Friday.");
  });

  it("trims whitespace from the blocker text", () => {
    const items = buildClientActionItems("  Make a selection  ");
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("Make a selection");
  });
});

describe("buildClientScheduleView", () => {
  it("computes status, percent, current + next labels", () => {
    const view = buildClientScheduleView(BASE_INPUT);
    expect(view.status).toBe("on_track");
    expect(view.statusLabel).toBe(CLIENT_STATUS_LABELS.on_track);
    expect(view.percentDone).toBe(33);
    expect(view.currentLabel).toBe(CLIENT_PHASE_LABELS.assembly);
    expect(view.nextStepLabel).toBe(CLIENT_PHASE_LABELS.finishing);
    expect(view.committedInstall).toBe("2026-12-01");
  });

  it("marks earlier phases done, the current phase current, later phases upcoming", () => {
    const view = buildClientScheduleView(BASE_INPUT);
    const byPhase = Object.fromEntries(view.phases.map((p) => [p.phase, p]));
    expect(byPhase.design.state).toBe("done");
    expect(byPhase.cnc.state).toBe("done");
    expect(byPhase.assembly.state).toBe("current");
    expect(byPhase.finishing.state).toBe("upcoming");
    expect(byPhase.install.state).toBe("upcoming");
  });

  it("shows the install day FIRM (exact committed date), never a range", () => {
    const view = buildClientScheduleView(BASE_INPUT);
    const install = view.phases.find((p) => p.phase === "install")!;
    expect(install.display).toEqual({ kind: "firm", date: "2026-12-01" });
  });

  it("shows mid-phases as a RANGE (week window), never the precise internal target", () => {
    const view = buildClientScheduleView(BASE_INPUT);
    const finishing = view.phases.find((p) => p.phase === "finishing")!;
    // 2026-11-18 is a Wednesday → week Mon 16 – Fri 20.
    expect(finishing.display).toEqual({ kind: "range", start: "2026-11-16", end: "2026-11-20" });
  });

  it("never exposes the raw internal target date verbatim on an upcoming mid-phase", () => {
    const view = buildClientScheduleView(BASE_INPUT);
    const finishing = view.phases.find((p) => p.phase === "finishing")!;
    if (finishing.display.kind === "range") {
      // The raw internal target (2026-11-18) must not appear as either bound.
      expect(finishing.display.start).not.toBe("2026-11-18");
      expect(finishing.display.end).not.toBe("2026-11-18");
    }
  });

  it("marks an upcoming mid-phase with no target as to-be-scheduled (no leaked date)", () => {
    const view = buildClientScheduleView({
      ...BASE_INPUT,
      phaseTargetDates: { assembly: "2026-11-04" },
    });
    const delivery = view.phases.find((p) => p.phase === "delivery")!;
    expect(delivery.display).toEqual({ kind: "tbd" });
  });

  it("reports date_updated when the live install date diverges from the snapshot", () => {
    const view = buildClientScheduleView({ ...BASE_INPUT, installDate: "2026-12-08" });
    expect(view.status).toBe("date_updated");
    expect(view.statusLabel).toBe(CLIENT_STATUS_LABELS.date_updated);
    // The firm date shown is always the LIVE committed date (the honest promise).
    expect(view.committedInstall).toBe("2026-12-08");
    const install = view.phases.find((p) => p.phase === "install")!;
    expect(install.display).toEqual({ kind: "firm", date: "2026-12-08" });
  });

  // ─── S19 nudge fields ───────────────────────────────────────────────────────

  it("includes a nextMilestoneNudge for the next upcoming phase", () => {
    const view = buildClientScheduleView(BASE_INPUT);
    // BASE_INPUT: currentMilestone=assembly → next=finishing (has a target)
    expect(view.nextMilestoneNudge).not.toBeNull();
    expect(view.nextMilestoneNudge!.label).toBe(CLIENT_PHASE_LABELS.finishing);
    // 2026-11-18 is a Wednesday → week Mon 16 – Fri 20.
    expect(view.nextMilestoneNudge!.window).toEqual({ start: "2026-11-16", end: "2026-11-20" });
  });

  it("nextMilestoneNudge is null at the install phase (nothing further)", () => {
    const view = buildClientScheduleView({ ...BASE_INPUT, currentMilestone: "install" });
    expect(view.nextMilestoneNudge).toBeNull();
  });

  it("surfaces a blocker as a client action item", () => {
    const view = buildClientScheduleView({
      ...BASE_INPUT,
      blocker: "We need your handle selection by Friday.",
    });
    expect(view.clientActions).toHaveLength(1);
    expect(view.clientActions[0].text).toBe("We need your handle selection by Friday.");
  });

  it("has no client actions when there is no blocker", () => {
    const view = buildClientScheduleView(BASE_INPUT);
    expect(view.clientActions).toHaveLength(0);
  });
});
