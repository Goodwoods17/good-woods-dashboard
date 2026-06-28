-- QBO S1 (issue #147): QuickBooks Online OAuth connection — single-shop, with the
-- refresh token stored ENCRYPTED at rest.
--
-- The riskiest assumption of the QBO sync milestone is the OAuth round-trip:
-- consent → encrypted token → QBO sandbox call. This one additive table backs
-- that tracer. Single-shop model: at most one connected QuickBooks company, so
-- the connect flow clears any prior row before inserting the fresh one.
--
-- The long-lived REFRESH token (and the short-lived access token) are stored
-- AES-256-GCM-encrypted (keyed by the server-only QBO_TOKEN_ENC_KEY); plaintext
-- never lands here. QBO rotates the refresh token roughly every 24h, so the
-- latest one is persisted on every refresh call.
--
-- Ships behind NEXT_PUBLIC_INVOICES_QBO_ENABLED (off in prod until flipped).
-- RLS authenticated-only + anon-none (owner-only data; the client portal and
-- anonymous sessions never touch this).

CREATE TABLE IF NOT EXISTS public.quickbooks_connection (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The QuickBooks company (realm) id returned on the OAuth callback. Identifies
  -- which company every subsequent Accounting API call targets.
  realm_id                    text NOT NULL,

  -- 'sandbox' | 'production'. This tracer targets the sandbox by default; the
  -- value records which Intuit environment the tokens belong to.
  environment                 text NOT NULL DEFAULT 'sandbox',

  -- Display-only company name (so the UI can show which company is wired).
  company_name                text,

  -- Encrypted token blobs (iv.tag.ciphertext, base64). NEVER plaintext.
  encrypted_refresh_token     text NOT NULL,
  encrypted_access_token      text,

  -- When the cached access token expires (drives the refresh-on-demand check).
  access_token_expires_at     timestamptz,

  -- The granted scope string (recorded for audit / least-privilege checks).
  scope                       text,

  -- The authenticated user who connected the account (owner). Text to mirror the
  -- created_by convention used by the scheduling tables.
  connected_by                text,

  connected_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quickbooks_connection IS
  'Single-shop QuickBooks Online OAuth connection (QBO S1, issue #147). Holds '
  'the AES-256-GCM-encrypted refresh + access tokens; plaintext never stored. '
  'QBO rotates the refresh token ~daily, so the latest is persisted every call.';

-- RLS: owner-only; anonymous (client portal) sees nothing.
ALTER TABLE public.quickbooks_connection ENABLE ROW LEVEL SECURITY;

CREATE POLICY quickbooks_connection_authenticated_all
  ON public.quickbooks_connection
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY quickbooks_connection_anon_none
  ON public.quickbooks_connection
  FOR ALL TO anon USING (false);
