-- API-role table grants for the public schema.
--
-- WHY: Hosted Supabase grants DML on public tables to anon / authenticated /
-- service_role via its project bootstrap, and RLS does the actual gating. Our
-- migrations never encoded those grants, so a from-zero replay (CI e2e, fresh
-- `supabase start`, branch DBs) ends up with ONLY the implicit
-- REFERENCES/TRIGGER/TRUNCATE privileges — no SELECT/INSERT/UPDATE/DELETE. The
-- app's authenticated reads then 403 and no data renders, even though prod works
-- fine. This migration makes a from-zero replay match prod.
--
-- SAFE IN PROD: prod already holds these exact grants, so re-granting is a no-op.
-- Security is unchanged: RLS policies remain the boundary (anon is still denied
-- every row by the existing *_anon_none policies regardless of these base grants).

-- Existing objects.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- Future objects created by later migrations (so the gap can't reappear).
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
