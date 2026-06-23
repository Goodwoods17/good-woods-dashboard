/**
 * TDD test: Task 4 — Thread activeBlockers into health + blocker derivation.
 * Run: npx tsx scripts/test-health-with-blockers.ts
 */
import assert from "node:assert/strict";
import { deriveHealth } from "../features/jobs/lib/health";
import { resolveBlockerTone, isSyntheticBlocker } from "../features/jobs/lib/blockers";
import type { Job, JobBlocker } from "../shared/lib/types";

// Minimal job fixture. Using a date far in the future so schedule rules
// would return "on_track" by default.
const today = new Date("2026-06-22T12:00:00Z");
const FAR_FUTURE = "2027-06-22";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-test-1",
    code: "GW-2026-TEST",
    name: "Test Kitchen",
    client: "Test Client",
    pipelineStatus: "in_design",
    healthStatus: "on_track",
    installDate: FAR_FUTURE,
    revenue: 10000,
    costs: [],
    milestones: {},
    blocker: null,
    nextStep: null,
    notes: null,
    siteAccess: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Job;
}

function makeBlocker(overrides: Partial<JobBlocker> = {}): JobBlocker {
  return {
    id: "blocker-1",
    jobId: "job-test-1",
    reason: "Waiting for hardware quote",
    waitingOnContactId: null,
    waitingOnLabel: "supplier",
    gatedPhaseId: null,
    raisedAt: "2026-06-20T10:00:00Z",
    resolvedAt: null,
    ...overrides,
  };
}

const blocker = makeBlocker();

// ── 1. completed job + active blocker → "complete" (complete wins) ──────────
{
  const job = makeJob({ pipelineStatus: "complete" });
  const result = deriveHealth(job, today, [blocker]);
  assert.equal(result, "complete", "completed job + blocker should still be complete");
  console.log("✓ completed + blocker → complete");
}

// ── 2. paused job + active blocker → "paused" (paused wins) ─────────────────
{
  const job = makeJob({ healthStatus: "paused" });
  const result = deriveHealth(job, today, [blocker]);
  assert.equal(result, "paused", "paused job + blocker should still be paused");
  console.log("✓ paused + blocker → paused");
}

// ── 3. on-track job + active blocker → "blocked" (blocker beats schedule) ───
{
  const job = makeJob();
  // Confirm the job is on_track without blockers first
  const withoutBlocker = deriveHealth(job, today, []);
  assert.equal(withoutBlocker, "on_track", "baseline: job without blocker should be on_track");
  const result = deriveHealth(job, today, [blocker]);
  assert.equal(result, "blocked", "on-track job + active blocker should become blocked");
  console.log("✓ on-track + blocker → blocked");
}

// ── 4. on-track job + [] → unchanged schedule result (regression guard) ─────
{
  const job = makeJob();
  const withEmpty = deriveHealth(job, today, []);
  const withOmitted = deriveHealth(job, today);
  assert.equal(withEmpty, "on_track", "empty activeBlockers should not change on_track result");
  assert.equal(withOmitted, "on_track", "omitted activeBlockers should not change on_track result");
  assert.equal(withEmpty, withOmitted, "empty [] and omitted should produce identical results");
  console.log("✓ on-track + [] → on_track (regression guard)");
}

// ── 5. resolveBlockerTone(job, today, [blocker]) → "blocked" ─────────────────
{
  const job = makeJob();
  const tone = resolveBlockerTone(job, today, [blocker]);
  assert.equal(tone, "blocked", "resolveBlockerTone with active blocker should return 'blocked'");
  console.log("✓ resolveBlockerTone(job, today, [blocker]) → 'blocked'");
}

// ── 6. isSyntheticBlocker(job, [blocker]) → false ────────────────────────────
{
  const job = makeJob();
  const synthetic = isSyntheticBlocker(job, [blocker]);
  assert.equal(
    synthetic,
    false,
    "isSyntheticBlocker with active external blocker should return false"
  );
  console.log("✓ isSyntheticBlocker(job, [blocker]) → false");
}

console.log("\nAll assertions passed.");
