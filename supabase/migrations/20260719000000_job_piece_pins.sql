-- Project Files & Sharing (Tier-2) · S8a — promote the single embedded pin
-- (job_pieces.pin_*) into a dedicated `job_piece_pins` table: N located pins per
-- piece, exactly one is_primary, real FK to documents. ADR 0023.
--
-- This is STEP 1 of the strict 3-step pins-promotion order — BUILD + BACKFILL
-- ONLY. **No column drop here.** S8b refactors the mapper + write sites and
-- deploys; S8c drops the four `job_pieces.pin_*` columns once that is live.
--
-- DUAL-READ during the overlap: the old `job_pieces.pin_*` columns stay
-- populated and every existing read keeps working; nothing reads the new table
-- until S8b wires the overlay. This migration is purely ADDITIVE and safe to run
-- against the LIVE Drawings + job-status features.
--
-- Why the FK can't be added naively (pre-mortem CRITICAL): `documents.id` is
-- **uuid** but `job_pieces.pin_document_id` is bare **text** with no FK, and
-- documents are hard-deleted with no null-out of referencing pieces — so some
-- `pin_document_id` values are orphans (or, in the localStorage-fallback era,
-- not even valid uuid text). The backfill therefore (a) casts `::uuid` only for
-- values that match the uuid shape (a CASE short-circuits the cast so a stray
-- non-uuid string can't abort the whole INSERT), and (b) inner-joins `documents`
-- so orphaned references are dropped, never carried into the new table. The FK
-- is then added `NOT VALID` and `VALIDATE`d separately (cheap, lock-friendly,
-- and the canonical add-FK-to-live-data move).

-- ─── Table ──────────────────────────────────────────────────────────────────
-- document_id is created WITHOUT an inline FK so the constraint can be added
-- NOT VALID → VALIDATE after the orphan-clean backfill (see below).
create table if not exists public.job_piece_pins (
  id            uuid primary key default gen_random_uuid(),
  job_piece_id  uuid not null references public.job_pieces(id) on delete cascade,
  document_id   uuid not null,
  page          int,
  x             numeric,
  y             numeric,
  role          text,                                   -- plan | elevation | section | detail | other (validated in TS)
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    text
);

-- Exactly one primary pin per piece — the primary preserves every current
-- single-pin behaviour (the checklist marker, the jump-to-it-on-the-drawing
-- target). A partial unique index is the right tool: non-primary pins are
-- unconstrained, primaries are unique per piece.
create unique index if not exists job_piece_pins_primary_idx
  on public.job_piece_pins (job_piece_id) where is_primary;

create index if not exists job_piece_pins_piece_idx    on public.job_piece_pins (job_piece_id);
create index if not exists job_piece_pins_document_idx  on public.job_piece_pins (document_id);

-- ─── Backfill (orphan-clean, ::uuid cast) ────────────────────────────────────
-- Each piece that currently carries a pin becomes ONE is_primary pin. The CASE
-- guards the `::uuid` cast (Postgres short-circuits CASE, so a malformed
-- pin_document_id yields NULL instead of aborting the statement); the inner JOIN
-- to documents then drops orphans (and the NULLs from the CASE), so only valid
-- references land — exactly what the subsequent VALIDATE expects.
with candidates as (
  select
    p.id as job_piece_id,
    case
      when p.pin_document_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then p.pin_document_id::uuid
    end as document_id,
    p.pin_page,
    p.pin_x,
    p.pin_y,
    p.created_at,
    p.created_by
  from public.job_pieces p
  where p.pin_document_id is not null
)
insert into public.job_piece_pins
  (job_piece_id, document_id, page, x, y, role, is_primary, created_at, created_by)
select
  c.job_piece_id,
  d.id,
  c.pin_page,
  c.pin_x,
  c.pin_y,
  null,
  true,
  coalesce(c.created_at, now()),
  c.created_by
from candidates c
join public.documents d on d.id = c.document_id;

-- ─── FK NOT VALID → VALIDATE ─────────────────────────────────────────────────
-- The backfill only inserted rows with a real documents match, so VALIDATE is a
-- formality here; the two-step shape is the canonical, lock-friendly way to add
-- a FK to a live table and is what S8b/S8c (and future writers) rely on.
alter table public.job_piece_pins
  add constraint job_piece_pins_document_id_fkey
  foreign key (document_id) references public.documents(id) on delete cascade
  not valid;

alter table public.job_piece_pins
  validate constraint job_piece_pins_document_id_fkey;

comment on table public.job_piece_pins is
  'ADR 0023: located 1:N cabinet<->drawing references. Each row is one pin (a marker at normalized x/y on a (document,page)) belonging to a job_piece; a piece may have many, exactly one is_primary (partial-unique). Replaces the embedded job_pieces.pin_* columns (dropped in S8c). FK to documents ON DELETE CASCADE closes the legacy orphan gap. Realtime-published; ships behind NEXT_PUBLIC_PROJECT_FILES_ENABLED until S8b/S9 read it.';

-- ─── RLS: canonical *_authenticated_all + *_anon_none ───────────────────────
alter table public.job_piece_pins enable row level security;

drop policy if exists job_piece_pins_authenticated_all on public.job_piece_pins;
create policy job_piece_pins_authenticated_all on public.job_piece_pins
  for all to authenticated using (true) with check (true);

drop policy if exists job_piece_pins_anon_none on public.job_piece_pins;
create policy job_piece_pins_anon_none on public.job_piece_pins
  for all to anon using (false) with check (false);

-- ─── Realtime: register BEFORE any UI subscribes (DoD) ───────────────────────
alter publication supabase_realtime add table public.job_piece_pins;

-- Reload PostgREST schema cache so the new table is queryable now.
notify pgrst, 'reload schema';
