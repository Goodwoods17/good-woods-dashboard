-- QBO-H2 (issue #185): RLS least-privilege on the encrypted-token tables.
--
-- The original QBO migrations granted `FOR ALL TO authenticated USING (true)`
-- on three tables that hold (or reference) AES-256-GCM-encrypted OAuth tokens:
--   • quickbooks_connection (20260709…:58-60) — the encrypted refresh/access
--     token ciphertext itself,
--   • quickbooks_links      (20260710…:71-73) — the realm/id mapping, and
--   • qbo_push_attempts     (20260712…:92-94) — push audit log.
--
-- That `USING (true)` grant let ANY logged-in browser session read the
-- encrypted_refresh_token / encrypted_access_token ciphertext straight off the
-- anon REST API (`select(*)`). It is pure attack surface: every legitimate read
-- and write of these tables is server-side through getServiceRoleClient
-- (@shared/lib/serviceClient), which uses the service-role key and BYPASSES RLS
-- entirely. No browser/client component ever queries these tables directly
-- (verified: all references live in features/invoices/lib/*Server.ts).
--
-- Fix (least-privilege): drop the over-permissive `authenticated` policy on all
-- three tables so the authenticated role has NO permissive policy and RLS denies
-- every row. Keep the existing `anon USING (false)` deny. Belt-and-suspenders:
-- REVOKE the default table privileges Supabase grants to anon + authenticated so
-- a stray query gets `permission denied` rather than a silent empty result.
-- Service-role access is unaffected (it bypasses both GRANTs-via-RLS and RLS).
--
-- ADDITIVE + IDEMPOTENT: no DROP TABLE / DROP COLUMN / data mutation. Uses
-- DROP POLICY IF EXISTS + REVOKE (no-op when already revoked), so it is safe to
-- replay from zero and safe to re-apply. Apply to prod is a manual go-live step.

-- 1. quickbooks_connection — holds the token ciphertext (the highest-value row).
DROP POLICY IF EXISTS quickbooks_connection_authenticated_all
  ON public.quickbooks_connection;
REVOKE ALL ON public.quickbooks_connection FROM anon, authenticated;

-- 2. quickbooks_links — realm + id mapping (no ciphertext, still owner-only).
DROP POLICY IF EXISTS quickbooks_links_authenticated_all
  ON public.quickbooks_links;
REVOKE ALL ON public.quickbooks_links FROM anon, authenticated;

-- 3. qbo_push_attempts — push audit log (request/response bodies; owner-only).
DROP POLICY IF EXISTS qbo_push_attempts_authenticated_all
  ON public.qbo_push_attempts;
REVOKE ALL ON public.qbo_push_attempts FROM anon, authenticated;

-- The `*_anon_none` policies (FOR ALL TO anon USING (false)) are intentionally
-- left in place: with RLS enabled and no permissive policy for authenticated,
-- both anon and authenticated are now fully denied at the row level, and the
-- REVOKEs deny at the privilege level too. Service-role (server) keeps full
-- access via RLS bypass.
