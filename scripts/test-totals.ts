// Manual unit tests for features/estimator/lib/totals.ts.
// Run: npx tsx scripts/test-totals.ts
// Exits non-zero on any failed assertion.
//
// No test framework — just explicit calls + assertions. The math is small
// and centralised; this script exercises the boundary cases that would
// otherwise hide.

import {
  computeTotals,
  computeDeliveryCost,
  computeDeficienciesCost,
  computePreWorkCost,
  deriveLabourHoursFromCabinets,
} from "../features/estimator/lib/totals";
import {
  emptyCabinetSummary,
  emptyDelivery,
  emptyPreWork,
  DEFAULT_ASSEMBLY_MINUTES,
  DEFAULT_INSTALL_MINUTES,
  DEFAULT_LABOUR_RATES,
  type LineItem,
  type Room,
} from "../features/estimator/lib/types";

let failed = 0;
let passed = 0;

function eq(actual: number, expected: number, label: string, tolerance = 0.01) {
  const ok = Math.abs(actual - expected) < tolerance;
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}: ${actual.toFixed(2)}`);
  } else {
    failed += 1;
    console.log(
      `  ✗ ${label}: expected ${expected.toFixed(2)}, got ${actual.toFixed(2)}`,
    );
  }
}

function ok(condition: boolean, label: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}`);
  }
}

function newLine(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2, 7),
    category: "Casework",
    item: "Plywood sheet",
    qty: 1,
    unit: "ea",
    unitPrice: 100,
    wastePct: 0,
    markupPct: 35,
    ...overrides,
  };
}

// ─── Test 1: Basic line math ────────────────────────────────────────────
console.log("\nTest 1: Basic per-line math (qty × unit × markup)");
{
  const lines = [
    newLine({ qty: 3, unit: "ea", unitPrice: 80, markupPct: 35 }), // 240 cost, 84 markup, 324 price
    newLine({
      category: "Assembly",
      qty: 5,
      unit: "hr",
      unitPrice: 85,
      markupPct: 25,
    }), // 425 cost, 106.25 markup, 531.25 price
  ];
  const totals = computeTotals(lines, { overheadPct: 8 });
  eq(totals.lineSubtotals[0].cost, 240, "L1 cost");
  eq(totals.lineSubtotals[0].markupAmount, 84, "L1 markup $");
  eq(totals.lineSubtotals[0].price, 324, "L1 price");
  eq(totals.lineSubtotals[1].cost, 425, "L2 cost");
  eq(totals.lineSubtotals[1].markupAmount, 106.25, "L2 markup $");
  eq(totals.lineSubtotals[1].price, 531.25, "L2 price");
  eq(totals.costs.materials, 240, "materials bucket");
  eq(totals.costs.labour, 425, "labour bucket");
  eq(totals.costs.direct, 665, "direct cost");
  eq(totals.overhead, 53.2, "overhead 8% of 665");
  eq(totals.quoted, 324 + 531.25 + 53.2, "quoted = lines + overhead");
}

// ─── Test 2: Waste math ─────────────────────────────────────────────────
console.log("\nTest 2: Waste % applies to qty before cost");
{
  const lines = [
    newLine({
      category: "Casework",
      qty: 10,
      unit: "bf",
      unitPrice: 8,
      wastePct: 15,
      markupPct: 30,
    }),
    // buyingQty = 10 × 1.15 = 11.5
    // cost = 11.5 × 8 = 92
    // markup = 92 × 0.30 = 27.60
    // price = 119.60
  ];
  const totals = computeTotals(lines, { overheadPct: 0 });
  eq(totals.lineSubtotals[0].buyingQty, 11.5, "buyingQty with 15% waste");
  eq(totals.lineSubtotals[0].cost, 92, "cost on waste-adjusted qty");
  eq(totals.lineSubtotals[0].markupAmount, 27.6, "markup on waste cost");
  eq(totals.lineSubtotals[0].price, 119.6, "price = cost + markup");
}

