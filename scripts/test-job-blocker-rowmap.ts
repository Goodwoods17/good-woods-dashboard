/* eslint-disable no-console */
import assert from "node:assert/strict";
import { rowToBlocker, blockerToRow } from "../features/jobs/lib/jobBlockerRowMap";

let passed = 0;
function check(l: string, f: () => void) { f(); passed++; console.log(`  ✓ ${l}`); }

const row = {
  id: "b1", job_id: "4", reason: "client sign-off",
  waiting_on_contact_id: null, waiting_on_label: "Richelieu rep",
  gated_phase_id: "design", raised_at: "2026-06-20T00:00:00.000Z", resolved_at: null,
};
check("rowToBlocker maps snake→camel incl nulls", () => {
  const b = rowToBlocker(row);
  assert.equal(b.jobId, "4");
  assert.equal(b.waitingOnContactId, null);
  assert.equal(b.waitingOnLabel, "Richelieu rep");
  assert.equal(b.gatedPhaseId, "design");
  assert.equal(b.resolvedAt, null);
});
check("blockerToRow round-trips back to snake", () => {
  const r = blockerToRow(rowToBlocker(row));
  assert.equal(r.job_id, "4");
  assert.equal(r.gated_phase_id, "design");
  assert.equal(r.waiting_on_label, "Richelieu rep");
});
console.log(`\n${passed} checks passed.`);
