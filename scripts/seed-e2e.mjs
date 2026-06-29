/* eslint-disable no-console */
// Seed the E2E fixtures into a Supabase instance: the smoke user (via the admin
// API) plus one sentinel job (via PostgREST). Idempotent — safe to re-run.
// Uses the admin API for the user (not raw SQL) to avoid the SQL-created-user
// token-column gotcha documented in the gw-auth-and-rls memory.
//
// Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//      E2E_EMAIL, E2E_PASSWORD. Intended for the ephemeral local Supabase in CI.
// Run: node scripts/seed-e2e.mjs

import { PDFDocument, StandardFonts } from "pdf-lib";

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
  // Scheduling S13 (issue #101): two-level ownership. CNC is owned by the demo
  // subtrade (same id as the S11 subtrade fixture), assembly by a named person.
  // Design has no explicit owner → the commitment ledger defaults it to the shop.
  phase_owners: {
    cnc: { kind: "subtrade", id: "51110000-0000-4000-8000-000000000002", name: "Demo Sub Co." },
    assembly: {
      kind: "person",
      id: "51130000-0000-4000-8000-000000000010",
      name: "Andrew Chilton",
    },
  },
  // Scheduling S17 (issue #105): the demo job is Priority/VIP so the
  // PriorityBumpPanel renders in its "priority on" state, and the fever board
  // shows the VIP badge + the job floats first within its zone.
  is_priority: true,
  // Scheduling S19 (issue #107): a client-facing blocker so the "What we need
  // from you" nudge renders deterministically on the client portal page.
  blocker: "We need your handle selection before we can finalise the cabinet order.",
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
// deterministic we (a) set the `assembly` work-center's weekly capacity to 16h,
// then (b) log 24h of assembly time → over capacity; a little design time stays
// well under its 40h default. Fixed ids → idempotent. (Capacity is kept at/above
// the S15 free-capacity finder's 8h bookable threshold — see the note below.)
const HOUR_MS = 3_600_000;
const NOW = Date.now();

// Anchor the seeded labour sessions INSIDE the current ISO week's Mon–Fri span,
// derived from "now" so it never rots. This timestamp must satisfy TWO readers
// at once:
//   • S2/S3 PhaseCapacityPanel — trailing 7-day window [now-7d, now].
//   • S15 free-capacity finder — current-week bucket [Mon 00:00, Sat 00:00) UTC.
// A naive "now - 2h" breaks the finder whenever the suite runs on a weekend
// (now-2h falls on Sat/Sun, outside the Mon–Fri bucket → current-week load
// reads 0 → the week is wrongly "bookable"). Anchoring to this week's Monday
// (clamped to stay in the past) keeps assembly's 24h load in both windows
// regardless of which day the suite runs.
function currentWeekSessionStartMs() {
  const now = new Date(NOW);
  const toMonday = (now.getUTCDay() + 6) % 7; // 0 = Sun → days back to Monday
  const mondayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - toMonday);
  // Monday 09:00 UTC, but never in the future (early-Monday runs) and never
  // before Monday 00:00 (so it stays inside the finder's Mon–Sat bucket).
  return Math.max(mondayMs, Math.min(mondayMs + 9 * HOUR_MS, NOW - HOUR_MS));
}
const sessionStartMs = currentWeekSessionStartMs();
const sessionStart = new Date(sessionStartMs).toISOString();
const sessionEnd = new Date(sessionStartMs + HOUR_MS).toISOString();

// Assembly capacity is 16h (2 work-days), deliberately ABOVE the S15 finder's
// MIN_BOOKABLE_HOURS (8h = one work-day). This matters for the free-capacity
// finder: a week is "bookable" only when every phase has ≥ 8h free, so the
// work-center must have ≥ 8h total capacity for any empty future week to ever
// qualify. We then log 24h of assembly THIS week (below) → over capacity now,
// but empty future weeks stay fully bookable (16h free ≥ 8h).
const E2E_ASSEMBLY_CAPACITY = { phase: "assembly", weekly_capacity_hours: 16 };

const SCHED_JOB_A = "5ce51000-0000-4000-8000-0000000000aa";
const SCHED_JOB_B = "5ce51000-0000-4000-8000-0000000000bb";

