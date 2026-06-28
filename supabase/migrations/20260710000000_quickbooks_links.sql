-- QBO S2 (issue #148): central `quickbooks_links` mapping table.
--
-- Per ADR 0010 (reaffirmed + extended by ADR 0021): when the QBO sync lands,
-- ONE central table maps a local entity → its QuickBooks id, instead of
-- scattering `qbo_*_id` columns across every table. This is a PURE ADDITION —
-- the core costing tables are untouched, exactly as ADR 0010 promised, because
-- the entity shapes already line up with QuickBooks.
--
-- A row reads: "in QuickBooks company <realm_id>, our <local_type> #<local_id>
-- IS QBO <qbo_type> #<qbo_id>". local_id is TEXT (local PKs vary — jobs.id is
-- text, others uuid — and the mapping is polymorphic, so NO foreign key).
--
-- Ships behind NEXT_PUBLIC_INVOICES_QBO_ENABLED (off in prod until flipped).
-- RLS authenticated-only + anon-none (owner-only data; the client portal and
-- anonymous sessions never touch this). Mirrors quickbooks_connection (S1).

CREATE TABLE IF NOT EXISTS public.quickbooks_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The local entity kind: 'invoice' | 'vendor' | 'job' | 'estimate' |
  -- 'customer' | 'item' | 'phase' | 'worker' (open text — new kinds need no
  -- migration). Mirrors the ADR 0010 mapping table.
  local_type    text NOT NULL,

  -- The local entity's id. TEXT because local PKs vary across the schema
  -- (jobs.id is text; invoices/contacts are uuid) and this map is polymorphic.
  local_id      text NOT NULL,

  -- The QBO object kind: 'Bill' | 'Vendor' | 'Customer' | 'Item' | 'Class' | …
  qbo_type      text NOT NULL,

  -- The QBO object id (VendorRef.value, Bill.Id, …).
  qbo_id        text NOT NULL,

  -- Which QuickBooks company (realm) this mapping belongs to. A local entity can
  -- legitimately map to different QBO ids in different companies/environments.
  realm_id      text NOT NULL,

  -- 'sandbox' | 'production' — which Intuit environment the qbo_id lives in.
  environment   text NOT NULL DEFAULT 'sandbox',

  -- Last time this mapping was confirmed against QBO (null until first sync).
  synced_at     timestamptz,

  -- The authenticated user who created the mapping (text — mirrors the
  -- created_by convention used by the scheduling + quickbooks_connection tables).
  created_by    text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- A local entity maps to exactly ONE QBO object per company. This is the
  -- upsert conflict target for the write helper.
  CONSTRAINT quickbooks_links_local_unique
    UNIQUE (realm_id, local_type, local_id)
);

-- Reverse lookup ("which local entity is QBO Vendor #99?") + dedupe guard.
CREATE INDEX IF NOT EXISTS quickbooks_links_qbo_idx
  ON public.quickbooks_links (realm_id, qbo_type, qbo_id);

COMMENT ON TABLE public.quickbooks_links IS
  'Central QuickBooks Online id mapping (QBO S2, issue #148; ADR 0021). One row '
  'maps a local entity (realm_id, local_type, local_id) to its QBO object '
  '(qbo_type, qbo_id). Pure addition per ADR 0010 — supersedes scattered '
  'qbo_*_id columns (e.g. invoices.qbo_vendor_id) as the source of truth.';

-- RLS: owner-only; anonymous (client portal) sees nothing.
ALTER TABLE public.quickbooks_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY quickbooks_links_authenticated_all
  ON public.quickbooks_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY quickbooks_links_anon_none
  ON public.quickbooks_links
  FOR ALL TO anon USING (false);
