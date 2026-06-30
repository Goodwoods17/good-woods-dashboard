-- S14 (issue #228): RLS belt-and-suspenders + verification.
--
-- The project-files audit found ZERO open offenders — every public table is
-- already gated. Three tables, however, lean on RLS *default-deny* for the anon
-- role rather than an EXPLICIT deny policy:
--   • document_annotations (20260624000000) — only document_annotations_authenticated_all
--   • job_pieces            (20260624001000) — only job_pieces_authenticated_all
--   • job_blockers          (20260623020356) — only job_blockers_auth_all
--
-- With RLS enabled and no permissive policy for anon, the anon role is already
-- denied every row. But these three tables ALSO carry the blanket base GRANT
-- (select/insert/update/delete to anon + authenticated) from the api_role_grants
-- migration (20260624002000), so the only thing standing between an anonymous
-- REST request and a row is the absence of a permissive policy. This slice adds
-- the EXPLICIT `*_anon_none` deny policy (FOR ALL TO anon USING (false)) so the
-- intent is encoded in the schema and matches the pattern the QBO + share-token
-- tables already use — belt-and-suspenders, never relying on default-deny alone.
--
-- ADDITIVE + IDEMPOTENT: pure CREATE POLICY (guarded against duplicates), no
-- DROP / re-GRANT / data mutation. Safe to replay from zero and safe to
-- re-apply. Deliberately does NOT run any blanket recreate / re-GRANT, which
-- would regress the QBO token tables' least-privilege posture (issue #185).

-- 1. document_annotations — explicit anon deny (was default-deny only).
do $$ begin
  create policy document_annotations_anon_none on public.document_annotations
    for all to anon using (false);
exception when duplicate_object then null; end $$;

-- 2. job_pieces — explicit anon deny (was default-deny only).
do $$ begin
  create policy job_pieces_anon_none on public.job_pieces
    for all to anon using (false);
exception when duplicate_object then null; end $$;

-- 3. job_blockers — explicit anon deny (was default-deny only).
do $$ begin
  create policy job_blockers_anon_none on public.job_blockers
    for all to anon using (false);
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- Post-migration assertion: the three QBO encrypted-token tables MUST stay
-- service-role-only. The least-privilege migration (20260714000000) dropped
-- their authenticated policy and REVOKEd anon + authenticated grants; this
-- belt-and-suspenders pass must NOT have regressed that. Fail the migration
-- (and therefore the whole replay / CI) if any anon/authenticated GRANT or
-- permissive policy has crept back onto them.
-- --------------------------------------------------------------------------
do $$
declare
  bad_grant text;
  bad_policy text;
begin
  -- (a) No SELECT/INSERT/UPDATE/DELETE grant to anon or authenticated.
  select t.table_name || ' -> ' || g.grantee || ' (' || g.privilege_type || ')'
    into bad_grant
  from information_schema.role_table_grants g
  join (values
    ('quickbooks_connection'),
    ('quickbooks_links'),
    ('qbo_push_attempts')
  ) as t(table_name) on t.table_name = g.table_name
  where g.table_schema = 'public'
    and g.grantee in ('anon', 'authenticated')
  limit 1;

  if bad_grant is not null then
    raise exception
      'S14 assertion failed: QBO token table still grants to a public role: %',
      bad_grant;
  end if;

  -- (b) No policy that names the authenticated role (the only legitimate
  --     surviving policy is the anon-deny `*_anon_none`, roles = {anon}).
  select p.tablename || ' -> ' || p.policyname || ' (' || array_to_string(p.roles, ',') || ')'
    into bad_policy
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('quickbooks_connection', 'quickbooks_links', 'qbo_push_attempts')
    and 'authenticated' = any (p.roles)
  limit 1;

  if bad_policy is not null then
    raise exception
      'S14 assertion failed: QBO token table still has an authenticated policy: %',
      bad_policy;
  end if;
end $$;
