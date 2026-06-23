# Slice A — Live Cost-Code Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cost codes live, user-managed data end to end — a code added in `/labour → Setup → Cost codes` flows automatically into estimates, the frozen budget, and (later) P4, replacing Slice 1's hardcoded `CANONICAL_COST_CODES` runtime source.

**Architecture:** The estimator builds a cost-code **registry** (`Map<code, CostCodeDef>`) from `useLabour().operations` at render time and threads it into the pure budget functions. `CANONICAL_COST_CODES` stays only as the seed mirror + test fixture. Four component cost codes are seeded as starters; the Mozaik import feeds them their counts. Adding a code requires choosing a phase (its kanban column).

**Tech Stack:** Next.js 14 / React 18 / TypeScript (strict), Supabase (Postgres + RLS via MCP `apply_migration`), `tsx` for standalone test scripts (no jest/vitest), Playwright MCP for the browser smoke.

## Global Constraints

- Path aliases only: `@/*`→`src/*`, `@features/*`→`features/*`, `@shared/*`→`shared/*`. Never deep `../../../` across these boundaries.
- TypeScript strict. The project target rejects `Set`/`Map` spread + `for…of` over a `Set` — use `.forEach` / `Array.from`.
- `tsx` runs `.ts` test scripts and resolves tsconfig `paths`. There is no jest/vitest; tests are `node:assert/strict` scripts under `scripts/`, run with `npx tsx scripts/<name>.ts`.
- Money: `formatCAD` from `@shared/lib/format`. Tailwind tokens only (no hex).
- Migrations: timestamp-prefixed SQL in `supabase/migrations/`, applied via the Supabase MCP `apply_migration`; **align the repo filename to the recorded version** afterward (apply_migration stamps its own timestamp — rename the file to match, per the migration-drift lesson).
- Cost-code seed and `CANONICAL_COST_CODES` (TS) must stay in lockstep — `code` is the stable key.
- Verification gate every task: `npx tsc --noEmit` clean, then the relevant `tsx` test green. Full gate (`npm run lint`, `npm run build`) at the final task.
- Commit after each task. End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Cost-code registry type + builder (costCodes.ts)

Demote `CANONICAL_COST_CODES` to seed-only and add a registry built from labour operations.

**Files:**
- Modify: `features/job-costing/lib/costCodes.ts`
- Test: `scripts/test-cost-code-registry.ts` (create)

**Interfaces:**
- Consumes: `LabourOperation` from `@features/labour/lib/labourStore` (fields: `code: string | null`, `name`, `categoryId: string | null`, `cabinetType: CabinetTypeId | null`, `defaultMinutes: number | null`, `driverUnit: DriverUnit | null`).
- Produces:
  - `export type CostCodeRegistry = Map<string, CostCodeDef>`
  - `export function buildCostCodeRegistry(ops: LabourOperation[]): CostCodeRegistry` — includes only ops with a non-null `code` AND a `categoryId` that is one of the six `PhaseId`s; skips others.
  - `export const TOTAL_CABINET_COUNT_CODES: Set<string>` = `new Set(["DEL-LOAD"])` — codes whose driver qty is the total cabinet count (documented, replaces the inline `=== "DEL-LOAD"` magic string).
  - `export function registryFromDefs(defs: CostCodeDef[]): CostCodeRegistry` — `new Map(defs.map(d => [d.code, d]))`, for tests + parity with the seed.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-cost-code-registry.ts`:

```ts
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