// ─── Test 3: Pre-work excluded from quote ───────────────────────────────
console.log("\nTest 3: Pre-work lines excluded from quoted price");
{
  const lines = [
    newLine({
      category: "Pre-work",
      qty: 4,
      unit: "hr",
      unitPrice: 85,
      markupPct: 0,
      excludeFromQuote: true,
    }), // $340 prework cost
    newLine({
      category: "Casework",
      qty: 10,
      unitPrice: 100,
      markupPct: 35,
    }), // 1000 cost, 350 markup, 1350 price
  ];
  const totals = computeTotals(lines, { overheadPct: 8 });
  eq(totals.costs.prework, 340, "prework bucket");
  eq(totals.costs.materials, 1000, "materials excludes prework");
  eq(totals.costs.direct, 1000, "direct excludes prework");
  eq(totals.overhead, 80, "overhead on direct (not prework)");
  eq(totals.quoted, 1350 + 80, "quoted excludes prework");
  eq(totals.internalCost, 1000 + 340 + 80, "internalCost = direct + prework + overhead");
  ok(
    totals.internalCost > totals.totalCost,
    "internalCost > totalCost (prework eats into margin)",
  );
}

// ─── Test 4: Disabled rooms excluded ────────────────────────────────────
console.log("\nTest 4: Disabled rooms drop their lines from totals");
{
  const rooms: Room[] = [
    { id: "r1", name: "Kitchen", enabled: true },
    { id: "r2", name: "Bathroom", enabled: false },
  ];
  const lines = [
    newLine({
      category: "Casework",
      roomId: "r1",
      qty: 10,
      unitPrice: 100,
      markupPct: 35,
    }), // 1000 cost, 350 markup, 1350 price
    newLine({
      category: "Casework",
      roomId: "r2",
      qty: 5,
      unitPrice: 100,
      markupPct: 35,
    }), // disabled — $0 contribution
  ];
  const totals = computeTotals(lines, { overheadPct: 8, rooms });
  eq(totals.costs.materials, 1000, "only kitchen materials count");
  eq(totals.costs.direct, 1000, "direct excludes disabled room");
  eq(totals.quoted, 1350 + 80, "quoted excludes disabled room");
  eq(totals.perRoom["r1"].price, 1350, "kitchen room price");
  ok(
    !totals.perRoom["r2"] || totals.perRoom["r2"].price === 0,
    "bathroom room excluded or zero",
  );
}

// ─── Test 5: Contingency % on top of quoted ─────────────────────────────
console.log("\nTest 5: Contingency adds % on top");
{
  const lines = [
    newLine({ category: "Casework", qty: 10, unitPrice: 100, markupPct: 35 }),
    // direct 1000, markup 350, line price 1350. overhead 8% = 80. pre-contingency = 1430
  ];
  const totals = computeTotals(lines, { overheadPct: 8, contingencyPct: 5 });
  eq(totals.contingency, 1430 * 0.05, "contingency = 5% of pre-contingency quoted");
  eq(totals.quoted, 1430 + 1430 * 0.05, "quoted includes contingency");
}

// ─── Test 6: Delivery breakdown ─────────────────────────────────────────
console.log("\nTest 6: Delivery calculator");
{
  const cd = computeDeliveryCost(
    { ...emptyDelivery(), miles: 10, travelHours: 1, loadMinutesPerCabinet: 5, gasRatePerMile: 0.55 },
    8, // cabinet count
    DEFAULT_LABOUR_RATES,
  );
  eq(cd.gasCost, 10 * 2 * 0.55, "gas = miles × 2 × $/mi");
  eq(cd.travelCost, 1 * DEFAULT_LABOUR_RATES.installRate, "travel = hrs × install rate");
  eq(cd.loadingHours, (8 * 5) / 60, "loadingHours = cabs × min / 60");
  eq(
    cd.loadingCost,
    cd.loadingHours * DEFAULT_LABOUR_RATES.shopRate,
    "loading = hrs × shop rate",
  );
  eq(cd.total, cd.gasCost + cd.travelCost + cd.loadingCost, "total = sum of 3");
}

