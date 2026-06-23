/* eslint-disable no-console */
import assert from "node:assert/strict";
import type { JobBlocker } from "../shared/lib/types";
import {
  blockerAgeDays,
  partyLabel,
  headline,
  externalBlockerChip,
  phaseGatingBlocker,
} from "../features/jobs/lib/jobBlockers";

let passed = 0;
function check(l: string, f: () => void) {
  f();
  passed++;
  console.log(`  ✓ ${l}`);
}

// Fixed "now" = 2026-06-28T00:00:00.000Z so tests are deterministic
const NOW = new Date("2026-06-28T00:00:00.000Z");

// A blocker raised exactly 6 days before NOW
const b1: JobBlocker = {
  id: "b1",
  jobId: "job-1",
  reason: "Waiting on client sign-off",
  waitingOnContactId: "contact-jane",
  waitingOnLabel: null,
  gatedPhaseId: "design",
  raisedAt: "2026-06-22T00:00:00.000Z",
  resolvedAt: null,
};

// A blocker with no contactId but a label
const b2: JobBlocker = {
  id: "b2",
  jobId: "job-1",
  reason: "Waiting for hardware",
  waitingOnContactId: null,
  waitingOnLabel: "Richelieu rep",
  gatedPhaseId: "cnc",
  raisedAt: "2026-06-25T00:00:00.000Z",
  resolvedAt: null,
};

// A blocker with neither contactId nor label
const b3: JobBlocker = {
  id: "b3",
  jobId: "job-1",
  reason: "Unknown delay",
  waitingOnContactId: null,
  waitingOnLabel: null,
  gatedPhaseId: null,
  raisedAt: "2026-06-27T00:00:00.000Z",
  resolvedAt: null,
};

const contactName = (id: string) => (id === "contact-jane" ? "Jane" : undefined);

// ── blockerAgeDays ───────────────────────────────────────────────────────────
check("blockerAgeDays: raised 6 days ago → 6", () => {
  assert.equal(blockerAgeDays(b1, NOW), 6);
});

check("blockerAgeDays: raised 3 days ago → 3", () => {
  assert.equal(blockerAgeDays(b2, NOW), 3);
});

check("blockerAgeDays: raised 1 day ago → 1", () => {
  assert.equal(blockerAgeDays(b3, NOW), 1);
});

check("blockerAgeDays: future raisedAt → 0 (clamped)", () => {
  const future: JobBlocker = { ...b1, raisedAt: "2026-06-30T00:00:00.000Z" };
  assert.equal(blockerAgeDays(future, NOW), 0);
});

// ── partyLabel ───────────────────────────────────────────────────────────────
check("partyLabel: contactId resolves to name", () => {
  assert.equal(partyLabel(b1, contactName), "Jane");
});

check("partyLabel: null contactId + label → label", () => {
  assert.equal(partyLabel(b2, contactName), "Richelieu rep");
});

check("partyLabel: neither → 'someone'", () => {
  assert.equal(partyLabel(b3, contactName), "someone");
});

// ── headline ─────────────────────────────────────────────────────────────────
check("headline: returns first element of non-empty array", () => {
  assert.equal(headline([b1, b2, b3]), b1);
});

check("headline: returns null for empty array", () => {
  assert.equal(headline([]), null);
});

// ── externalBlockerChip ──────────────────────────────────────────────────────
check("externalBlockerChip: text = 'Waiting on Jane · 6d', tone = 'blocked'", () => {
  const chip = externalBlockerChip([b1, b2, b3], contactName, NOW);
  assert.deepEqual(chip, { text: "Waiting on Jane · 6d", tone: "blocked" });
});

check("externalBlockerChip: empty active → null", () => {
  assert.equal(externalBlockerChip([], contactName, NOW), null);
});

// ── phaseGatingBlocker ───────────────────────────────────────────────────────
check("phaseGatingBlocker: finds the design-gated blocker", () => {
  assert.equal(phaseGatingBlocker([b1, b2, b3], "design"), b1);
});

check("phaseGatingBlocker: returns null for install (no match)", () => {
  assert.equal(phaseGatingBlocker([b1, b2, b3], "install"), null);
});

console.log(`\n${passed} checks passed.`);
