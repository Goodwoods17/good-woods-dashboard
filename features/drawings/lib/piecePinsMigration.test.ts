import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the DoD-critical shape of the S8a migration (ADR 0023). These are the
// elements the pre-mortem flagged as easy to drop or get wrong on a LIVE
// feature — a unit test pins them so a careless edit can't silently regress the
// orphan-clean, FK-validate, partial-unique, realtime, dual-read contract.
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719000000_job_piece_pins.sql"),
  "utf8"
).toLowerCase();

describe("S8a job_piece_pins migration", () => {
  it("creates the table with both cascade FKs", () => {
    expect(sql).toContain("create table if not exists public.job_piece_pins");
    expect(sql).toContain("references public.job_pieces(id) on delete cascade");
    expect(sql).toContain("references public.documents(id) on delete cascade");
  });

  it("enforces exactly one primary pin per piece (partial unique)", () => {
    expect(sql).toMatch(
      /create unique index[^;]*job_piece_pins[^;]*\(job_piece_id\)\s*where is_primary/
    );
  });

  it("backfills only is_primary pins, casting ::uuid and cleaning orphans", () => {
    expect(sql).toContain("insert into public.job_piece_pins");
    expect(sql).toContain("pin_document_id is not null");
    expect(sql).toContain("::uuid");
    // inner-join to documents drops orphaned references
    expect(sql).toContain("join public.documents d on d.id = c.document_id");
  });

  it("adds the documents FK NOT VALID then VALIDATEs it", () => {
    expect(sql).toContain("not valid");
    expect(sql).toContain("validate constraint job_piece_pins_document_id_fkey");
  });

  it("registers realtime for the new table", () => {
    expect(sql).toContain("alter publication supabase_realtime add table public.job_piece_pins");
  });

  it("does NOT drop the old pin_* columns (dual-read; S8c drops them)", () => {
    expect(sql).not.toContain("drop column");
  });

  it("locks RLS to authenticated and denies anon", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("to authenticated using (true)");
    expect(sql).toContain("to anon using (false)");
  });
});
