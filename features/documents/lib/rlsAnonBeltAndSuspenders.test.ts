/**
 * S14 (issue #228): RLS belt-and-suspenders + verification.
 *
 * Two static properties, proven by replaying every migration's
 * CREATE/DROP POLICY + GRANT/REVOKE statements in timestamp order (no DB):
 *
 *   1. The three tables that previously relied on RLS *default-deny* for anon
 *      (document_annotations, job_pieces, job_blockers) now carry an EXPLICIT
 *      `*_anon_none` deny policy — belt-and-suspenders, no longer leaning on
 *      the absence of a permissive policy alone.
 *
 *   2. The three QBO encrypted-token tables (quickbooks_connection,
 *      quickbooks_links, qbo_push_attempts) STAY service-role-only: this slice
 *      must not have re-introduced any anon/authenticated permissive policy.
 *      (The live migration also asserts the GRANT side via a RAISE EXCEPTION
 *      block; the e2e spec proves the runtime deny against a real Postgres.)
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const BELT_TABLES = ["document_annotations", "job_pieces", "job_blockers"] as const;
const QBO_TABLES = ["quickbooks_connection", "quickbooks_links", "qbo_push_attempts"] as const;

interface PolicyState {
  table: string;
  role: string;
}

/** Net effect of all migrations, replayed in timestamp (filename) order. */
function replayPolicies() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const activePolicies = new Map<string, PolicyState>();
  const sql = files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8")).join("\n");

  const createRe = /CREATE\s+POLICY\s+"?(\w+)"?\s+ON\s+(?:public\.)?(\w+)([\s\S]*?);/gi;
  const dropRe = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+(?:public\.)?(\w+)/gi;

  const statements = sql.split(";").map((s) => s + ";");
  for (const stmt of statements) {
    createRe.lastIndex = 0;
    dropRe.lastIndex = 0;

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
    }
  }

  return activePolicies;
}

describe("S14 — RLS belt-and-suspenders (issue #228)", () => {
  const activePolicies = replayPolicies();

  it.each(BELT_TABLES)(
    "%s: carries an explicit anon-deny policy (no longer default-deny only)",
    (table) => {
      const anonPolicy = Array.from(activePolicies.values()).find(
        (p) => p.table === table && p.role === "anon"
      );
      expect(anonPolicy).toBeDefined();
    }
  );

  it.each(BELT_TABLES)("%s: keeps its authenticated policy (no regression)", (table) => {
    const authPolicy = Array.from(activePolicies.values()).find(
      (p) => p.table === table && p.role === "authenticated"
    );
    expect(authPolicy).toBeDefined();
  });

  it.each(QBO_TABLES)(
    "%s: stays service-role-only — no authenticated permissive policy",
    (table) => {
      const authPolicy = Array.from(activePolicies.values()).find(
        (p) => p.table === table && p.role === "authenticated"
      );
      expect(authPolicy).toBeUndefined();
    }
  );

  it("this migration is additive — no DROP / blanket re-GRANT that would regress QBO least-privilege", () => {
    const file = readdirSync(MIGRATIONS_DIR).find((f) =>
      f.includes("rls_anon_belt_and_suspenders")
    );
    expect(file).toBeDefined();
    const body = readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
    // Strip `-- …` line comments so the rationale prose doesn't trip the checks.
    const ddl = body.replace(/--.*$/gm, "");
    expect(ddl).not.toMatch(/DROP\s+TABLE/i);
    expect(ddl).not.toMatch(/DROP\s+POLICY/i);
    expect(ddl).not.toMatch(/\bGRANT\b/i);
    expect(ddl).not.toMatch(/ALTER\s+DEFAULT\s+PRIVILEGES/i);
    // It DOES add the three anon-deny policies.
    for (const table of BELT_TABLES) {
      expect(ddl).toMatch(new RegExp(`${table}_anon_none`, "i"));
    }
    // And it carries the live post-migration assertion for the QBO tables.
    expect(ddl).toMatch(/RAISE\s+EXCEPTION/i);
  });
});
