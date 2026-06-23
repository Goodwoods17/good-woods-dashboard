/* eslint-disable no-console */
import assert from "node:assert/strict";
import { rowToCard, cardToRow } from "../features/shop/lib/workCardsStore";

let passed = 0;
function check(label: string, fn: () => void) { fn(); passed++; console.log(`  ✓ ${label}`); }

console.log("work cards row mapping");

check("rowToCard maps snake_case → camelCase with null-safety", () => {
  const c = rowToCard({
    id: "k1", job_id: "j1", phase_id: "assembly", operation_id: "op1",
    description: "Assemble base ×13", target_quantity: "13", assignee_id: null,
    status: "todo", stuck_reason: null, source: "budget", sort: 0,
  });
  assert.equal(c.jobId, "j1");
  assert.equal(c.phaseId, "assembly");
  assert.equal(c.operationId, "op1");
  assert.equal(c.targetQuantity, 13); // numeric strings coerced
  assert.equal(c.assigneeId, null);
  assert.equal(c.status, "todo");
  assert.equal(c.source, "budget");
});

check("cardToRow round-trips (camelCase → snake_case)", () => {
  const row = cardToRow({
    id: "k1", jobId: "j1", phaseId: "assembly", operationId: null,
    description: "Site cleanup", targetQuantity: null, assigneeId: null,
    status: "todo", stuckReason: null, source: "manual", sort: 2,
  });
  assert.equal(row.job_id, "j1");
  assert.equal(row.operation_id, null);
  assert.equal(row.source, "manual");
  assert.equal(row.sort, 2);
});

console.log(`\n${passed} checks passed.`);
