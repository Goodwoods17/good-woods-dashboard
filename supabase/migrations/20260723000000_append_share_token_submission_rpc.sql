-- #268 — atomic append of a designer-upload submission to a document_request
-- share token's state.submissions.
--
-- The route (documentRequestServer.ts) previously did a READ-MODIFY-WRITE:
-- read state.submissions at load, then UPDATE state = {...state, submissions:
-- [...priorSubmissions, new]}. Two concurrent uploads on ONE token both read the
-- same stale snapshot and both write from it (last-write-wins) → a concurrent
-- upload's submission metadata is silently DROPPED (the object + documents row
-- persist, so the checklist/byte accounting drifts).
--
-- This function makes the append ATOMIC. A single-statement `||` append re-reads
-- the row under Postgres' row lock (a concurrent caller blocks, then appends onto
-- the ALREADY-updated array), so no submission is lost. It also stamps the
-- server-set audit ip/ua (never client-supplied).
--
-- SECURITY: security-definer (bypasses RLS to write the token row), so it is
-- locked to the service_role ONLY — the route calls it via the service-role
-- client. anon/authenticated must NOT be able to append to arbitrary tokens.
--
-- The route calls this best-effort (a state-write hiccup never 500s an upload
-- whose object + row already landed), so a deploy that reaches prod before this
-- migration is applied simply skips the metadata append — the pre-existing
-- best-effort behaviour — and self-heals once applied. Per-token count/byte quota
-- stays enforced by the route's pre-check (checkUploadAllowed).

create or replace function public.append_share_token_submission(
  p_token      text,
  p_submission jsonb,
  p_ip         text default null,
  p_ua         text default null
) returns void
language sql
security definer
set search_path = public
as $$
  update public.share_tokens
     set state = jsonb_set(
                   coalesce(state, '{}'::jsonb),
                   '{submissions}',
                   coalesce(
                     case
                       when jsonb_typeof(state -> 'submissions') = 'array'
                         then state -> 'submissions'
                       else '[]'::jsonb
                     end,
                     '[]'::jsonb
                   ) || jsonb_build_array(p_submission)
                 ),
         ip = coalesce(p_ip, ip),
         ua = coalesce(p_ua, ua)
   where token = p_token
     and capability_type = 'document_request';
$$;

comment on function public.append_share_token_submission is
  '#268: atomic (row-locked, single-statement ||) append of a designer-upload submission to a document_request share token''s state.submissions, so concurrent uploads on one token never drop a submission. Also stamps server-set audit ip/ua. service_role-only.';

-- Least privilege: the api_role_grants default-privileges GRANT would otherwise
-- expose EXECUTE to anon + authenticated; a security-definer function that writes
-- share_tokens must never be callable by them. Lock to service_role only.
revoke all on function public.append_share_token_submission(text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.append_share_token_submission(text, jsonb, text, text)
  to service_role;

notify pgrst, 'reload schema';
