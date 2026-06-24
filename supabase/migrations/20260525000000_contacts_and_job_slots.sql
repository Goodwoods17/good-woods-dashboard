-- Contacts table + 5 typed Job FK slots (payer, designer, architect, gc, homeowner).
--
-- Replaces the derived /crm view (which grouped jobs by exact-string-match on
-- jobs.client) with a real contacts table. The 6 distinct jobs.client values in
-- production are backfilled inline with curated kind + role_tags + the Raubyn
-- anchor flag. Each job's payer_id is linked, then payer_id is set NOT NULL.
--
-- The auto-update trigger bumps contacts.last_touched_at = now() whenever any
-- job referencing that contact in its 5 slot FKs is inserted or updated. A
-- manual "Touched today" button in the UI does the same UPDATE for
-- relationship-touches not tied to a job (the coffee-with-Raubyn case).
--
-- Apply with: mcp__supabase__apply_migration. ON DELETE RESTRICT on payer_id is
-- intentional: re-tag jobs before deleting a payer contact.

-- ---------------------------------------------------------------------------
-- 1. contacts table
-- ---------------------------------------------------------------------------

CREATE TABLE public.contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL CHECK (kind IN ('person', 'org')),
  parent_id         uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  name              text NOT NULL,
  role_tags         text[] NOT NULL DEFAULT '{}',
  emails            jsonb NOT NULL DEFAULT '[]',
  phones            jsonb NOT NULL DEFAULT '[]',
  address           text,
  website           text,
  notes             text,
  introduced_by_id  uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  is_anchor         boolean NOT NULL DEFAULT false,
  last_touched_at   timestamptz,
  follow_up_at      date,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.contacts                  IS 'People and orgs. Linked to jobs via 5 typed FK slots on public.jobs.';
COMMENT ON COLUMN public.contacts.kind             IS 'person | org';
COMMENT ON COLUMN public.contacts.parent_id        IS 'Self-FK: people belong to orgs.';
COMMENT ON COLUMN public.contacts.role_tags        IS 'Multi-select: designer | architect | gc | homeowner. Validated in TS, not DB.';
COMMENT ON COLUMN public.contacts.introduced_by_id IS 'Self-FK: who referred this contact to us.';
COMMENT ON COLUMN public.contacts.is_anchor        IS 'Strategic relationships (Raubyn, etc.). Pinned in /crm and surfaced in briefing when stale.';
COMMENT ON COLUMN public.contacts.last_touched_at  IS 'Bumped by trigger on any job INSERT/UPDATE referencing this contact, or manually via /crm/[id] "Touched today".';
COMMENT ON COLUMN public.contacts.archived_at      IS 'Soft delete. NULL = active.';

CREATE INDEX idx_contacts_parent       ON public.contacts(parent_id)         WHERE parent_id IS NOT NULL;
CREATE INDEX idx_contacts_intro        ON public.contacts(introduced_by_id)  WHERE introduced_by_id IS NOT NULL;
CREATE INDEX idx_contacts_anchor       ON public.contacts(is_anchor)         WHERE is_anchor = true;
CREATE INDEX idx_contacts_last_touched ON public.contacts(last_touched_at);
CREATE INDEX idx_contacts_role_tags    ON public.contacts USING GIN (role_tags);
CREATE INDEX idx_contacts_active       ON public.contacts(archived_at)       WHERE archived_at IS NULL;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_all ON public.contacts FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. Job FK slots
-- ---------------------------------------------------------------------------

ALTER TABLE public.jobs
  ADD COLUMN payer_id      uuid REFERENCES public.contacts(id) ON DELETE RESTRICT,
  ADD COLUMN designer_id   uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN architect_id  uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN gc_id         uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN homeowner_id  uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.jobs.payer_id     IS 'The billable party. Required after backfill.';
COMMENT ON COLUMN public.jobs.designer_id  IS 'Optional. The designer who specified the work (anchor leverage tracking).';
COMMENT ON COLUMN public.jobs.architect_id IS 'Optional.';
COMMENT ON COLUMN public.jobs.gc_id        IS 'Optional. The general contractor.';
COMMENT ON COLUMN public.jobs.homeowner_id IS 'Optional. End-user homeowner if distinct from payer.';

-- ---------------------------------------------------------------------------
-- 3. Backfill 6 contacts from existing jobs.client values
-- ---------------------------------------------------------------------------

WITH inserted AS (
  INSERT INTO public.contacts (kind, name, role_tags, is_anchor) VALUES
    ('person', 'Anika Patel',          ARRAY['homeowner'],  false),
    ('person', 'Linda Smith',          ARRAY['homeowner'],  false),
    ('org',    'Raubyn Design Studio', ARRAY['designer'],   true),
    ('org',    'SayWell Developments', ARRAY['gc'],         false),
    ('org',    'Kitchencraft Trade',   ARRAY[]::text[],     false),
    ('org',    'Toolpath Workshop',    ARRAY[]::text[],     false)
  RETURNING id, name
)
UPDATE public.jobs
   SET payer_id = inserted.id
  FROM inserted
 WHERE public.jobs.client = inserted.name;

ALTER TABLE public.jobs ALTER COLUMN payer_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. last_touched_at auto-update trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bump_contact_last_touched()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.contacts
     SET last_touched_at = now()
   WHERE id IN (NEW.payer_id, NEW.designer_id, NEW.architect_id, NEW.gc_id, NEW.homeowner_id)
     AND id IS NOT NULL;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_jobs_bump_contact_last_touched
  AFTER INSERT OR UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_contact_last_touched();

-- ---------------------------------------------------------------------------
-- 5. Reload PostgREST schema cache
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