// ─── Test 7: Deficiencies ───────────────────────────────────────────────
console.log("\nTest 7: Deficiencies budget");
{
  const cd = computeDeficienciesCost(
    { hoursBudget: 4, contingencyPct: 3 },
    DEFAULT_LABOUR_RATES,
  );
  eq(cd.budgetCost, 4 * DEFAULT_LABOUR_RATES.installRate, "budget = hrs × install rate");
  eq(cd.contingencyPct, 3, "contingency % passes through");
}

// ─── Test 8: Pre-work breakdown ─────────────────────────────────────────
console.log("\nTest 8: Pre-work breakdown");
{
  const pw = computePreWorkCost(
    {
      ...emptyPreWork(),
      site_visit: { hours: 2 },
      design: { hours: 3 },
      estimating: { hours: 1 },
    },
    DEFAULT_LABOUR_RATES,
  );
  eq(pw.totalHours, 6, "total hours = 6");
  eq(pw.totalCost, 6 * DEFAULT_LABOUR_RATES.designRate, "total = 6 × design rate");
  eq(pw.perSlot.site_visit.cost, 2 * DEFAULT_LABOUR_RATES.designRate, "site visit cost");
}

// ─── Test 9: Auto-derive labour hours ───────────────────────────────────
console.log("\nTest 9: Auto-derive labour hours from cabinet counts");
{
  const summary = {
    ...emptyCabinetSummary(),
    base: { count: 4, linearFt: 8 },
    wall: { count: 2, linearFt: 4 },
  };
  const assemblyHrs = deriveLabourHoursFromCabinets(summary, DEFAULT_ASSEMBLY_MINUTES);
  // 4 × 60 + 2 × 45 = 240 + 90 = 330 min = 5.5 hrs
  eq(assemblyHrs, 5.5, "assembly hours");

  const installHrs = deriveLabourHoursFromCabinets(summary, DEFAULT_INSTALL_MINUTES);
  // 4 × 30 + 2 × 20 = 120 + 40 = 160 min = 2.67 hrs
  eq(installHrs, 160 / 60, "install hours");
}

