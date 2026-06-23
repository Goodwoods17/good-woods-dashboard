/* eslint-disable no-console */
// One-off: reset the claude smoke-test user's password via the Supabase admin API.
// Password is passed as argv[2] and never stored. Run: npx tsx scripts/reset-smoke-user.ts <pw>
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

const EMAIL = "claude-smoke-test@spacecraftjoinery.local";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const pw = process.argv[2];
if (!url || !key) throw new Error("missing env");
if (!pw) throw new Error("usage: tsx scripts/reset-smoke-user.ts <password>");

async function main() {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  // find the user
  const list = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  const body = (await list.json()) as { users: { id: string; email: string }[] };
  const user = body.users.find((u) => u.email === EMAIL);
  if (!user) throw new Error(`smoke user not found: ${EMAIL}`);
  const patch = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password: pw, email_confirm: true }),
  });
  if (!patch.ok) throw new Error(`reset failed ${patch.status}: ${await patch.text()}`);
  console.log(`OK reset ${EMAIL} (id ${user.id})`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
