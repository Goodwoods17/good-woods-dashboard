/* eslint-disable no-console */
// Parser test for the Mozaik CSV import (ADR 0012 Slice 2), run against the
// co-designed fixture. Run: npx tsx scripts/test-mozaik-import.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseMozaikCsv,
  parseCsvLine,
  mozaikToEstimateDraft,
} from "../features/estimator/lib/mozaikImport";
import {
  deriveCostCodeBudget,
  derivePerRoomBudgets,
  FULL_BUILD_CODE_SET,
} from "../features/job-costing/lib/budget";
import { DEFAULT_LABOUR_RATES } from "../features/estimator/lib/types";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}
function near(a: number, b: number, eps = 0.01) {
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);
}

console.log("Mozaik CSV parser");

// ── CSV line parsing edge cases ──
check("parseCsvLine keeps a bare inch-quote literal (3/4\")", () => {
  assert.deepEqual(parseCsvLine('3/4" Rift Sawn White Oak MDF Core,1,#,,'), [
    '3/4" Rift Sawn White Oak MDF Core',
    "1",
    "#",
    "",
    "",
  ]);
});
check("parseCsvLine handles real Mozaik quoting with a comma inside", () => {
  assert.deepEqual(parseCsvLine('"Kitchen","","","","9,070.42"'), [
    "Kitchen",
    "",
    "",
    "",
    "9,070.42",
  ]);
});
check("parseCsvLine unescapes doubled quotes in a quoted field", () => {
  assert.deepEqual(parseCsvLine('"3/4"" Ply","19","#"'), ['3/4" Ply', "19", "#"]);
});

const csv = readFileSync(
  resolve(process.cwd(), "docs/samples/mozaik-import-target-sample.csv"),
  "utf8",
);
const parsed = parseMozaikCsv(csv);
const byRoom = Object.fromEntries(parsed.rooms.map((r) => [r.name, r]));

check("parses 3 expanded rooms, no collapse warnings", () => {
  assert.equal(parsed.rooms.length, 3);
  assert.deepEqual(
    parsed.rooms.map((r) => r.name),
    ["Kitchen", "Ensuite Vanity", "Linen Closet"],
  );
  assert.equal(parsed.warnings.length, 0);
});

check("Kitchen cabinets carry BOTH count and linear ft per type", () => {
  const k = byRoom["Kitchen"];
  assert.equal(k.cabinets.base.count, 13);
  near(k.cabinets.base.linearFt, 69.14);
  assert.equal(k.cabinets.wall.count, 3);
  near(k.cabinets.wall.linearFt, 46.5);
  assert.equal(k.cabinets.tall.count, 6);
  near(k.cabinets.tall.linearFt, 16.25);
});

check("Kitchen metrics: finishing, cut, doors, appliances, counters", () => {
  const m = byRoom["Kitchen"].metrics;
  near(m.finishedAreaSqft!, 25.55);
  near(m.toeSkinFt!, 31.33);
  assert.equal(m.sheets, 20);
  assert.equal(m.parts, 137);
  assert.equal(m.baseDoors, 12);
  assert.equal(m.wallDoors, 5);
  assert.equal(m.appliances, 2);
  assert.equal(m.pulls, 35);
  assert.equal(m.rolloutShelves, 4);
  near(m.countertopSqft!, 94.07);
  assert.equal(m.counterJoints, 2);
  assert.equal(m.counterCutouts, 1);
  near(m.moldingFt!, 18.5);
  assert.equal(m.weightLb, 640);
  near(m.storageCft!, 241.27);
});

check("Kitchen BOM captures materials/hardware/buyout/inserts (not keyed rows)", () => {
  const names = byRoom["Kitchen"].bom.map((b) => b.name);
  for (const n of [
    "5/8 Plywood Birch Prefinished",
    "Edgebanding - White Oak",
    "Blum Movento",
    "Richelieu Leg",
    "MDF Flat Panel Door",
    "Appliance Panel",
    "Dovetail Drawer Box",
    "Garbage Pullout",
    "Bottle Pullout",
  ]) {
    assert.ok(names.includes(n), `BOM should include "${n}"`);
  }
  // The doors row appears twice (count + sqft) — both kept.
  const doorRows = byRoom["Kitchen"].bom.filter((b) => b.name === "MDF Flat Panel Door");
  assert.equal(doorRows.length, 2);
  // Keyed metric rows must NOT leak into the BOM.
  assert.ok(!names.includes("# Sheets"));
  assert.ok(!names.includes("Finished Area"));
});