// ─── Test 10: Realistic end-to-end estimate ─────────────────────────────
console.log("\nTest 10: Realistic kitchen estimate end-to-end");
{
  // Realistic scenario: 8-cabinet kitchen.
  // - Casework: 3 sheets Baltic birch @ $80 = $240
  // - CNC: $400 Toolpath flat
  // - Doors: 25 sqft Maple shaker @ $42 = $1,050
  // - Finishing: 25 sqft 2K poly @ $11 = $275
  // - Assembly auto: 8 cabs (4 base + 4 wall) × shop minutes
  // - Install auto: same × install minutes
  // - Delivery: 10 mi, 0.5 hr travel, 5 min/cab loading
  // - Pre-work: 3 hr design + 2 hr site = 5 hr internal
  const cabSummary = {
    ...emptyCabinetSummary(),
    base: { count: 4, linearFt: 12 },
    wall: { count: 4, linearFt: 12 },
  };
  const assemblyHrs = deriveLabourHoursFromCabinets(cabSummary, DEFAULT_ASSEMBLY_MINUTES); // 4×60 + 4×45 = 420 min = 7 hr
  const installHrs = deriveLabourHoursFromCabinets(cabSummary, DEFAULT_INSTALL_MINUTES); // 4×30 + 4×20 = 200 min = 3.33 hr
  eq(assemblyHrs, 7, "assembly auto hours");
  eq(installHrs, 200 / 60, "install auto hours");

  const lines: LineItem[] = [
    newLine({ category: "Casework", qty: 3, unit: "ea", unitPrice: 80, markupPct: 35 }),
    newLine({ category: "CNC subcontract", qty: 1, unit: "ea", unitPrice: 400, markupPct: 35 }),
    newLine({ category: "Door materials & profiles", qty: 25, unit: "sqft", unitPrice: 42, markupPct: 35 }),
    newLine({ category: "Finishing", qty: 25, unit: "sqft", unitPrice: 11, markupPct: 35 }),
    newLine({
      category: "Assembly",
      qty: 7,
      unit: "hr",
      unitPrice: DEFAULT_LABOUR_RATES.shopRate,
      markupPct: 35,
    }),
    newLine({
      category: "Install",
      qty: 200 / 60,
      unit: "hr",
      unitPrice: DEFAULT_LABOUR_RATES.installRate,
      markupPct: 35,
    }),
    newLine({
      category: "Pre-work",
      qty: 5,
      unit: "hr",
      unitPrice: DEFAULT_LABOUR_RATES.designRate,
      markupPct: 0,
      excludeFromQuote: true,
    }),
  ];

  const totals = computeTotals(lines, { overheadPct: 8 });

  // Hand-calc
  const caseworkCost = 3 * 80; // 240
  const cncCost = 400;
  const doorsCost = 25 * 42; // 1050
  const finishingCost = 25 * 11; // 275
  const assemblyCost = 7 * DEFAULT_LABOUR_RATES.shopRate; // 7 × 85 = 595
  const installCost = (200 / 60) * DEFAULT_LABOUR_RATES.installRate; // 3.33 × 95 = 316.67
  const preworkCost = 5 * DEFAULT_LABOUR_RATES.designRate; // 5 × 85 = 425

  const materials = caseworkCost + cncCost + doorsCost; // 1690
  const labour = finishingCost + assemblyCost + installCost; // 275 + 595 + 316.67 = 1186.67
  const direct = materials + labour;
  const overhead = direct * 0.08;
  const linesPrice =
    caseworkCost * 1.35 +
    cncCost * 1.35 +
    doorsCost * 1.35 +
    finishingCost * 1.35 +
    assemblyCost * 1.35 +
    installCost * 1.35;
  const quoted = linesPrice + overhead;

  eq(totals.costs.materials, materials, "materials sum");
  eq(totals.costs.labour, labour, "labour sum");
  eq(totals.costs.prework, preworkCost, "prework sum");
  eq(totals.costs.direct, direct, "direct = mat + lab (no prework)");
  eq(totals.overhead, overhead, "overhead on direct");
  eq(totals.quoted, quoted, "quoted total");
  eq(totals.internalCost, direct + preworkCost + overhead, "internalCost incl prework");
  eq(totals.totalCost, direct + overhead, "totalCost excl prework");
  ok(totals.effectiveMarginPct > 20, "margin reasonable (>20%)");

  console.log(
    `\n  → Quoted: $${totals.quoted.toFixed(2)}, totalCost: $${totals.totalCost.toFixed(2)}, ` +
      `internalCost: $${totals.internalCost.toFixed(2)}, margin: ${totals.effectiveMarginPct.toFixed(1)}%, ` +
      `net after pre-work: $${(totals.quoted - totals.internalCost).toFixed(2)}`,
  );
}

// ─── Test 11: Zero-line edge cases ──────────────────────────────────────
console.log("\nTest 11: Zero-line edge cases");
{
  const totals = computeTotals([], { overheadPct: 8 });
  eq(totals.quoted, 0, "empty estimate quoted = 0");
  eq(totals.totalCost, 0, "empty totalCost = 0");
  eq(totals.effectiveMarginPct, 0, "empty margin = 0");

  // All-disabled-rooms edge case
  const rooms: Room[] = [{ id: "r1", name: "Only room", enabled: false }];
  const lines = [newLine({ roomId: "r1", qty: 5, unitPrice: 100, markupPct: 35 })];
  const t2 = computeTotals(lines, { overheadPct: 8, rooms });
  eq(t2.quoted, 0, "all rooms off → quoted 0");
}

// ─── Summary ────────────────────────────────────────────────────────────
console.log("");
console.log("─".repeat(50));
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
}
