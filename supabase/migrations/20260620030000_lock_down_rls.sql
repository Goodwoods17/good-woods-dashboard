-- Lock down RLS → authenticated-only on the tables that were still open.
--
-- The middleware already redirects un-authenticated users to /login, but RLS is
-- the real boundary: the anon key ships in the browser bundle, so any table with
-- a `public`/`anon = true` policy is readable directly via the REST API, login
-- screen or not. These older tables predate the authenticated-only pattern the
-- catalog/labour/partners tables use; this brings them in line.
--
-- Safe: every page is behind login (middleware), the browser client sends the
-- user JWT once signed in, and the briefing generator writes with the service
-- role (which bypasses RLS). No app-code change needed.

-- helper note: each table gets the standard pair —
--   <t>_authenticated_all : authenticated, ALL, using(true) with check(true)
--   <t>_anon_none         : anon, ALL, using(false)

-- ─── contacts (the client list) ─────────────────────────────────────────
alter table public.contacts enable row level security;
drop policy if exists "contacts_all" on public.contacts;
drop policy if exists "contacts_authenticated_all" on public.contacts;
create policy "contacts_authenticated_all" on public.contacts for all to authenticated using (true) with check (true);
drop policy if exists "contacts_anon_none" on public.contacts;
create policy "contacts_anon_none" on public.contacts for all to anon using (false) with check (false);

-- ─── jobs (projects + revenue) ──────────────────────────────────────────
alter table public.jobs enable row level security;
drop policy if exists "anon read jobs" on public.jobs;
drop policy if exists "anon insert jobs" on public.jobs;
drop policy if exists "anon update jobs" on public.jobs;
drop policy if exists "anon delete jobs" on public.jobs;
drop policy if exists "jobs_authenticated_all" on public.jobs;
create policy "jobs_authenticated_all" on public.jobs for all to authenticated using (true) with check (true);
drop policy if exists "jobs_anon_none" on public.jobs;
create policy "jobs_anon_none" on public.jobs for all to anon using (false) with check (false);

-- ─── documents ──────────────────────────────────────────────────────────
alter table public.documents enable row level security;
drop policy if exists "documents_all" on public.documents;
drop policy if exists "documents_authenticated_all" on public.documents;
create policy "documents_authenticated_all" on public.documents for all to authenticated using (true) with check (true);
drop policy if exists "documents_anon_none" on public.documents;
create policy "documents_anon_none" on public.documents for all to anon using (false) with check (false);

-- ─── briefings (read client-side; written by service role) ──────────────
alter table public.briefings enable row level security;
drop policy if exists "briefings_all" on public.briefings;
drop policy if exists "anon read briefings" on public.briefings;
drop policy if exists "briefings_authenticated_all" on public.briefings;
create policy "briefings_authenticated_all" on public.briefings for all to authenticated using (true) with check (true);
drop policy if exists "briefings_anon_none" on public.briefings;
create policy "briefings_anon_none" on public.briefings for all to anon using (false) with check (false);

-- ─── reface studio (projects / photos / elements) ───────────────────────
alter table public.reface_projects enable row level security;
drop policy if exists "reface_projects_all" on public.reface_projects;
drop policy if exists "reface_projects_authenticated_all" on public.reface_projects;
create policy "reface_projects_authenticated_all" on public.reface_projects for all to authenticated using (true) with check (true);
drop policy if exists "reface_projects_anon_none" on public.reface_projects;
create policy "reface_projects_anon_none" on public.reface_projects for all to anon using (false) with check (false);

alter table public.reface_photos enable row level security;
drop policy if exists "reface_photos_all" on public.reface_photos;
drop policy if exists "reface_photos_authenticated_all" on public.reface_photos;
create policy "reface_photos_authenticated_all" on public.reface_photos for all to authenticated using (true) with check (true);
drop policy if exists "reface_photos_anon_none" on public.reface_photos;
create policy "reface_photos_anon_none" on public.reface_photos for all to anon using (false) with check (false);

alter table public.reface_elements enable row level security;
drop policy if exists "reface_elements_all" on public.reface_elements;
drop policy if exists "reface_elements_authenticated_all" on public.reface_elements;
create policy "reface_elements_authenticated_all" on public.reface_elements for all to authenticated using (true) with check (true);
drop policy if exists "reface_elements_anon_none" on public.reface_elements;
create policy "reface_elements_anon_none" on public.reface_elements for all to anon using (false) with check (false);

notify pgrst, 'reload schema';