check("Linen Closet: tall cabinets + closet rod", () => {
  const c = byRoom["Linen Closet"];
  assert.equal(c.cabinets.tall.count, 2);
  near(c.cabinets.tall.linearFt, 8.0);
  assert.equal(c.metrics.closetRods, 1);
  assert.ok(c.bom.some((b) => b.name === "Closet Rod - Round"));
});

// ── Mapping to the estimator draft ──
const draft = mozaikToEstimateDraft(parsed);

check("draft rolls cabinet counts to the job total across rooms", () => {
  assert.equal(draft.cabinetSummary.base.count, 16); // 13 + 3
  assert.equal(draft.cabinetSummary.wall.count, 3);
  assert.equal(draft.cabinetSummary.tall.count, 8); // 6 + 2
});

check("draft maps finishing sqft + sheets to cost-code quantities", () => {
  near(draft.qtyByCode["FIN-SPRAY"], 25.55 + 9.2 + 6.4); // 41.15
  assert.equal(draft.qtyByCode["CUT-SHEET"], 26); // 20 + 4 + 2
});

check("draft merges identical BOM lines across rooms", () => {
  const ply = draft.bom.find(
    (b) => b.name === "5/8 Plywood Birch Prefinished" && b.unit === "#",
  );
  assert.equal(ply!.qty, 24); // 19 + 3 + 2
  const doorCount = draft.bom.find((b) => b.name === "MDF Flat Panel Door" && b.unit === "#");
  assert.equal(doorCount!.qty, 22); // 17 + 5
  const doorSqft = draft.bom.find((b) => b.name === "MDF Flat Panel Door" && b.unit === "SqFt");
  near(doorSqft!.qty, 55.1); // 42.7 + 12.4
});

// ── Per-room budget split ──
check("draft carries a per-room breakdown (3 rooms)", () => {
  assert.equal(draft.perRoom.length, 3);
  const kitchen = draft.perRoom.find((r) => r.name === "Kitchen")!;
  assert.equal(kitchen.cabinetSummary.base.count, 13);
  assert.equal(kitchen.qtyByCode["CUT-SHEET"], 20);
});

check("Σ(per-room budgets) reconciles to the job-level budget", () => {
  const jobLevel = deriveCostCodeBudget(
    FULL_BUILD_CODE_SET,
    draft.cabinetSummary,
    DEFAULT_LABOUR_RATES,
    { qtyByCode: draft.qtyByCode },
  );
  const perRoom = derivePerRoomBudgets(
    draft.perRoom.map((r) => ({ name: r.name, cabinets: r.cabinetSummary, qtyByCode: r.qtyByCode })),
    FULL_BUILD_CODE_SET,
    DEFAULT_LABOUR_RATES,
  );
  const sum = perRoom.reduce((s, r) => s + r.budget.totalAmount, 0);
  near(sum, jobLevel.totalAmount, 0.05);
  // Linen Closet should carry only tall assembly/install (+ finishing/cut).
  const closet = perRoom.find((r) => r.roomLabel === "Linen Closet")!;
  assert.ok(closet.budget.totalAmount > 0);
  assert.equal(
    closet.budget.rows.find((r) => r.code === "ASM-BASE")?.quantity ?? 0,
    0,
  );
});

check("a collapsed room (total only, no detail) raises a warning", () => {
  const collapsed = parseMozaikCsv(
    'Description,QTY,Units,Amount,Total\n"Kitchen","","","","9070"\n"Garage","","","","500"\nBase Cabinets,2,#,,\n',
  );
  // Kitchen has no detail lines → warned; Garage has a cabinet → fine.
  assert.ok(collapsed.warnings.some((w) => w.includes("Kitchen")));
  assert.ok(!collapsed.warnings.some((w) => w.includes("Garage")));
});

console.log(`\n${passed} checks passed.`);