console.log(`\n${passed} checks passed.`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-cost-code-registry.ts`
Expected: FAIL — `buildCostCodeRegistry`/`registryFromDefs`/`TOTAL_CABINET_COUNT_CODES` are not exported.

- [ ] **Step 3: Implement in costCodes.ts**

Add the import at the top of `features/job-costing/lib/costCodes.ts`:

```ts
import type { LabourOperation } from "@features/labour/lib/labourStore";
```

Append after `rateForPhase`:

```ts
export type CostCodeRegistry = Map<string, CostCodeDef>;

// Codes whose driver quantity is the job's total cabinet count (loading is per
// box). Documented set rather than an inline string check in resolveQuantity.
export const TOTAL_CABINET_COUNT_CODES = new Set<string>(["DEL-LOAD"]);

const PHASE_IDS = new Set<string>(PHASE_ORDER);

// Build the live registry from the labour operations table. Only operations that
// carry a `code` AND sit under one of the six phases become cost codes.
export function buildCostCodeRegistry(ops: LabourOperation[]): CostCodeRegistry {
  const reg: CostCodeRegistry = new Map();
  for (const op of ops) {
    if (!op.code) continue;
    if (!op.categoryId || !PHASE_IDS.has(op.categoryId)) continue;
    reg.set(op.code, {
      code: op.code,
      name: op.name,
      phaseId: op.categoryId as PhaseId,
      cabinetType: op.cabinetType ?? undefined,
      driver: op.driverUnit ?? null,
      defaultMinutes: op.defaultMinutes ?? 0,
    });
  }
  return reg;
}

// A registry from CostCodeDef[] — used by tests and to mirror the seed.
export function registryFromDefs(defs: CostCodeDef[]): CostCodeRegistry {
  return new Map(defs.map((d) => [d.code, d]));
}
```

Update the `CANONICAL_COST_CODES` doc comment to read: `// Seed mirror only (NOT the runtime source — the estimator resolves from the live registry, Slice A). Kept in lockstep with the seed migration; used for the seed + tests.`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-cost-code-registry.ts`
Expected: PASS — `3 checks passed.`

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → expect clean.

```bash
git add features/job-costing/lib/costCodes.ts scripts/test-cost-code-registry.ts
git commit -m "feat(job-costing): cost-code registry builder from labour operations (Slice A)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: deriveCostCodeBudget takes the registry; rows carry cabinetType

Thread the registry through the pure budget math and make rows self-describing so the panel needs no registry.

**Files:**
- Modify: `features/job-costing/lib/budget.ts`
- Modify: `scripts/test-job-costing-budget.ts`

**Interfaces:**
- Consumes: `CostCodeRegistry`, `TOTAL_CABINET_COUNT_CODES`, `registryFromDefs`, `CANONICAL_COST_CODES` from `./costCodes`.
- Produces (changed signatures):
  - `deriveCostCodeBudget(codes: string[], cabinets: CabinetSummary, rates: LabourRates, registry: CostCodeRegistry, options?: DeriveBudgetOptions): CostCodeBudget`
  - `derivePerRoomBudgets(rooms: RoomBudgetInput[], codes: string[], rates: LabourRates, registry: CostCodeRegistry, minutesByCode?: Record<string, number>): RoomBudget[]`
  - `CostCodeBudgetRow` gains `cabinetType?: CabinetTypeId`.

- [ ] **Step 1: Update the budget test to pass a registry (write the new expectation)**

In `scripts/test-job-costing-budget.ts`, add to the imports:

```ts
import { registryFromDefs, CANONICAL_COST_CODES } from "../features/job-costing/lib/budget";
```

Wait — `registryFromDefs`/`CANONICAL_COST_CODES` live in `costCodes.ts`. Import them from there instead:

```ts
import { registryFromDefs, CANONICAL_COST_CODES } from "../features/job-costing/lib/costCodes";
```

Add a shared registry near the top of the test body:

```ts
const REG = registryFromDefs(CANONICAL_COST_CODES);
```

Then update every `deriveCostCodeBudget(...)` call in the file to pass `REG` as the 4th arg, before the options object. Example — the first call becomes:

```ts
const budget = deriveCostCodeBudget(FULL_BUILD_CODE_SET, cabinets, DEFAULT_LABOUR_RATES, REG);
```

and the override cases become e.g.:

```ts
const b = deriveCostCodeBudget(["FIN-SPRAY"], cabinets, DEFAULT_LABOUR_RATES, REG, { qtyByCode: { "FIN-SPRAY": 25.55 } });
```

Add one new check after the existing ones:

```ts
check("cabinet-driven rows carry cabinetType; non-cabinet rows don't", () => {
  assert.equal(byCode["ASM-BASE"].cabinetType, "base");
  assert.equal(byCode["CUT-SHEET"].cabinetType, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-job-costing-budget.ts`
Expected: FAIL — `deriveCostCodeBudget` still has the old 4-arg (options) signature / `cabinetType` missing on rows.

- [ ] **Step 3: Implement the budget.ts changes**

In `features/job-costing/lib/budget.ts`:

Replace the import line:
```ts
import {
  CANONICAL_COST_CODES,
  findCostCode,
  rateForPhase,
  type CostCodeDef,
  type PhaseId,
} from "./costCodes";
```
with:
```ts
import {
  rateForPhase,
  TOTAL_CABINET_COUNT_CODES,
  type CostCodeDef,
  type CostCodeRegistry,
  type PhaseId,
} from "./costCodes";
import type { CabinetTypeId } from "@features/estimator/lib/types";
```

Add `cabinetType` to the row type:
```ts
export type CostCodeBudgetRow = {
  code: string;
  name: string;
  phaseId: PhaseId;
  driver: CostCodeDef["driver"];
  cabinetType?: CabinetTypeId;
  quantity: number;
  minutesPerUnit: number;
  budgetedMinutes: number;
  rate: number;
  amount: number;
};
```

Change `resolveQuantity` to use the documented set:
```ts
function resolveQuantity(
  def: CostCodeDef,
  cabinets: CabinetSummary,
  override: number | undefined,
): number {
  if (override != null && override >= 0) return override;
  if (def.cabinetType) return nonNeg(cabinets[def.cabinetType]?.count ?? 0);
  if (TOTAL_CABINET_COUNT_CODES.has(def.code)) return totalCabinetCount(cabinets);
  return 0;
}
```

Change `deriveCostCodeBudget` signature + body lookup:
```ts
export function deriveCostCodeBudget(
  codes: string[],
  cabinets: CabinetSummary,
  rates: LabourRates,
  registry: CostCodeRegistry,
  options: DeriveBudgetOptions = {},
): CostCodeBudget {
  const { minutesByCode = {}, qtyByCode = {} } = options;
  const rows: CostCodeBudgetRow[] = [];

  for (const code of codes) {
    const def = registry.get(code);
    if (!def) continue; // unknown / unphased code — skip rather than guess
    const minutesPerUnit = nonNeg(minutesByCode[code] ?? def.defaultMinutes);
    const quantity = resolveQuantity(def, cabinets, qtyByCode[code]);
    const budgetedMinutes = def.driver ? quantity * minutesPerUnit : minutesPerUnit;
    const rate = rateForPhase(def.phaseId, rates);
    const amount = (budgetedMinutes / 60) * rate;
    rows.push({
      code: def.code,
      name: def.name,
      phaseId: def.phaseId,
      driver: def.driver,
      cabinetType: def.cabinetType,
      quantity,
      minutesPerUnit,
      budgetedMinutes,
      rate,
      amount,
    });
  }

  const totalMinutes = rows.reduce((s, r) => s + r.budgetedMinutes, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, totalMinutes, totalAmount };
}
```

Change `derivePerRoomBudgets` to take + pass the registry:
```ts
export function derivePerRoomBudgets(
  rooms: RoomBudgetInput[],
  codes: string[],
  rates: LabourRates,
  registry: CostCodeRegistry,
  minutesByCode: Record<string, number> = {},
): RoomBudget[] {
  return rooms.map((room) => ({
    roomLabel: room.name,
    budget: deriveCostCodeBudget(codes, room.cabinets, rates, registry, {
      qtyByCode: room.qtyByCode ?? {},
      minutesByCode,
    }),
  }));
}
```

`FULL_BUILD_CODE_SET` currently does `CANONICAL_COST_CODES.map(...)`. Keep it, but import `CANONICAL_COST_CODES` for that one line:
```ts
import { CANONICAL_COST_CODES } from "./costCodes";
// ...
export const FULL_BUILD_CODE_SET: string[] = CANONICAL_COST_CODES.map((c) => c.code);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-job-costing-budget.ts`
Expected: PASS — `12 checks passed.` (11 prior + 1 new).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → will FAIL in `mozaikImport`/`EstimatorView` callers (fixed in Tasks 4 & 6). That is expected mid-refactor. Verify the **only** errors are "Expected 4 arguments" at `deriveCostCodeBudget`/`derivePerRoomBudgets` call sites; if so, proceed.

```bash
git add features/job-costing/lib/budget.ts scripts/test-job-costing-budget.ts
git commit -m "feat(job-costing): deriveCostCodeBudget reads a cost-code registry; rows carry cabinetType (Slice A)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Seed the 4 component cost codes

**Files:**
- Create: `supabase/migrations/<recorded-version>_seed_component_cost_codes.sql`
- Modify: `features/job-costing/lib/costCodes.ts` (add the 4 defs to `CANONICAL_COST_CODES`, keeping TS ↔ seed lockstep)

**Interfaces:**
- Produces: 4 new rows in `labour_operations` keyed by `code`, mirrored in `CANONICAL_COST_CODES`.

- [ ] **Step 1: Add the defs to CANONICAL_COST_CODES**

In `features/job-costing/lib/costCodes.ts`, inside the `CANONICAL_COST_CODES` array, before the Design entry, add:

```ts
  // ── Component install/assembly (ADR 0012 grill — Andrew adds more via /labour) ──
  { code: "INST-INSERT", name: "Install insert / accessory", phaseId: "install", driver: "ea", defaultMinutes: 10 },
  { code: "INST-ROLLOUT", name: "Install rollout / tray", phaseId: "install", driver: "ea", defaultMinutes: 8 },
  { code: "HW-PULL", name: "Mount pulls / handles", phaseId: "install", driver: "ea", defaultMinutes: 4 },
  { code: "FIT-DOOR", name: "Fit / hang doors + fronts", phaseId: "finishing", driver: "ea", defaultMinutes: 6 },
```

(Default minutes are hand-set starters; the learning loop sharpens them.)

- [ ] **Step 2: Apply the seed migration via Supabase MCP**

Call `apply_migration` (project `zycdmlkffbaqofaygddx`, name `seed_component_cost_codes`) with:

```sql
insert into public.labour_operations
  (name, category_id, cabinet_type, default_minutes, driver_unit, code, active)
values
  ('Install insert / accessory', 'install',   null, 10, 'ea', 'INST-INSERT',  true),
  ('Install rollout / tray',     'install',   null,  8, 'ea', 'INST-ROLLOUT', true),
  ('Mount pulls / handles',      'install',   null,  4, 'ea', 'HW-PULL',      true),
  ('Fit / hang doors + fronts',  'finishing', null,  6, 'ea', 'FIT-DOOR',     true)
on conflict (code) where code is not null do update set
  name = excluded.name, category_id = excluded.category_id,
  cabinet_type = excluded.cabinet_type, default_minutes = excluded.default_minutes,
  driver_unit = excluded.driver_unit, active = true;

notify pgrst, 'reload schema';
```

- [ ] **Step 3: Verify the seed landed**

Call `execute_sql`: `select code, category_id, driver_unit, default_minutes from labour_operations where code in ('INST-INSERT','INST-ROLLOUT','HW-PULL','FIT-DOOR') order by code;`
Expected: 4 rows with the phases above.

- [ ] **Step 4: Write the migration file + align its name to the recorded version**

Get the recorded version: `execute_sql`: `select version, name from supabase_migrations.schema_migrations where name = 'seed_component_cost_codes';`
Create `supabase/migrations/<that-version>_seed_component_cost_codes.sql` containing the exact SQL from Step 2 with a header comment: `-- Seed the 4 component cost codes (ADR 0012 grill). Idempotent upsert by code. Mirrors CANONICAL_COST_CODES.`

- [ ] **Step 5: Commit**

```bash
git add features/job-costing/lib/costCodes.ts supabase/migrations/*_seed_component_cost_codes.sql
git commit -m "feat(job-costing): seed 4 component cost codes (insert/rollout/pull/door fit) — Slice A

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Mozaik import feeds the component codes + `# Inserts` metric

**Files:**
- Modify: `features/estimator/lib/mozaikImport.ts`
- Modify: `docs/samples/mozaik-import-target-sample.csv` (add a `# Inserts` row to Kitchen)
- Modify: `docs/samples/mozaik-import-target-csv.md` (document the `# Inserts` row + the component-code mapping)
- Modify: `scripts/test-mozaik-import.ts`

**Interfaces:**
- Consumes: `registryFromDefs`, `CANONICAL_COST_CODES`, `derivePerRoomBudgets`, `deriveCostCodeBudget` (now registry-aware) — the test updates accordingly.
- Produces: `MozaikMetrics.inserts?: number`; `MozaikDraft.qtyByCode` + each `MozaikRoomDraft.qtyByCode` gain `INST-INSERT`, `INST-ROLLOUT`, `HW-PULL`, `FIT-DOOR`.

- [ ] **Step 1: Write the failing test**

In `scripts/test-mozaik-import.ts`:

Fix the two existing per-room-budget checks to pass a registry. Add near the top (after imports):
```ts
import { registryFromDefs, CANONICAL_COST_CODES } from "../features/job-costing/lib/costCodes";
const REG = registryFromDefs(CANONICAL_COST_CODES);
```
Update the `deriveCostCodeBudget(...)` and `derivePerRoomBudgets(...)` calls in the "Σ(per-room budgets)…" check to pass `REG` (4th arg to both; for `derivePerRoomBudgets` it's the 4th arg before `minutesByCode`).

Add new checks:
```ts
check("Mozaik counts feed the component cost codes", () => {
  const k = byRoom["Kitchen"];
  assert.equal(k.metrics.inserts, 2); // garbage + bottle pullout (from a # Inserts row)
  // draft job-level qtyByCode
  assert.equal(draft.qtyByCode["HW-PULL"], 35 + 11); // kitchen 35 + vanity 11
  assert.equal(draft.qtyByCode["INST-ROLLOUT"], 4); // kitchen rollouts (+0 trays)
  assert.equal(draft.qtyByCode["FIT-DOOR"], 12 + 5 + 12 + (5 + 0 + 6)); // base+wall doors + drawer fronts, both rooms
  assert.ok(draft.qtyByCode["INST-INSERT"] >= 2);
});
```

(Compute FIT-DOOR by hand from the fixture: Kitchen baseDoors 12 + wallDoors 5 + drawerFronts 12 = 29; Vanity baseDoors 5 + wallDoors 0 + drawerFronts 6 = 11; total 40. Use `40` directly to avoid arithmetic drift:)
```ts
  assert.equal(draft.qtyByCode["FIT-DOOR"], 40);
```

- [ ] **Step 2: Add a `# Inserts` row to the fixture**

In `docs/samples/mozaik-import-target-sample.csv`, in the **Kitchen** block, after the `Bottle Pullout,1,#,,` line is in the BOM — but inserts as a *count* live with the metric rows. Add this line right after `# Closet Rods`-style metrics, i.e. after `# Tray Boxes,0,#,,` in Kitchen:
```
# Inserts,2,#,,
```
Leave the `Garbage Pullout` / `Bottle Pullout` BOM lines as-is (they remain the priced BOM; `# Inserts` is the labour driver count).

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx scripts/test-mozaik-import.ts`
Expected: FAIL — `metrics.inserts` undefined and the component-code `qtyByCode` keys missing.

- [ ] **Step 4: Implement the parser + mapping changes**

In `features/estimator/lib/mozaikImport.ts`:

Add to `MozaikMetrics`:
```ts
  inserts?: number;
```

Add to `METRIC_KEYS`:
```ts
  "# inserts": "inserts",
```

In `mozaikToEstimateDraft`, accumulate the component drivers. Add tallies alongside the existing ones:
```ts
  let inserts = 0;
  let rollouts = 0;
  let pullsCount = 0;
  let fitDoors = 0;
```
Inside the room loop, after the existing `pulls += ...`:
```ts
    inserts += room.metrics.inserts ?? 0;
    rollouts += (room.metrics.rolloutShelves ?? 0) + (room.metrics.trayBoxes ?? 0);
    pullsCount += room.metrics.pulls ?? 0;
    fitDoors +=
      (room.metrics.baseDoors ?? 0) +
      (room.metrics.wallDoors ?? 0) +
      (room.metrics.drawerFronts ?? 0);
```
Add the same per-room values to each `perRoom[].qtyByCode`:
```ts
    perRoom.push({
      name: room.name,
      cabinetSummary: roomSummary,
      qtyByCode: {
        "FIN-SPRAY": round2(room.metrics.finishedAreaSqft ?? 0),
        "CUT-SHEET": room.metrics.sheets ?? 0,
        "INST-INSERT": room.metrics.inserts ?? 0,
        "INST-ROLLOUT": (room.metrics.rolloutShelves ?? 0) + (room.metrics.trayBoxes ?? 0),
        "HW-PULL": room.metrics.pulls ?? 0,
        "FIT-DOOR":
          (room.metrics.baseDoors ?? 0) +
          (room.metrics.wallDoors ?? 0) +
          (room.metrics.drawerFronts ?? 0),
      },
    });
```
Extend the job-level `qtyByCode` in the returned draft:
```ts
    qtyByCode: {
      "FIN-SPRAY": round2(finishedAreaSqft),
      "CUT-SHEET": sheets,
      "INST-INSERT": inserts,
      "INST-ROLLOUT": rollouts,
      "HW-PULL": pullsCount,
      "FIT-DOOR": fitDoors,
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx scripts/test-mozaik-import.ts`
Expected: PASS — `17 checks passed.` (14 prior + 1 component-feed + the 2 per-room checks still pass with the registry).

- [ ] **Step 6: Document the new row in the target CSV spec**

In `docs/samples/mozaik-import-target-csv.md`, under the "Hardware-mount & accessory labour" table add a row, and in the decisions list note: `# Inserts (count) → INST-INSERT; # Rollout Shelves + # Tray Boxes → INST-ROLLOUT; # Pulls → HW-PULL; # Base/Wall Doors + # Drawer Fronts → FIT-DOOR (the component cost codes, ADR 0012 grill).`

- [ ] **Step 7: Commit**

```bash
git add features/estimator/lib/mozaikImport.ts scripts/test-mozaik-import.ts docs/samples/mozaik-import-target-sample.csv docs/samples/mozaik-import-target-csv.md
git commit -m "feat(estimator): Mozaik import feeds the component cost codes + # Inserts metric (Slice A)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: CostCodesPanel reads cabinetType off the row (no registry import)

**Files:**
- Modify: `features/job-costing/components/CostCodesPanel.tsx`

**Interfaces:**
- Consumes: `CostCodeBudgetRow.cabinetType` (Task 2), `TOTAL_CABINET_COUNT_CODES` from `../lib/costCodes`.
- Produces: same rendered panel; `isQtyEditable` no longer calls `findCostCode`.

- [ ] **Step 1: Replace the registry-dependent editability check**

In `features/job-costing/components/CostCodesPanel.tsx`, replace the import of `findCostCode`:
```ts
import { PHASE_LABELS, PHASE_ORDER, TOTAL_CABINET_COUNT_CODES, type PhaseId } from "../lib/costCodes";
```
Replace `isQtyEditable`:
```ts
function isQtyEditable(row: { code: string; driver: unknown; cabinetType?: string }): boolean {
  // Cabinet counts (per type) and the total-count loading code come from the
  // cabinet summary; everything else with a driver is editable.
  return row.driver != null && !row.cabinetType && !TOTAL_CABINET_COUNT_CODES.has(row.code);
}
```
Update its call site to pass the row instead of `r.code`:
```ts
const qtyEditable = isQtyEditable(r);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: the only remaining error is in `EstimatorView.tsx` (the `deriveCostCodeBudget` call site, fixed in Task 6). The panel itself is clean.

- [ ] **Step 3: Commit**

```bash
git add features/job-costing/components/CostCodesPanel.tsx
git commit -m "refactor(job-costing): CostCodesPanel reads cabinetType off the row, not the registry (Slice A)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: EstimatorView builds + threads the live registry

**Files:**
- Modify: `features/estimator/components/EstimatorView.tsx`

**Interfaces:**
- Consumes: `useLabour` from `@features/labour/lib/labourStore`, `buildCostCodeRegistry` from `@features/job-costing/lib/costCodes`, the registry-aware `deriveCostCodeBudget`/`derivePerRoomBudgets`.
- Produces: estimate cost-code panel + save now driven by the live registry.

- [ ] **Step 1: Add the imports**

In `features/estimator/components/EstimatorView.tsx`, add:
```ts
import { useLabour } from "@features/labour/lib/labourStore";
import { buildCostCodeRegistry } from "@features/job-costing/lib/costCodes";
```

- [ ] **Step 2: Build the registry from live operations**

After the existing `const { cabinetTypes, itemsWithOffers } = useCatalog();` block, add:
```ts
  const { operations } = useLabour();
  const codeRegistry = useMemo(() => buildCostCodeRegistry(operations), [operations]);
```

- [ ] **Step 3: Pass the registry into the budget memo**

In the `costCodeBudget` `useMemo`, add `codeRegistry` as the 4th arg to `deriveCostCodeBudget` and add it to the dep array:
```ts
  const costCodeBudget = useMemo(
    () =>
      deriveCostCodeBudget(
        activeTemplate.costCodeSet ?? FULL_BUILD_CODE_SET,
        cabinetSummary,
        settings.labourRates,
        codeRegistry,
        { qtyByCode: budgetQtyByCode, minutesByCode: budgetMinutesByCode }
      ),
    [
      activeTemplate.costCodeSet,
      cabinetSummary,
      settings.labourRates,
      codeRegistry,
      budgetQtyByCode,
      budgetMinutesByCode,
    ]
  );
```

- [ ] **Step 4: Pass the registry into the per-room save derivation**

In `saveAsJob`, in the `derivePerRoomBudgets(...)` call, add `codeRegistry` as the 4th arg (before `budgetMinutesByCode`):
```ts
        const rb = derivePerRoomBudgets(
          mozaikPerRoom.map((r) => ({
            name: r.name,
            cabinets: r.cabinetSummary,
            qtyByCode: r.qtyByCode,
          })),
          codes,
          settings.labourRates,
          codeRegistry,
          budgetMinutesByCode
        );
```

- [ ] **Step 5: Typecheck + run all suites**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx tsx scripts/test-cost-code-registry.ts && npx tsx scripts/test-job-costing-budget.ts && npx tsx scripts/test-mozaik-import.ts && npx tsx scripts/test-bom-catalog-match.ts`
Expected: all green (3 / 12 / 17 / 6).

- [ ] **Step 6: Commit**

```bash
git add features/estimator/components/EstimatorView.tsx
git commit -m "feat(estimator): resolve cost codes from the live labour registry (Slice A)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Require a phase when adding a cost code (LabourSetup)

**Files:**
- Modify: `features/labour/components/LabourSetup.tsx`

**Interfaces:**
- Consumes: `addOperation(name, categoryId, ...)`, `categories` from `useLabour()`.
- Produces: the operations add control forces a phase choice (no silent default to the first category).

- [ ] **Step 1: Read the current add control**

Run: `sed -n '95,120p' features/labour/components/LabourSetup.tsx` to see the operations list + the `AddRow` usage at line ~112 (`onAdd={(name) => addOperation(name, activeCats[0]?.id ?? null)}`) and the `AddRow` component (line ~195).

- [ ] **Step 2: Add a phase select to the operations add control**

Replace the operations `AddRow` usage with an inline add that pairs a name input with a phase `<select>` defaulting to empty, and disables Add until a phase is chosen. Add local state at the top of the component:
```tsx
const [newOpPhase, setNewOpPhase] = useState<string>("");
```
Replace the `onAdd` usage block with (matching the file's existing token classes — reuse the `AddRow` input styles):
```tsx
<div className="flex items-center gap-2">
  <select
    value={newOpPhase}
    onChange={(e) => setNewOpPhase(e.target.value)}
    className="border border-border rounded px-2 py-1 text-sm bg-surface text-text-primary"
    aria-label="Phase for the new cost code"
  >
    <option value="">Phase…</option>
    {categories.map((c) => (
      <option key={c.id} value={c.id}>{c.label}</option>
    ))}
  </select>
  <AddRow
    placeholder="New cost code (operation) name"
    disabled={!newOpPhase}
    onAdd={(name) => {
      addOperation(name, newOpPhase);
      setNewOpPhase("");
    }}
  />
</div>
```
Then extend `AddRow` to accept + honour a `disabled` prop: add `disabled?: boolean` to its props, spread it onto the input and the Add button, and guard `commit()` with `if (disabled) return;`. Ensure `categories` is destructured from `useLabour()` at the top of `LabourSetup` (it already provides `activeCats` — use the same source; if `activeCats` is the active categories list, map over that instead of `categories`).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 4: Commit**

```bash
git add features/labour/components/LabourSetup.tsx
git commit -m "feat(labour): require a phase when adding a cost code (its kanban column) — Slice A

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full gate + browser smoke (live-registry loop)

**Files:** none (verification only).

- [ ] **Step 1: Full static gate**

Run: `npx tsc --noEmit` → clean.
Run: `npm run lint` → "No ESLint warnings or errors".
Run: `npm run build` → "Compiled successfully", `/estimator` + `/labour` listed.

- [ ] **Step 2: All test suites**

Run: `npx tsx scripts/test-cost-code-registry.ts && npx tsx scripts/test-job-costing-budget.ts && npx tsx scripts/test-mozaik-import.ts && npx tsx scripts/test-bom-catalog-match.ts`
Expected: `3` / `12` / `17` / `6` checks passed.

- [ ] **Step 3: Browser smoke — the live loop**

Start dev (`npm run dev`, note the port — 3000 may be busy → 3001). With Playwright MCP:
1. Navigate `/labour`, open the **Setup** tab, pick a phase (e.g. Install), add a cost code named "Install lazy susan", set its code (e.g. `INST-LAZY`) + driver `ea`.
2. Navigate `/estimator`. Confirm the **Labour cost codes** panel now lists `INST-LAZY` under Install (proves the estimator reads the live registry).
3. Import the Mozaik fixture (Import Mozaik CSV → upload `docs/samples/mozaik-import-target-sample.csv` → Fill the estimate). Confirm the component codes (`INST-INSERT`, `HW-PULL`, `FIT-DOOR`, `INST-ROLLOUT`) show non-zero quantities and the Total labour budget increased vs the Slice-2 value (it now includes the component-code labour).
4. Screenshot to `/tmp/slice-a-verify.png`. Stop dev (kill the port listener).

- [ ] **Step 4: Update docs + final commit**

Update `features/job-costing/CLAUDE.md`: note `costCodes.ts` now exports `buildCostCodeRegistry`/`registryFromDefs`/`CostCodeRegistry`/`TOTAL_CABINET_COUNT_CODES`; `CANONICAL_COST_CODES` is seed-only; the estimator resolves codes from the live `labour_operations` registry; the 4 component codes are seeded + Mozaik-fed.

```bash
git add features/job-costing/CLAUDE.md
git commit -m "docs(job-costing): cost codes are a live registry; component codes seeded (Slice A complete)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (against `2026-06-22-cost-code-registry-and-p4-stack-design.md` §"Slice A"):
- Estimator/budget/panel resolve from the live registry → Tasks 1, 2, 5, 6. ✓
- `CANONICAL_COST_CODES` demoted to seed-only → Task 1 (comment) + still used for `FULL_BUILD_CODE_SET`/seed/tests. ✓
- Quantity resolution generalised (no `DEL-LOAD` magic string) → Task 2 (`TOTAL_CABINET_COUNT_CODES`). ✓
- Phase required on add → Task 7. ✓
- Seed 4 component codes → Task 3. ✓
- Wire Mozaik counts + `# Inserts` metric → Task 4. ✓
- Verification incl. browser loop → Task 8. ✓

**Placeholder scan:** no TBD/TODO; every code step shows code; the one `sed` read (Task 7 Step 1) is a grounding read before an edit, not a placeholder.

**Type consistency:** `deriveCostCodeBudget(codes, cabinets, rates, registry, options)` and `derivePerRoomBudgets(rooms, codes, rates, registry, minutesByCode)` — the 4th-arg `registry` is consistent across Tasks 2, 4, 6. `CostCodeBudgetRow.cabinetType` defined in Task 2, consumed in Task 5. `buildCostCodeRegistry`/`registryFromDefs`/`CostCodeRegistry`/`TOTAL_CABINET_COUNT_CODES` defined in Task 1, used in 2/4/5/6. Component code keys (`INST-INSERT`/`INST-ROLLOUT`/`HW-PULL`/`FIT-DOOR`) identical in Tasks 3 and 4.

**Note for the implementer:** Task 2 Step 5 and Task 5 Step 2 intentionally leave the tree non-compiling between tasks (the caller is fixed in Task 6). Don't "fix" callers early — follow the task order. If executing out of order, do 1→2→5→6 before relying on a clean `tsc`.
