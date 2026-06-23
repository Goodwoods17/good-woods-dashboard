/* eslint-disable no-console */
// Seed (or clean) Budget-vs-Actual demo data for one job, so the P4 tab can be
// exercised without running the full estimator → Save-as-Job → shop-floor flow.
// Usage:
//   npx tsx scripts/seed-bva-smoke.ts [jobId]            seed (default job "2")
//   npx tsx scripts/seed-bva-smoke.ts [jobId] --clean    delete what this seeds
//
// Reusable smoke fixture (build-workflow retro item). Writes: a few job_cost_budgets
// labour rows, matching labour_sessions (actuals), one job_cost_actuals material
// row, one job_trades subtrade-cost row. Safe on this DB — it holds only example
// jobs and these tables are otherwise empty; --clean removes rows by job_id.
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const jobId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "2";
const clean = process.argv.includes("--clean");
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

// Real seeded labour_operations (id ↔ code ↔ phase) — from the live registry.
const DSN = "cb5b7567-8cab-49ec-8770-24bcb3b745d4"; // design
const CUT = "a236e5b4-cee8-42fc-bc6d-3a3cea34a65e"; // cnc
const ASM = "7f5e058b-c9a9-4fdc-8a89-5f0bcc694cd2"; // assembly

async function del(table: string, query: string) {
  const r = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { ...h, Prefer: "return=representation" },
  });
  const rows = (await r.json()) as unknown[];
  console.log(`  cleaned ${table}: ${Array.isArray(rows) ? rows.length : 0}`);
}

async function ins(table: string, rows: Record<string, unknown>[]) {
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...h, Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`insert ${table} failed ${r.status}: ${await r.text()}`);
  console.log(`  inserted ${table}: ${rows.length}`);
}

async function cleanAll() {
  // Deletes ALL P4 rows for the job, not just BVA-SMOKE-tagged ones, so it also
  // removes anything logged through the UI during the smoke (those rows carry the
  // user's note, not our tag). Safe because this helper targets example jobs only.
  console.log(`Cleaning BVA data for job ${jobId}…`);
  await del("labour_sessions", `job_id=eq.${jobId}`);
  await del("job_cost_actuals", `job_id=eq.${jobId}`);
  await del("job_cost_budgets", `job_id=eq.${jobId}`);
  await del("job_trades", `job_id=eq.${jobId}`);
}

async function main() {
  if (clean) {
    await cleanAll();
    console.log("Done (clean).");
    return;
  }
  // Idempotent: clear any prior seed first.
  await cleanAll();
  console.log(`Seeding BVA smoke data for job ${jobId}…`);

  // Budget (labour only — materials/subtrades are job-level / job_trades).
  await ins("job_cost_budgets", [
    {
      job_id: jobId,
      code_id: DSN,
      phase_id: "design",
      kind: "labour",
      budgeted_minutes: 480,
      rate: 75,
      budgeted_amount: 600,
      sort: 0,
    },
    {
      job_id: jobId,
      code_id: CUT,
      phase_id: "cnc",
      kind: "labour",
      budgeted_minutes: 300,
      rate: 50,
      budgeted_amount: 250,
      sort: 1,
    },
    {
      job_id: jobId,
      code_id: ASM,
      phase_id: "assembly",
      kind: "labour",
      budgeted_minutes: 600,
      rate: 50,
      budgeted_amount: 500,
      sort: 2,
    },
  ]);

  // Actuals (labour sessions). Design ran hot: 540 min @ snapshot 75 = $675 (>$600).
  // CNC in progress: 120 min @ 50 = $100 (budget 250).
  const start = "2026-06-20T16:00:00Z";
  await ins("labour_sessions", [
    {
      job_id: jobId,
      operation_id: DSN,
      category_id: "design",
      started_at: start,
      ended_at: "2026-06-20T22:00:00Z",
      accumulated_ms: 21_600_000,
      quantity: null,
      note: "BVA-SMOKE",
    }, // 360 min
    {
      job_id: jobId,
      operation_id: DSN,
      category_id: "design",
      started_at: start,
      ended_at: "2026-06-21T19:00:00Z",
      accumulated_ms: 10_800_000,
      quantity: null,
      note: "BVA-SMOKE",
    }, // 180 min → 540 total
    {
      job_id: jobId,
      operation_id: CUT,
      category_id: "cnc",
      started_at: start,
      ended_at: "2026-06-22T18:00:00Z",
      accumulated_ms: 7_200_000,
      quantity: null,
      note: "BVA-SMOKE",
    }, // 120 min
  ]);

  // Material actual (job-level) + a subtrade budget.
  await ins("job_cost_actuals", [
    { job_id: jobId, kind: "material", phase_id: null, amount: 1200, note: "BVA-SMOKE" },
  ]);
  await ins("job_trades", [
    {
      job_id: jobId,
      trade_id: "c2583f08-439f-4de6-9cea-668c7cef3188", // countertop (trade registry)
      cost: 800,
      status: "needed",
      notes: "BVA-SMOKE",
    },
  ]);

  console.log("Done (seed). Open /jobs/" + jobId + " → Budget vs Actual.");
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
