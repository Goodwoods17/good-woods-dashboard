/**
 * QBO-H2 (issue #185): RLS least-privilege on the encrypted-token tables.
 *
 * The encrypted-token tables (quickbooks_connection holds the AES-256-GCM
 * refresh/access token ciphertext; quickbooks_links + qbo_push_attempts hold
 * owner-only realm mappings / audit logs) originally shipped with a
 * `FOR ALL TO authenticated USING (true)` policy — letting any logged-in browser
 * session `select(*)` the ciphertext off the anon REST API. All legitimate
 * access is server-side via the service-role client (RLS-bypassing), so that
 * grant is pure attack surface.
 *
 * These tests reproduce the security property STATICALLY by replaying every
 * migration's CREATE/DROP POLICY + REVOKE statements in timestamp order and
 * asserting the *net effective* grants on the three tables. No DB needed — this
 * is the fast regression guard; the e2e spec proves it against a live Postgres.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const TOKEN_TABLES = ["quickbooks_connection", "quickbooks_links", "qbo_push_attempts"] as const;
type TokenTable = (typeof TOKEN_TABLES)[number];

/** A permissive policy, tracked by name, with the role it grants and the table. */
interface PolicyState {
  table: string;
  role: string;
}

/** Net effect of all migrations, replayed in timestamp (filename) order. */
function replayMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // active policies: name -> { table, role }
  const activePolicies = new Map<string, PolicyState>();
  // table -> set of roles whose default privileges have been REVOKEd.
  const revoked = new Map<string, Set<string>>();

  const sql = files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8")).join("\n");

  // CREATE POLICY <name> ON public.<table> ... [TO <role>] ... ;
  const createRe = /CREATE\s+POLICY\s+(\w+)\s+ON\s+(?:public\.)?(\w+)([\s\S]*?);/gi;
  // DROP POLICY [IF EXISTS] <name> ON public.<table> ;
  const dropRe = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+(?:public\.)?(\w+)/gi;
  // REVOKE ... ON public.<table> FROM <roles> ;
  const revokeRe = /REVOKE\s+[\s\S]*?\s+ON\s+(?:public\.)?(\w+)\s+FROM\s+([\s\S]*?);/gi;

  // Replay statements in source order so a DROP after a CREATE wins.
  // Tokenise by statement boundary to preserve ordering across the three kinds.
  const statements = sql.split(";").map((s) => s + ";");
  for (const stmt of statements) {
    createRe.lastIndex = 0;
    dropRe.lastIndex = 0;
    revokeRe.lastIndex = 0;

    const c = createRe.exec(stmt);
    if (c) {
      const [, name, table, body] = c;
      const roleMatch = /\bTO\s+(\w+)/i.exec(body);
      activePolicies.set(name, { table, role: roleMatch ? roleMatch[1] : "public" });
      continue;
    }
    const d = dropRe.exec(stmt);
    if (d) {
      activePolicies.delete(d[1]);
      continue;
    }
    const r = revokeRe.exec(stmt);
    if (r) {
      const table = r[1];
      const roles = r[2].split(",").map((s) => s.trim());
      const set = revoked.get(table) ?? new Set<string>();
      for (const role of roles) set.add(role);
      revoked.set(table, set);
    }
  }

  return { activePolicies, revoked };
}

describe("QBO encrypted-token tables — RLS least-privilege (issue #185)", () => {
  const { activePolicies, revoked } = replayMigrations();

  it("no token table grants a permissive policy to the authenticated role", () => {
    const offenders = Array.from(activePolicies.values()).filter(
      (p) => (TOKEN_TABLES as readonly string[]).includes(p.table) && p.role === "authenticated"
    );
    expect(offenders).toEqual([]);
  });

  it.each(TOKEN_TABLES)(
    "%s: the over-permissive authenticated_all policy is dropped",
    (table: TokenTable) => {
      expect(activePolicies.has(`${table}_authenticated_all`)).toBe(false);
    }
  );

  it.each(TOKEN_TABLES)(
    "%s: the anon deny policy survives (anon still locked out)",
    (table: TokenTable) => {
      const anonPolicy = Array.from(activePolicies.values()).find(
        (p) => p.table === table && p.role === "anon"
      );
      expect(anonPolicy).toBeDefined();
    }
  );

  it.each(TOKEN_TABLES)(
    "%s: default privileges are REVOKEd from anon + authenticated",
    (table: TokenTable) => {
      const set = revoked.get(table);
      expect(set?.has("anon")).toBe(true);
      expect(set?.has("authenticated")).toBe(true);
    }
  );

  it("the corrective migration is additive (no DROP TABLE / DROP COLUMN / DELETE)", () => {
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes("qbo_rls_least_privilege"));
    expect(file).toBeDefined();
    const body = readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
    // Strip `-- …` line comments so the rationale prose (which names the
    // dangerous statements it avoids) doesn't trip the executable-DDL checks.
    const ddl = body.replace(/--.*$/gm, "");
    expect(ddl).not.toMatch(/DROP\s+TABLE/i);
    expect(ddl).not.toMatch(/DROP\s+COLUMN/i);
    expect(ddl).not.toMatch(/\bDELETE\s+FROM/i);
    // Idempotent drops.
    expect(ddl).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS/i);
  });
});
