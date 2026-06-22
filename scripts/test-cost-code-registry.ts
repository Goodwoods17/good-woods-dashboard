/* eslint-disable no-console */
import assert from "node:assert/strict";
import {
  buildCostCodeRegistry,
  registryFromDefs,
  CANONICAL_COST_CODES,
  TOTAL_CABINET_COUNT_CODES,
} from "../features/job-costing/lib/costCodes";

let passed = 0;
function check(label: string, fn: () => void) { fn(); passed++; console.log(`  ✓ ${label}`); }

console.log("cost-code registry");

check("buildCostCodeRegistry maps operations with a code + valid phase", () => {
  const reg = buildCostCodeRegistry([
    { id: "1", name: "Assemble base cabinet", categoryId: "assembly", cabinetType: "base", defaultMinutes: 60, code: "ASM-BASE", driverUnit: "ea", active: true } as any,
    { id: "2", name: "Sand", categoryId: "assembly", cabinetType: null, defaultMinutes: 10, code: null, driverUnit: null, active: true } as any, // no code -> skipped
    { id: "3", name: "Mystery", categoryId: "nope", cabinetType: null, defaultMinutes: 5, code: "MYS", driverUnit: null, active: true } as any, // bad phase -> skipped
  ]);
  assert.equal(reg.size, 1);
  const d = reg.get("ASM-BASE")!;
  assert.equal(d.phaseId, "assembly");
  assert.equal(d.cabinetType, "base");
  assert.equal(d.driver, "ea");
  assert.equal(d.defaultMinutes, 60);
});

check("registryFromDefs round-trips the canonical seed set", () => {
  const reg = registryFromDefs(CANONICAL_COST_CODES);
  assert.equal(reg.size, CANONICAL_COST_CODES.length);
  assert.ok(reg.has("CUT-SHEET"));
});

check("DEL-LOAD is the documented total-cabinet-count code", () => {
  assert.ok(TOTAL_CABINET_COUNT_CODES.has("DEL-LOAD"));
});

check("soft-deleted (inactive) operations are excluded from the registry", () => {
  const reg = buildCostCodeRegistry([
    { id: "1", name: "Live", categoryId: "assembly", cabinetType: null, defaultMinutes: 10, code: "LIVE-1", driverUnit: null, active: true } as any,
    { id: "2", name: "Retired", categoryId: "assembly", cabinetType: null, defaultMinutes: 10, code: "DEAD-1", driverUnit: null, active: false } as any,
  ]);
  assert.equal(reg.has("LIVE-1"), true);
  assert.equal(reg.has("DEAD-1"), false);
});

console.log(`\n${passed} checks passed.`);
