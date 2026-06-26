-- Invoices (invoice capture & extraction) — slice 1 tracer schema + infra.
-- See features/invoices/CLAUDE.md + CONTEXT.md and issue #46. Engine decision:
-- ADR 0019.
--
-- This feature captures supplier bills (money the shop PAID) — NOT customer-
-- facing sales invoices (that is jobs.invoice / job_invoices). Taxes are NEVER
-- collapsed: pre-tax + GST + PST + a per-line tax flag are stored always.
--
-- Status / file-mime vocabularies are validated in TypeScript (string unions),
-- NOT DB enums, so they can evolve without a migration — mirrors the forms
-- feature. RLS = authenticated-only + anon-none on both tables and the bucket.
--
-- MANDATORY overnight-build constraints (feature spec): additive-only
-- (CREATE / nullable ADD COLUMN), never weakens existing RLS, applied to prod by
-- the owner AFTER review. The /invoices route + nav are flag-gated OFF in prod.

-- ─── invoices (the captured bill + its extracted header) ─────────────────────
create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  -- pending → needs_review → reviewed → posted (+ error). Validated in TS.
  status            text not null default 'pending',
  -- Storage handle: path within the private `invoices` bucket + source metadata.
  storage_path      text not null,
  mime              text,
  original_filename text,
  -- Extracted header (null until extraction runs). Taxes never collapsed.
  supplier          text,
  invoice_number    text,
  issue_date        date,
  due_date          date,
  po_ref            text,
  pre_tax_total     numeric(12, 2),
  gst               numeric(12, 2),
  pst               numeric(12, 2),
  total             numeric(12, 2),
  -- Raw extracted JSON kept verbatim for the slice-1 raw view + auditing.
  extracted_json    jsonb,
  -- Populated when extraction fails after bounded retry (slice 2 surfaces it).
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists invoices_status_idx on public.invoices (status);
create index if not exists invoices_created_idx on public.invoices (created_at desc);

-- ─── invoice_lines (one row of a supplier bill) ─────────────────────────────
create table if not exists public.invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  line_no     int not null default 0,
  qty         numeric(12, 3),
  sku         text,                 -- supplier product no; the catalog match key
  description text,
  unit        text,
  unit_price  numeric(12, 4),
  amount      numeric(12, 2),
  tax_flag    boolean,              -- true = this line was charged PST
  confidence  numeric(4, 3),        -- per-line extraction confidence 0..1
  created_at  timestamptz not null default now()
);
create index if not exists invoice_lines_invoice_idx
  on public.invoice_lines (invoice_id, line_no);

-- ─── updated_at trigger (reuse the hardened set_updated_at()) ────────────────
drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ─── RLS: authenticated-all + anon-none (the security boundary) ──────────────
alter table public.invoices enable row level security;
drop policy if exists invoices_authenticated_all on public.invoices;
create policy invoices_authenticated_all on public.invoices for all to authenticated using (true) with check (true);
drop policy if exists invoices_anon_none on public.invoices;
create policy invoices_anon_none on public.invoices for all to anon using (false) with check (false);

alter table public.invoice_lines enable row level security;
drop policy if exists invoice_lines_authenticated_all on public.invoice_lines;
create policy invoice_lines_authenticated_all on public.invoice_lines for all to authenticated using (true) with check (true);
drop policy if exists invoice_lines_anon_none on public.invoice_lines;
create policy invoice_lines_anon_none on public.invoice_lines for all to anon using (false) with check (false);

-- ─── Private Storage bucket for captured invoice files ──────────────────────
-- Mirrors the job-documents / form-photos posture: private bucket, never
-- readable by anon, every op gated to authenticated.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

drop policy if exists invoices_bucket_read   on storage.objects;
drop policy if exists invoices_bucket_insert on storage.objects;
drop policy if exists invoices_bucket_update on storage.objects;
drop policy if exists invoices_bucket_delete on storage.objects;
create policy invoices_bucket_read on storage.objects
  for select to authenticated using (bucket_id = 'invoices');
create policy invoices_bucket_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'invoices');
create policy invoices_bucket_update on storage.objects
  for update to authenticated using (bucket_id = 'invoices') with check (bucket_id = 'invoices');
create policy invoices_bucket_delete on storage.objects
  for delete to authenticated using (bucket_id = 'invoices');