const E2E_SESSIONS = [
  // assembly: 24h logged this window vs 16h capacity → OVER (ratio 1.5). Two
  // jobs so the derived "default duration" averages per job, not per session.
  // Load is read from accumulated_ms (banked active time), not the wall span.
  {
    id: "5ce51011-0000-4000-8000-000000000001",
    category_id: "assembly",
    job_id: SCHED_JOB_A,
    started_at: sessionStart,
    ended_at: sessionEnd,
    accumulated_ms: 12 * HOUR_MS,
    resumed_at: null,
  },
  {
    id: "5ce51011-0000-4000-8000-000000000002",
    category_id: "assembly",
    job_id: SCHED_JOB_B,
    started_at: sessionStart,
    ended_at: sessionEnd,
    accumulated_ms: 12 * HOUR_MS,
    resumed_at: null,
  },
  // design: 1h logged vs 40h default capacity → UNDER.
  {
    id: "5ce51011-0000-4000-8000-000000000003",
    category_id: "design",
    job_id: SCHED_JOB_A,
    started_at: sessionStart,
    ended_at: sessionEnd,
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

// ─── Scheduling S13 (issue #101) — commitment-ledger reliability fixtures ────
// Per-owner date-keeping history so the Commitment Ledger panel's reliability
// roll-up is deterministic. The demo subtrade missed 1 of 2 committed dates
// (50% → earns ceil(0.5 × 3) = 2 buffer days); the shop kept its one promise.
// Fixed hex ids → idempotent upserts.
const S13_LEDGER = [
  {
    id: "51130000-0000-4000-8000-000000000001",
    job_id: "job-status-demo",
    level: "phase",
    phase: "cnc",
    owner_kind: "subtrade",
    owner_id: "51110000-0000-4000-8000-000000000002",
    owner_name: "Demo Sub Co.",
    committed_date: "2026-03-01",
    actual_date: "2026-03-08",
    status: "missed",
    missed: true,
  },
  {
    id: "51130000-0000-4000-8000-000000000002",
    job_id: "job-status-demo",
    level: "phase",
    phase: "cnc",
    owner_kind: "subtrade",
    owner_id: "51110000-0000-4000-8000-000000000002",
    owner_name: "Demo Sub Co.",
    committed_date: "2026-04-01",
    actual_date: "2026-04-01",
    status: "kept",
    missed: false,
  },
  {
    id: "51130000-0000-4000-8000-000000000003",
    job_id: "job-status-demo",
    level: "client",
    phase: null,
    owner_kind: "shop",
    owner_id: null,
    owner_name: "Good Woods",
    committed_date: "2026-02-01",
    actual_date: "2026-02-01",
    status: "kept",
    missed: false,
  },
];

async function seedS13Ledger(token) {
  for (const row of S13_LEDGER) {
    await upsert(token, "commitment_ledger", row);
  }
  console.log("OK seeded S13 commitment-ledger reliability fixtures");
}

// ─── Scheduling S14 (issue #102) — commitment-revision history fixture ───────
// One prior re-commit on the DEMO_JOB so the revision history renders
// deterministically: a sub-trade delay that moved the committed date and DINGS
// reliability. Fixed hex id → idempotent upsert.
const S14_REVISIONS = [
  {
    id: "51140000-0000-4000-8000-000000000001",
    job_id: "job-status-demo",
    kind: "recommit",
    reason_code: "sub_delay",
    old_committed_date: "2026-11-30",
    new_committed_date: "2026-12-15",
    old_buffer_days: 8,
    new_buffer_days: 10,
    dings_reliability: true,
    note: "Spray sub pushed a week",
    revised_by: "claude-smoke-test@spacecraftjoinery.local",
    revised_at: "2026-05-01T12:00:00.000Z",
  },
];

async function seedS14Revisions(token) {
  for (const row of S14_REVISIONS) {
    await upsert(token, "commitment_revisions", row);
  }
  console.log("OK seeded S14 commitment-revision history fixture");
}

// ─── Scheduling S17 (issue #105) — priority bump fixture ─────────────────────
// A prior bump on the DEMO_JOB (priority) that pushed the E2E_JOB's committed
// date 4 work days to protect the demo job. Fixed hex id → idempotent upsert.
const S17_BUMPS = [
  {
    id: "51170000-0000-4000-8000-000000000001",
    priority_job_id: "job-status-demo",
    bumped_job_id: "e2e-smoke-job",
    bump_days: 4,
    reason: "Demo Kitchen must ship before holidays — Saywell is higher priority",
    old_committed_date: "2026-11-27",
    new_committed_date: "2026-12-03",
    bumped_by: "claude-smoke-test@spacecraftjoinery.local",
    bumped_at: "2026-05-15T10:00:00.000Z",
  },
];

async function seedS17Bumps(token) {
  for (const row of S17_BUMPS) {
    await upsert(token, "priority_bumps", row);
  }
  console.log("OK seeded S17 priority-bump fixture");
}

// ─── Scheduling S18 (issue #106) — client schedule portal share links ────────
// Two no-login tokenized links to the DEMO_JOB (install_date 2026-12-15). The
// ON_TRACK link's snapshot matches the live install date → "On track"; the
// UPDATED link's snapshot is an earlier date → the client view flips to
// "Date updated". Fixed hex ids + fixed >=32-char url-safe tokens → idempotent
// upserts the public-page e2e can visit deterministically.
const S18_ONTRACK_TOKEN = "e2eschedontrack00000000000000000000ab";
const S18_UPDATED_TOKEN = "e2escheddateupdated0000000000000000cd";
const S18_LINKS = [
  {
    id: "51180000-0000-4000-8000-000000000001",
    job_id: "job-status-demo",
    token: S18_ONTRACK_TOKEN,
    recipient_name: "E2E Test Client",
    committed_date_snapshot: "2026-12-15", // == DEMO_JOB install_date → On track
    viewed_at: null,
    revoked_at: null,
    created_by: "claude-smoke-test@spacecraftjoinery.local",
  },
  {
    id: "51180000-0000-4000-8000-000000000002",
    job_id: "job-status-demo",
    token: S18_UPDATED_TOKEN,
    recipient_name: null,
    committed_date_snapshot: "2026-11-30", // != install_date → Date updated
    viewed_at: null,
    revoked_at: null,
    created_by: "claude-smoke-test@spacecraftjoinery.local",
  },
];

// S5a (issue #216, milestone #12) retrofits the Scheduling portal onto the
// generalized `share_tokens` registry: the /s + feed.ics READS are cut to
// share_tokens (capability_type=schedule, committed_date_snapshot → state). The
// owner store dual-writes both tables, so seed BOTH here. The backfill migration
// only catches rows that pre-date it; seed rows are inserted post-migration, so
// the share_tokens mirror must be seeded explicitly.
const S18_SHARE_TOKENS = S18_LINKS.map((l) => ({
  id: l.id,
  capability_type: "schedule",
  job_id: l.job_id,
  token: l.token,
  recipient_name: l.recipient_name,
  viewed_at: l.viewed_at,
  revoked_at: l.revoked_at,
  expires_at: null,
  view_count: 0,
  created_by: l.created_by,
  state: { committedDateSnapshot: l.committed_date_snapshot },
}));

// S5a regression guard: a schedule link seeded ONLY into share_tokens (never
// into the legacy schedule_share_links table). /s/<this token> rendering proves
// the read path is truly cut to share_tokens, not silently still reading legacy.
const S5A_SHARETOKENS_ONLY_TOKEN = "e2eschedsharetokensonly000000000000ef";
const S5A_SHARE_TOKEN_ONLY = {
  id: "51a00000-0000-4000-8000-000000000001",
  capability_type: "schedule",
  job_id: "job-status-demo",
  token: S5A_SHARETOKENS_ONLY_TOKEN,
  recipient_name: "E2E Retrofit Client",
  viewed_at: null,
  revoked_at: null,
  expires_at: null,
  view_count: 0,
  created_by: "claude-smoke-test@spacecraftjoinery.local",
  state: { committedDateSnapshot: "2026-12-15" }, // == DEMO_JOB install_date → On track
};

async function seedS18ShareLinks(token) {
  for (const row of S18_LINKS) {
    await upsert(token, "schedule_share_links", row);
  }
  for (const row of S18_SHARE_TOKENS) {
    await upsert(token, "share_tokens", row);
  }
  await upsert(token, "share_tokens", S5A_SHARE_TOKEN_ONLY);
  console.log("OK seeded S18 client schedule portal share links (legacy + share_tokens)");
}

// ─── Project Files S2 (issue #213) — document VIEW portal fixtures ───────────
// Three docs on the demo job that exercise the curated-set exposure rules:
//   * a CLIENT-SAFE uploaded designer drawing  → MUST appear on /d/<token>
//   * an internal toolpath_cnc upload          → MUST NOT appear (excluded kind)
//   * a Drive-link designer doc                → MUST NOT appear (source:'link')
// Plus an active + a revoked document_view share token anchored on the safe doc,
// so the e2e can prove no-login view, internal-exclusion, and revoke-kills-access
// without depending on file bytes in Storage (a missing object just signs to a
// null URL; the curated-set membership is what the test asserts).
const S2_SAFE_DOC_ID = "52d00000-0000-4000-8000-000000000001";
const S2_CNC_DOC_ID = "52d00000-0000-4000-8000-000000000002";
const S2_DRIVE_DOC_ID = "52d00000-0000-4000-8000-000000000003";
const S2_DOCS = [
  {
    id: S2_SAFE_DOC_ID,
    project_id: "job-status-demo",
    kind: "designer",
    label: "Kitchen elevations",
    drive_url: null,
    version: "R2",
    is_current: true,
    source: "upload",
    storage_path: `job-status-demo/${S2_SAFE_DOC_ID}.pdf`,
    mime: "application/pdf",
    page_count: 4,
  },
  {
    id: S2_CNC_DOC_ID,
    project_id: "job-status-demo",
    kind: "toolpath_cnc",
    label: "Cabinet bank toolpaths",
    drive_url: null,
    version: "R1",
    is_current: true,
    source: "upload",
    storage_path: `job-status-demo/${S2_CNC_DOC_ID}.nc`,
    mime: "application/octet-stream",
    page_count: null,
  },
  {
    id: S2_DRIVE_DOC_ID,
    project_id: "job-status-demo",
    kind: "designer",
    label: "Designer concept (Drive)",
    drive_url: "https://drive.google.com/file/d/e2e-drive-doc/view",
    version: null,
    is_current: true,
    source: "link",
    storage_path: null,
    mime: null,
    page_count: null,
  },
];

const S2_ACTIVE_TOKEN = "e2edocviewactive00000000000000000000ab";
const S2_REVOKED_TOKEN = "e2edocviewrevoked0000000000000000000cd";
const S2_SHARE_TOKENS = [
  {
    id: "52700000-0000-4000-8000-000000000001",
    capability_type: "document_view",
    document_id: S2_SAFE_DOC_ID,
    token: S2_ACTIVE_TOKEN,
    recipient_name: "E2E Test Client",
    viewed_at: null,
    revoked_at: null,
    expires_at: null,
    view_count: 0,
    created_by: "claude-smoke-test@spacecraftjoinery.local",
    state: {},
  },
  {
    id: "52700000-0000-4000-8000-000000000002",
    capability_type: "document_view",
    document_id: S2_SAFE_DOC_ID,
    token: S2_REVOKED_TOKEN,
    recipient_name: null,
    viewed_at: null,
    revoked_at: "2026-06-28T00:00:00Z",
    expires_at: null,
    view_count: 0,
    created_by: "claude-smoke-test@spacecraftjoinery.local",
    state: {},
  },
];

async function seedS2DocumentShares(token) {
  for (const row of S2_DOCS) await upsert(token, "documents", row);
  for (const row of S2_SHARE_TOKENS) await upsert(token, "share_tokens", row);
  console.log("OK seeded S2 document view portal fixtures (docs + share tokens)");
}

// ─── Project Files S4 (issue #215) — watermark file bytes ────────────────────
// S4 stamps the recipient name + date into the RENDERED bytes at view time. The
// S2 safe doc points at job-status-demo/<id>.pdf; upload a real PDF there (via the
// service-role Storage API) whose own text does NOT contain the recipient name,
// so the watermark e2e can prove the stamp is injected at render time, not stored.
async function seedS4PortalFile() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Kitchen elevations (original, unwatermarked)", {
    x: 72,
    y: 700,
    size: 16,
    font,
  });
  const bytes = await pdf.save({ useObjectStreams: false });

  const path = `job-status-demo/${S2_SAFE_DOC_ID}.pdf`;
  const res = await fetch(`${url}/storage/v1/object/job-documents/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/pdf",
      "x-upsert": "true",
    },
    body: Buffer.from(bytes),
  });
  if (!res.ok) throw new Error(`seed S4 file ${res.status}: ${await res.text()}`);
  console.log("OK seeded S4 watermark source file (job-documents storage object)");
}

// Seed the sentinel job (and its required payer contact) the e2e render test reads.
async function seedJob() {
  const token = await signIn();
  await upsert(token, "contacts", E2E_CONTACT);
  await upsert(token, "jobs", E2E_JOB);
  await upsert(token, "jobs", DEMO_JOB);
  await upsert(token, "jobs", BUFFER_BURN_JOB);
  await seedS11Trades(token);
  await seedS13Ledger(token);
  await seedS14Revisions(token);
  await seedS17Bumps(token);
  await seedS18ShareLinks(token);
  await seedS2DocumentShares(token);
  await seedS4PortalFile();
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
