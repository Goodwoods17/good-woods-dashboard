import { describe, it, expect } from "vitest";
import { createJobFromEstimate } from "./createJobFromEstimate";
import { computeTotals } from "./totals";
import { emptyCabinetSummary } from "./types";

// Regression guard for the confirmed prod bug (2026-06-30): jobs.payer_id is
// NOT NULL (FK -> contacts ON DELETE RESTRICT), but the estimator save path
// never set a payer, so "Save as Job" would 500 on first real use. The payer
// the user picks must be threaded onto the saved Job.
describe("createJobFromEstimate", () => {
  function baseInput() {
    return {
      client: "SayWell Developments",
      project: "Suite 305 kitchen",
      lines: [],
      overheadPct: 0,
      totals: computeTotals([], { overheadPct: 0 }),
      existingJobs: [],
      cabinetSummary: emptyCabinetSummary(),
    };
  }

  it("threads the selected payer contact onto the saved job", () => {
    const job = createJobFromEstimate({
      ...baseInput(),
      payerId: "contact-abc-123",
    });
    expect(job.payerId).toBe("contact-abc-123");
  });
});
