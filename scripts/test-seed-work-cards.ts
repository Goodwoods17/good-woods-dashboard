/* eslint-disable no-console */
import assert from "node:assert/strict";
import { workCardRowsFromBudget } from "../features/job-costing/lib/seedWorkCards";
import { deriveCostCodeBudget, FULL_BUILD_CODE_SET } from "../features/job-costing/lib/budget";
import { registryFromDefs, CANONICAL_COST_CODES } from "../features/job-costing/lib/costCodes";
import { emptyCabinetSummary, DEFAULT_LABOUR_RATES } from "../features/estimator/lib/types";

let passed = 0;
function check(label: string, fn: () => void) { fn(); passed++; console.log(`  ✓ ${label}`); }

const cab = emptyCabinetSummary();
cab.base = { count: 13, linearFt: 0 };
const REG = registryFromDefs(CANONICAL_COST_CODES);
const budget = deriveCostCodeBudget(FULL_BUILD_CODE_SET, cab, DEFAULT_LABOUR_RATES, REG);
const codeToId = new Map(CANONICAL_COST_CODES.map((c) => [c.code, `id-${c.code}`]));
const rows = workCardRowsFromBudget("job1", budget, codeToId);

check("one card row per code that carries time/quantity, source=budget, status=todo", () => {
  const asmBase = rows.find((r) => r.operation_id === "id-ASM-BASE");
  assert.ok(asmBase, "ASM-BASE card created");
  assert.equal(asmBase!.job_id, "job1");
  assert.equal(asmBase!.phase_id, "assembly");
  assert.equal(asmBase!.target_quantity, 13);
  assert.equal(asmBase!.status, "todo");
  assert.equal(asmBase!.source, "budget");
  assert.ok(String(asmBase!.description).length > 0);
});

check("zero-quantity / zero-amount codes are skipped (no empty cards)", () => {
  // ASM-ISLAND has 0 cabinets here → no card
  assert.equal(rows.find((r) => r.operation_id === "id-ASM-ISLAND"), undefined);
});

console.log(`\n${passed} checks passed.`);
