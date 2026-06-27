-- Scheduling & Client-Commitment Engine — S18: client schedule portal share
-- links (issue #106, ADR 0020). A tokenized, READ-ONLY, no-login client view of
-- ONE job's schedule (milestone stepper, % done, next step, soft mid-phase
-- ranges + one FIRM install day, "On track"). Reuses the Forms P2 token pattern:
-- an opaque random token is the only key, no expiry, reusable until manually
-- revoked (`revoked_at`). The public route reads it via the SERVICE ROLE scoped
-- to the one job behind the token (src/app/s/[token]/) — the anon client never
-- touches this table (the *_anon_none policy denies it entirely).
--
-- `committed_date_snapshot` records the committed install date as it stood when
-- the link was minted. The client view stays "On track" until the LIVE install
-- date diverges from this snapshot, at which point it flips to "Date updated" —
-- the firm promise never silently changes under the client. Buffer / internal
-- targets / fever chart are NEVER carried to the public page.
--
-- All changes are ADDITIVE. Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in
-- prod). jobs.id is TEXT in this project (not uuid) — the FK column matches.

create table if not exists public.schedule_share_links (
  id                       uuid primary key default gen_random_uuid(),
  job_id                   text not null references public.jobs(id) on delete cascade,
  token                    text not null unique,        -- opaque random, >=32 chars; the only key
  recipient_name           text,
  committed_date_snapshot  date not null,               -- committed install at mint time
  viewed_at                timestamptz,
  revoked_at               timestamptz,
  created_at               timestamptz not null default now(),
  created_by               text
);

create index if not exists schedule_share_links_job_idx
  on public.schedule_share_links (job_id);
create unique index if not exists schedule_share_links_token_idx
  on public.schedule_share_links (token);

comment on table public.schedule_share_links is
  'S18: tokenized read-only client schedule portal links. One opaque token per share = a no-login view of ONE job''s schedule. committed_date_snapshot freezes the install date promised at mint time so the client view flips to "Date updated" only when the firm date actually moves. Read via service role scoped by token; anon is denied entirely.';

-- ─── RLS: canonical *_authenticated_all + *_anon_none ───────────────────────
alter table public.schedule_share_links enable row level security;

drop policy if exists schedule_share_links_authenticated_all on public.schedule_share_links;
create policy schedule_share_links_authenticated_all on public.schedule_share_links
  for all to authenticated using (true) with check (true);

drop policy if exists schedule_share_links_anon_none on public.schedule_share_links;
create policy schedule_share_links_anon_none on public.schedule_share_links
  for all to anon using (false) with check (false);

-- Reload PostgREST schema cache so the new table is queryable now.
notify pgrst, 'reload schema';
