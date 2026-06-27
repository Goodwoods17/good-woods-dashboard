import { describe, it, expect } from "vitest";
import { buildHitlist } from "./blockers";
import type { Job } from "@shared/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJob(overrides: { id: string } & Partial<Job>): Job {
  return {
    code: `GW-2026-${overrides.id.slice(0, 6)}`,
    name: "Test Job",
    client: "Test Client",
    address: "123 Test St",
    template: "full_project",
    pipelineStatus: "in_production",
    healthStatus: "on_track",
    currentMilestone: "assembly",
    installDate: "2026-12-31",
    revenue: 10000,
    costs: [],
    invoice: {
      number: "INV-001",
      issuedDate: "2026-01-01",
      dueDate: "2026-01-31",
      lineItems: [],
    },
    ...overrides,
  };
}

// Noon UTC on a weekday → deterministic ISO date regardless of test runner timezone.
const TODAY = new Date("2026-06-27T12:00:00.000Z"); // Friday

// ─── S8 — buffer-aware hitlist sorting ───────────────────────────────────────

describe("buildHitlist — buffer-aware sorting (S8)", () => {
  it("jobs without scheduling data have no feverZone", () => {
    const job = makeJob({ id: "no-sched" });
    const [entry] = buildHitlist([job], TODAY);
    expect(entry.feverZone).toBeUndefined();
  });

  it("job with future internal target date has green fever zone (no buffer consumed)", () => {
    const job = makeJob({
      id: "green-job",
      currentMilestone: "cnc",
      internalTargetDate: "2026-12-01",
      installDate: "2026-12-31",
    });
    const [entry] = buildHitlist([job], TODAY);
    expect(entry.feverZone).toBe("green");
  });

  it("job with heavily past internal target is red (buffer consumed faster than progress)", () => {
    // internal target = Jan 2026 (months ago), only cnc phase (index 1) reached.
    // Buffer consumed ≈ 50% of pool while chain is only ~17% done → well into red.
    const job = makeJob({
      id: "red-job",
      currentMilestone: "cnc",
      internalTargetDate: "2026-01-01",
      installDate: "2026-12-31",
    });
    const [entry] = buildHitlist([job], TODAY);
    expect(entry.feverZone).toBe("red");
  });

  it("job with slightly past internal target has yellow fever zone", () => {
    // internal target = June 10 (17 calendar days ago ≈ 12 work days).
    // Buffer pool = Jun 10 → Dec 31 ≈ 143 work days.
    // Buffer consumed % ≈ 12/143 ≈ 8.4%.
    // Chain pct = 1/6 × 100 = 16.7% (currentMilestone = cnc, index 1).
    // Green boundary = 16.7 × (1/3) = 5.6; yellow/red = 16.7 × (2/3) = 11.1.
    // 8.4 > 5.6 and 8.4 < 11.1 → YELLOW.
    const job = makeJob({
      id: "yellow-job",
      currentMilestone: "cnc",
      internalTargetDate: "2026-06-10",
      installDate: "2026-12-31",
    });
    const [entry] = buildHitlist([job], TODAY);
    expect(entry.feverZone).toBe("yellow");
  });

  it("a RED fever job floats above an on_track job without scheduling data when install dates are equal", () => {
    const normalJob = makeJob({ id: "normal", installDate: "2026-12-31" });
    const redFeverJob = makeJob({
      id: "red-fever",
      currentMilestone: "cnc",
      internalTargetDate: "2026-01-01",
      installDate: "2026-12-31",
    });
    const entries = buildHitlist([normalJob, redFeverJob], TODAY);
    const redIndex = entries.findIndex((e) => e.job.id === "red-fever");
    const normalIndex = entries.findIndex((e) => e.job.id === "normal");
    expect(redIndex).toBeLessThan(normalIndex);
  });

  it("a YELLOW fever job floats above a GREEN fever job with the same install date", () => {
    const greenJob = makeJob({
      id: "green-sched",
      currentMilestone: "cnc",
      internalTargetDate: "2026-12-01", // future → 0 buffer consumed
      installDate: "2026-12-31",
    });
    const yellowJob = makeJob({
      id: "yellow-sched",
      currentMilestone: "cnc",
      internalTargetDate: "2026-06-10", // slightly past → yellow
      installDate: "2026-12-31",
    });
    const entries = buildHitlist([greenJob, yellowJob], TODAY);
    const yellowIndex = entries.findIndex((e) => e.job.id === "yellow-sched");
    const greenIndex = entries.findIndex((e) => e.job.id === "green-sched");
    expect(yellowIndex).toBeLessThan(greenIndex);
  });

  it("complete jobs are excluded regardless of fever zone", () => {
    const completeJob = makeJob({
      id: "complete",
      pipelineStatus: "complete",
      internalTargetDate: "2026-01-01",
      installDate: "2026-12-31",
    });
    const entries = buildHitlist([completeJob], TODAY);
    expect(entries).toHaveLength(0);
  });

  it("an already-blocked job (active external blocker) stays above a RED fever job", () => {
    // Blocked job has health=blocked (priority 0); RED fever job floats up but
    // should not surpass a real blocker.
    const blockedJob = makeJob({ id: "blocked-job", installDate: "2026-12-31" });
    const redFeverJob = makeJob({
      id: "red-fever-2",
      currentMilestone: "cnc",
      internalTargetDate: "2026-01-01",
      installDate: "2026-12-31",
    });
    // Provide an active blocker for the first job.
    const activeByJob = new Map([
      [
        "blocked-job",
        [
          {
            id: "blocker-1",
            jobId: "blocked-job",
            reason: "Waiting on materials",
            waitingOnContactId: null,
            waitingOnLabel: null,
            gatedPhaseId: null,
            raisedAt: "2026-06-01T09:00:00.000Z",
            resolvedAt: null,
          },
        ],
      ],
    ]);
    const entries = buildHitlist([redFeverJob, blockedJob], TODAY, activeByJob);
    const blockedIndex = entries.findIndex((e) => e.job.id === "blocked-job");
    const redIndex = entries.findIndex((e) => e.job.id === "red-fever-2");
    expect(blockedIndex).toBeLessThan(redIndex);
  });
});
