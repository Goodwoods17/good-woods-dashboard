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

// Seed the sentinel job (and its required payer contact) the e2e render test reads.
async function seedJob() {
  const token = await signIn();
  await upsert(token, "contacts", E2E_CONTACT);
  await upsert(token, "jobs", E2E_JOB);
  console.log(`OK seeded e2e job ${E2E_JOB.code} (${E2E_JOB.name})`);
}

async function main() {
  await seedUser();
  await seedJob();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
