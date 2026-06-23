/* eslint-disable no-console */
// Catalog-matching test for the Mozaik BOM (ADR 0012 Slice 2 follow-on).
// Run: npx tsx scripts/test-bom-catalog-match.ts

import assert from "node:assert/strict";
import {
  matchBomToCatalog,
  nameSimilarity,
  type CatalogLite,
} from "../features/estimator/lib/bomCatalogMatch";
import type { MozaikBomLine } from "../features/estimator/lib/mozaikImport";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log("BOM ↔ catalog matching");

const catalog: CatalogLite[] = [
  { id: "c1", name: "Plywood Birch Prefinished - Import", unit: "ea", unitPrice: 68.43, supplier: "Windsor" },
  { id: "c2", name: "Blum Movento", unit: "ea", unitPrice: 22, supplier: "Richelieu" },
  { id: "c3", name: "Richelieu Leg", unit: "ea", unitPrice: 5.75, supplier: "Richelieu" },
  { id: "c4", name: "White Oak Edgebanding", unit: "lf", unitPrice: 0.9 },
  { id: "c5", name: "Maple Shaker Door", unit: "sqft", unitPrice: 18 },
];

const bom: MozaikBomLine[] = [
  { name: "5/8 Plywood Birch Prefinished", qty: 19, unit: "#" },
  { name: "Blum Movento", qty: 23, unit: "#" },
  { name: "Edgebanding - White Oak", qty: 250, unit: "Ft" },
  { name: "Garbage Pullout", qty: 1, unit: "#" },
];

const matches = matchBomToCatalog(bom, catalog);
const byName = Object.fromEntries(matches.map((m) => [m.line.name, m]));

check("exact name → exact match", () => {
  const m = byName["Blum Movento"];
  assert.equal(m.confidence, "exact");
  assert.equal(m.match!.id, "c2");
  assert.equal(m.match!.unitPrice, 22);
});

check("token-overlap → fuzzy match (5/8 Plywood Birch Prefinished)", () => {
  const m = byName["5/8 Plywood Birch Prefinished"];
  assert.equal(m.confidence, "fuzzy");
  assert.equal(m.match!.id, "c1");
  assert.ok(m.score >= 0.5);
});

check("reordered words still match (Edgebanding - White Oak ↔ White Oak Edgebanding)", () => {
  const m = byName["Edgebanding - White Oak"];
  assert.equal(m.match!.id, "c4");
  assert.ok(m.confidence !== "none");
});

check("no plausible catalog item → unmatched (null, $0 downstream)", () => {
  const m = byName["Garbage Pullout"];
  assert.equal(m.confidence, "none");
  assert.equal(m.match, null);
});

check("nameSimilarity: identical = 1, disjoint = 0", () => {
  assert.equal(nameSimilarity("Blum Movento", "Blum Movento"), 1);
  assert.equal(nameSimilarity("Garbage Pullout", "Maple Shaker Door"), 0);
});

check("containment boosts a short catalog name inside a long Mozaik name", () => {
  const m = matchBomToCatalog(
    [{ name: "Blum Movento 21in 90lb Full Extension", qty: 4, unit: "#" }],
    catalog,
  )[0];
  assert.equal(m.match!.id, "c2");
  assert.ok(m.score >= 0.5);
});

console.log(`\n${passed} checks passed.`);
