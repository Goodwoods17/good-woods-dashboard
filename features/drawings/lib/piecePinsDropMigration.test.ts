import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the DoD-critical shape of the S8c drop migration (ADR 0023, step 3 of
// the strict 3-step pins promotion). S8a built + backfilled job_piece_pins; S8b
// removed every reader/writer of the embedded job_pieces.pin_* columns and
// deployed. ONLY now is it safe to drop the four legacy columns. This test pins
// that contract so the drop stays additive-safe (IF EXISTS) and refreshes
// PostgREST's schema cache.
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260720000000_drop_job_piece_pin_columns.sql"),
  "utf8"
).toLowerCase();

describe("S8c drop job_pieces.pin_* columns migration", () => {
  it("drops all four legacy pin_* columns", () => {
    for (const col of ["pin_document_id", "pin_page", "pin_x", "pin_y"]) {
      expect(sql).toContain(`drop column if exists ${col}`);
    }
  });

  it("is additive-safe: every drop uses IF EXISTS", () => {
    // No bare `drop column <name>` — re-running the migration must not error.
    expect(sql).not.toMatch(/drop column(?!\s+if exists)/);
  });

  it("only touches job_pieces (does not drop or alter the new pins table)", () => {
    expect(sql).toContain("alter table public.job_pieces\n");
    expect(sql).not.toContain("alter table public.job_piece_pins");
    expect(sql).not.toContain("drop table");
  });

  it("reloads the PostgREST schema cache", () => {
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});
