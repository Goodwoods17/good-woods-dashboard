-- Forms (form builder) — slice 1 schema. See features/forms/CLAUDE.md + CONTEXT.md
-- and issue #32. Field-registry model: every field is a row with a `type` +
-- JSON `config`, validated in TypeScript (FieldType union), NOT a DB enum — so
-- new field types never need a migration. Instances SNAPSHOT their template's
-- field defs at attach time (frozen; never auto-update from the master).
--
-- Vocabulary: master = "Form template", filled copy = "Form instance" (never
-- bare "template"/"checklist" — those collide with Job template / piece
-- checklist). RLS = authenticated-only + anon-none on all 4 tables (the client
-- token-link portal is Phase 2, separate). Reuses the hardened set_updated_at()
-- trigger (do not redefine).

-- ─── form_templates (the master) ────────────────────────────────────────────
create table if not exists public.form_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  -- 6-phase spine tag (ADR 0008), or null = unphased. Validated in TS (FormPhase),
  -- not a DB enum, so the phase vocabulary can evolve without a migration.
  phase       text,
  is_default  boolean not null default false,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── form_template_fields (a master's field defs) ───────────────────────────
create table if not exists public.form_template_fields (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.form_templates(id) on delete cascade,
  label       text not null,
  type        text not null,           -- FieldType, validated in TS
  config      jsonb not null default '{}'::jsonb,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists form_template_fields_template_idx
  on public.form_template_fields (template_id, sort_order);

-- ─── form_instances (a filled copy, optionally on a job) ────────────────────
-- job_id is text (jobs PK is text); nullable = standalone (slice 2). completed_by
-- stores the authenticated user (id/email). phase is a snapshot of the template's
-- phase at attach time.
create table if not exists public.form_instances (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid references public.form_templates(id) on delete set null,
  job_id       text references public.jobs(id) on delete cascade,
  title        text not null,
  phase        text,
  status       text not null default 'draft',  -- FormStatus, validated in TS
  signoff_path text,
  completed_at timestamptz,
  completed_by text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists form_instances_job_idx on public.form_instances (job_id);

-- ─── form_instance_fields (snapshot def + inline answer) ────────────────────
create table if not exists public.form_instance_fields (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.form_instances(id) on delete cascade,
  label       text not null,           -- snapshot of the template field's label
  type        text not null,           -- snapshot of the template field's type
  config      jsonb not null default '{}'::jsonb,  -- snapshot of the def's config
  value       jsonb,                   -- typed-per-type answer (later slices)
  checked     boolean,                 -- checkbox answer
  note        text,
  photo_url   text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists form_instance_fields_instance_idx
  on public.form_instance_fields (instance_id, sort_order);

-- ─── updated_at triggers (reuse the hardened set_updated_at()) ──────────────
drop trigger if exists form_templates_set_updated_at on public.form_templates;
create trigger form_templates_set_updated_at
  before update on public.form_templates
  for each row execute function public.set_updated_at();

drop trigger if exists form_template_fields_set_updated_at on public.form_template_fields;
create trigger form_template_fields_set_updated_at
  before update on public.form_template_fields
  for each row execute function public.set_updated_at();

drop trigger if exists form_instances_set_updated_at on public.form_instances;
create trigger form_instances_set_updated_at
  before update on public.form_instances
  for each row execute function public.set_updated_at();

drop trigger if exists form_instance_fields_set_updated_at on public.form_instance_fields;
create trigger form_instance_fields_set_updated_at
  before update on public.form_instance_fields
  for each row execute function public.set_updated_at();

-- ─── RLS: canonical *_authenticated_all + *_anon_none on all 4 tables ───────
alter table public.form_templates enable row level security;
drop policy if exists form_templates_authenticated_all on public.form_templates;
create policy form_templates_authenticated_all on public.form_templates for all to authenticated using (true) with check (true);
drop policy if exists form_templates_anon_none on public.form_templates;
create policy form_templates_anon_none on public.form_templates for all to anon using (false) with check (false);

alter table public.form_template_fields enable row level security;
drop policy if exists form_template_fields_authenticated_all on public.form_template_fields;
create policy form_template_fields_authenticated_all on public.form_template_fields for all to authenticated using (true) with check (true);
drop policy if exists form_template_fields_anon_none on public.form_template_fields;
create policy form_template_fields_anon_none on public.form_template_fields for all to anon using (false) with check (false);

alter table public.form_instances enable row level security;
drop policy if exists form_instances_authenticated_all on public.form_instances;
create policy form_instances_authenticated_all on public.form_instances for all to authenticated using (true) with check (true);
drop policy if exists form_instances_anon_none on public.form_instances;
create policy form_instances_anon_none on public.form_instances for all to anon using (false) with check (false);

alter table public.form_instance_fields enable row level security;
drop policy if exists form_instance_fields_authenticated_all on public.form_instance_fields;
create policy form_instance_fields_authenticated_all on public.form_instance_fields for all to authenticated using (true) with check (true);
drop policy if exists form_instance_fields_anon_none on public.form_instance_fields;
create policy form_instance_fields_anon_none on public.form_instance_fields for all to anon using (false) with check (false);

-- ─── Private form-photos Storage bucket + 4 authenticated policies ──────────
-- Mirrors reface-photos (private, authenticated-only). Photos land in slice 3;
-- standing the bucket up now keeps the schema slice self-contained.
insert into storage.buckets (id, name, public)
values ('form-photos', 'form-photos', false)
on conflict (id) do nothing;

drop policy if exists form_photos_bucket_read   on storage.objects;
drop policy if exists form_photos_bucket_insert on storage.objects;
drop policy if exists form_photos_bucket_update on storage.objects;
drop policy if exists form_photos_bucket_delete on storage.objects;

create policy form_photos_bucket_read on storage.objects
  for select to authenticated using (bucket_id = 'form-photos');
create policy form_photos_bucket_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'form-photos');
create policy form_photos_bucket_update on storage.objects
  for update to authenticated using (bucket_id = 'form-photos') with check (bucket_id = 'form-photos');
create policy form_photos_bucket_delete on storage.objects
  for delete to authenticated using (bucket_id = 'form-photos');

-- ─── Seed the 3 starter templates ───────────────────────────────────────────
-- Pre-Install + Shop-Drawing Review are is_default (auto-attach to new jobs in
-- slice 2). Fixed UUIDs so the seed is idempotent and the e2e/seed scripts can
-- reference them. Fields are section + checkbox only (this slice's field types).

insert into public.form_templates (id, name, description, phase, is_default, active, sort_order)
values
  ('f0000000-0000-4000-8000-000000000001', 'Pre-Install Check',
   'Does the installer have every part and fastener for the job?', 'install', true, true, 0),
  ('f0000000-0000-4000-8000-000000000002', 'Design Intake',
   'Everything needed from the designer / customer before we start.', 'design', false, true, 1),
  ('f0000000-0000-4000-8000-000000000003', 'Shop-Drawing Review',
   'Verify the shop drawings before cutting.', 'cnc_cut', true, true, 2)
on conflict (id) do nothing;

insert into public.form_template_fields (id, template_id, label, type, config, sort_order)
values
  -- Pre-Install Check
  ('fa000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'Hardware', 'section',   '{}'::jsonb, 0),
  ('fa000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'Hinges packed', 'checkbox', '{}'::jsonb, 1),
  ('fa000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'Drawer slides packed', 'checkbox', '{}'::jsonb, 2),
  ('fa000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 'Fasteners + shims', 'checkbox', '{}'::jsonb, 3),
  ('fa000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000001', 'Cabinets', 'section',   '{}'::jsonb, 4),
  ('fa000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000001', 'All boxes loaded', 'checkbox', '{}'::jsonb, 5),
  ('fa000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000001', 'Doors + drawer fronts loaded', 'checkbox', '{}'::jsonb, 6),
  -- Design Intake
  ('fa000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000002', 'Scope', 'section', '{}'::jsonb, 0),
  ('fa000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000002', 'Final dimensions confirmed', 'checkbox', '{}'::jsonb, 1),
  ('fa000000-0000-4000-8000-000000000013', 'f0000000-0000-4000-8000-000000000002', 'Door style + finish selected', 'checkbox', '{}'::jsonb, 2),
  ('fa000000-0000-4000-8000-000000000014', 'f0000000-0000-4000-8000-000000000002', 'Appliance specs received', 'checkbox', '{}'::jsonb, 3),
  -- Shop-Drawing Review
  ('fa000000-0000-4000-8000-000000000021', 'f0000000-0000-4000-8000-000000000003', 'Pre-cut checks', 'section', '{}'::jsonb, 0),
  ('fa000000-0000-4000-8000-000000000022', 'f0000000-0000-4000-8000-000000000003', 'Dimensions match the plan', 'checkbox', '{}'::jsonb, 1),
  ('fa000000-0000-4000-8000-000000000023', 'f0000000-0000-4000-8000-000000000003', 'Material + edgeband called out', 'checkbox', '{}'::jsonb, 2),
  ('fa000000-0000-4000-8000-000000000024', 'f0000000-0000-4000-8000-000000000003', 'Hardware bores located', 'checkbox', '{}'::jsonb, 3)
on conflict (id) do nothing;
