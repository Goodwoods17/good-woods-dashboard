/* eslint-disable no-console */
// Seed the E2E smoke user into a Supabase instance via the admin API.
// Idempotent: creates the user, or resets its password if it already exists.
// Uses the admin API (not raw SQL) to avoid the SQL-created-user token-column
// gotcha documented in the gw-auth-and-rls memory.
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

async function findUser() {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  if (!res.ok) throw new Error(`list users ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.users?.find((u) => u.email === email) ?? null;
}

async function main() {
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
