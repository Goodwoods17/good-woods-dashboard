/* eslint-disable no-console */
import assert from "node:assert/strict";
import { buildTimeCards } from "../features/labour/lib/timeCards";

let passed = 0;
function check(l: string, f: () => void) { f(); passed++; console.log(`  ✓ ${l}`); }

// Two completed sessions same worker same day (3600000ms + 1800000ms) + one running (excluded).
const sessions: any[] = [
  { id: "s1", workerId: "w1", jobId: "j1", operationId: "o1", startedAt: "2026-06-20T09:00:00.000Z", endedAt: "2026-06-20T10:00:00.000Z", accumulatedMs: 3600000, resumedAt: null, targetQuantity: null, quantity: null, categoryId: null, cardId: null, note: null },
  { id: "s2", workerId: "w1", jobId: "j2", operationId: "o2", startedAt: "2026-06-20T11:00:00.000Z", endedAt: "2026-06-20T11:30:00.000Z", accumulatedMs: 1800000, resumedAt: null, targetQuantity: null, quantity: null, categoryId: null, cardId: null, note: null },
  { id: "s3", workerId: "w1", jobId: "j1", operationId: "o1", startedAt: "2026-06-21T09:00:00.000Z", endedAt: null, accumulatedMs: 0, resumedAt: "2026-06-21T09:00:00.000Z", targetQuantity: null, quantity: null, categoryId: null, cardId: null, note: null },
];

const { byWorkerDay, byJobDay } = buildTimeCards(sessions);

check("groups completed sessions by (worker, day); excludes running", () => {
  assert.equal(byWorkerDay.length, 1); // s3 running → excluded; s1+s2 same worker+day
  assert.equal(byWorkerDay[0].entries.length, 2);
  assert.equal(byWorkerDay[0].totalMs, 5400000); // 1h + 0.5h
  assert.equal(byWorkerDay[0].date, "2026-06-20");
});

check("per-project rollup splits the same day by job", () => {
  const j1 = byJobDay.find((p) => p.jobId === "j1" && p.date === "2026-06-20");
  const j2 = byJobDay.find((p) => p.jobId === "j2" && p.date === "2026-06-20");
  assert.equal(j1!.totalMs, 3600000);
  assert.equal(j2!.totalMs, 1800000);
});

console.log(`\n${passed} checks passed.`);
