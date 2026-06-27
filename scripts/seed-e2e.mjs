/* eslint-disable no-console */
// Seed the E2E fixtures into a Supabase instance: the smoke user (via the admin
// API) plus one sentinel job (via PostgREST). Idempotent — safe to re-run.
// Uses the admin API for the user (not raw SQL) to avoid the SQL-created-user
// token-column gotcha documented in the gw-auth-and-rls memory.
//
// Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//      E2E_EMAIL, E2E_PASSWORD. Intended for the ephemeral local Supabase in CI.
// Run: node scripts/seed-e2e.mjs

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_EMAIL ?? "e2e@goodwoods.local";
const password = process.env.E2E_PASSWORD ?? "e2e-smoke-password";

if (!url || !key) {
  throw new Error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

// The job's payer (jobs.payer_id is a required FK to contacts). Fixed id so the
// upsert is idempotent.
const E2E_CONTACT = {
  id: "e2ec0a17-0000-4000-8000-000000000001",
  kind: "org",
  name: "E2E Test Client",
};

// Sentinel job the render-assertion e2e test looks for. The name string is
// duplicated in e2e/auth.spec.ts (E2E_JOB_NAME) — keep them in sync.
const E2E_JOB = {
  id: "e2e-smoke-job",
  code: "GW-E2E-001",
  name: "E2E Smoke Render Check Job",
  client: "E2E Test Client",
  address: "1 Test Way, Victoria BC",
  template: "full_project",
  pipeline_status: "in_production",
  health_status: "on_track",
  current_milestone: "cnc",
  install_date: "2026-12-01",
  revenue: 10000,
  costs: [],
  invoice: {
    number: "INV-E2E-001",
    issuedDate: "2026-01-01",
    dueDate: "2026-01-15",
    lineItems: [],
  },
  activity: [],
  site_access: {},
  payer_id: E2E_CONTACT.id,
};

// The Job Status demo job. Its id is the DEMO_JOB_ID the job-status e2e seeds
// items/pieces against; slice 5's owner board only drills into jobs that exist
// in the `jobs` table, so the demo job MUST be a real active job for the
// per-job field-view tests to reach it. Fixed id → idempotent upsert.
const DEMO_JOB = {
  id: "job-status-demo",
  code: "GW-DEMO",
  name: "Job Status Demo",
  client: "E2E Test Client",
  address: "2 Demo Rd, Victoria BC",
  template: "full_project",
  pipeline_status: "in_production",
  health_status: "on_track",
  current_milestone: "cnc",
  install_date: "2026-12-15",
  revenue: 0,
  costs: [],
  invoice: {
    number: "INV-DEMO-001",
    issuedDate: "2026-01-01",
    dueDate: "2026-01-15",
    lineItems: [],
  },
  activity: [],
  site_access: {},
  payer_id: E2E_CONTACT.id,
  // Scheduling S1 (ADR 0020): the current phase (cnc) target is in the past, so
  // the read-only schedule timeline must render a "Behind" badge deterministically.
  phase_target_dates: {
    design: "2026-01-15",
    cnc: "2020-02-01",
    assembly: "2026-09-01",
  },
  internal_target_date: "2026-12-01",
  buffer_days: 10,
};

// ─── Scheduling S8 (issue #96) — buffer-burn hitlist job ─────────────────
// This job has an internal target date deep in the past (Jan 2026) and is only
// at the CNC phase. Buffer consumed % ≈ 50% while chain progress ≈ 17% → RED
// fever zone. It should appear in the hitlist with data-testid="hitlist-fever-chip".
const BUFFER_BURN_JOB = {
  id: "s8-buffer-burn-demo",
  code: "GW-BUF-001",
  name: "Buffer Burn Demo Job",
  client: "E2E Test Client",
  address: "3 Buffer Rd, Victoria BC",
  template: "full_project",
  pipeline_status: "in_production",
  health_status: "on_track",
  current_milestone: "cnc",
  install_date: "2026-12-31",
  revenue: 0,
  costs: [],
  invoice: {
    number: "INV-BUF-001",
    issuedDate: "2026-01-01",
    dueDate: "2026-01-15",
    lineItems: [],
  },
  activity: [],
  site_access: {},
  payer_id: E2E_CONTACT.id,
  // internal_target_date in Jan 2026 → buffer deeply consumed while at cnc (index 1)
  // → computeBufferBurn returns RED zone when today is mid-2026+.
  internal_target_date: "2026-01-15",
  buffer_days: 10,
};

// ─── Scheduling S2 (issue #90) — phase capacity/load fixtures ─────────────
// The capacity panel reads completed labour_sessions over a trailing 7-day
// window and derives per-phase load. To make the over/under statuses
// deterministic we (a) shrink the `assembly` work-center's weekly capacity to a
// tiny value, then (b) log a few hours of assembly time → over capacity; a
// little design time stays well under its 40h default. Fixed ids → idempotent.
const HOUR_MS = 3_600_000;
const NOW = Date.now();
const oneHourAgo = new Date(NOW - HOUR_MS).toISOString();
const twoHoursAgo = new Date(NOW - 2 * HOUR_MS).toISOString();

const E2E_ASSEMBLY_CAPACITY = { phase: "assembly", weekly_capacity_hours: 4 };

const SCHED_JOB_A = "5ce51000-0000-4000-8000-0000000000aa";
const SCHED_JOB_B = "5ce51000-0000-4000-8000-0000000000bb";

const E2E_SESSIONS = [
  // assembly: 6h logged this window vs 4h capacity → OVER. Two jobs so the
  // derived "default duration" averages per job, not per session.
  {
    id: "5ce51011-0000-4000-8000-000000000001",
    category_id: "assembly",
    job_id: SCHED_JOB_A,
    started_at: twoHoursAgo,
    ended_at: oneHourAgo,
    accumulated_ms: 4 * HOUR_MS,
    resumed_at: null,
  },
  {
    id: "5ce51011-0000-4000-8000-000000000002",
    category_id: "assembly",
    job_id: SCHED_JOB_B,
    started_at: twoHoursAgo,
    ended_at: oneHourAgo,
    accumulated_ms: 2 * HOUR_MS,
    resumed_at: null,
  },
  // design: 1h logged vs 40h default capacity → UNDER.
  {
    id: "5ce51011-0000-4000-8000-000000000003",
    category_id: "design",
    job_id: SCHED_JOB_A,
    started_at: twoHoursAgo,
    ended_at: oneHourAgo,
    accumulated_ms: 1 * HOUR_MS,
    resumed_at: null,
  },
];

async function seedCapacity() {
  const token = await signIn();
  await upsert(token, "scheduling_phase_capacity", E2E_ASSEMBLY_CAPACITY);
  for (const s of E2E_SESSIONS) {
    await upsert(token, "labour_sessions", s);
  }
  console.log(`OK seeded scheduling capacity + ${E2E_SESSIONS.length} labour sessions`);
}

async function findUser() {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  if (!res.ok) throw new Error(`list users ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.users?.find((u) => u.email === email) ?? null;
}

// Create the e2e user, or reset its password if it already exists. Uses the
// admin API (not raw SQL) to avoid the token-column gotcha (gw-auth-and-rls).
async function seedUser() {
  const existing = await findUser();

  if (existing) {
    const res = await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`update user ${res.status}: ${await res.text()}`);
    console.log(`OK reset e2e user ${email} (${existing.id})`);
    return;
  }

  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`create user ${res.status}: ${await res.text()}`);
  const created = await res.json();
  console.log(`OK created e2e user ${email} (${created.id})`);
}

// Sign in as the e2e user to get an access token for the RLS-gated writes below.
async function signIn() {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign in e2e user ${res.status}: ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

// Idempotent upsert into a PostgREST table as the authenticated e2e user — the
// same RLS-gated write path the app uses. We can't use the service_role key here:
// it has no table GRANT on these app tables (they predate Supabase's default-
// privilege setup), so a service-key insert would 403. merge-duplicates makes it
// idempotent on the row's primary key.
async function upsert(token, table, row) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`seed ${table} ${res.status}: ${await res.text()}`);
}

// ─── Scheduling S11 (issue #99) — trade-line date fixtures ──────────────────
// A trade, a subtrade, and a job_trades line on the DEMO_JOB so the
// TradeDatePanel can render in the e2e test.
// Fixed ids → idempotent upserts across re-runs.
const S11_TRADE = {
  id: "51110000-0000-4000-8000-000000000001",
  key: "install",
  label: "Install",
  color: "install",
  icon: "wrench",
  is_suggested_default: true,
  sort_order: 1,
  active: true,
};
const S11_SUBTRADE = {
  id: "51110000-0000-4000-8000-000000000002",
  name: "Demo Sub Co.",
  trade_id: S11_TRADE.id,
  active: true,
};
// A job_trades line on the DEMO_JOB: booked, sub assigned, no date yet.
// After the migration, the date columns default to null.
const S11_JOB_TRADE = {
  id: "51110000-0000-4000-8000-000000000003",
  job_id: "job-status-demo",
  trade_id: S11_TRADE.id,
  subtrade_id: S11_SUBTRADE.id,
  status: "booked",
  cost: null,
  notes: null,
};

async function seedS11Trades(token) {
  await upsert(token, "trades", S11_TRADE);
  await upsert(token, "subtrades", S11_SUBTRADE);
  await upsert(token, "job_trades", S11_JOB_TRADE);
  console.log("OK seeded S11 trade fixtures (trade + subtrade + job_trades)");
}

// Seed the sentinel job (and its required payer contact) the e2e render test reads.
async function seedJob() {
  const token = await signIn();
  await upsert(token, "contacts", E2E_CONTACT);
  await upsert(token, "jobs", E2E_JOB);
  await upsert(token, "jobs", DEMO_JOB);
  await upsert(token, "jobs", BUFFER_BURN_JOB);
  await seedS11Trades(token);
  console.log(`OK seeded e2e jobs ${E2E_JOB.code}, ${DEMO_JOB.code}, ${BUFFER_BURN_JOB.code}`);
}

async function main() {
  await seedUser();
  await seedJob();
  await seedCapacity();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
