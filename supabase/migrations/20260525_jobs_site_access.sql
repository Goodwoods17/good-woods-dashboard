-- Site & access intel for the install crew. Single jsonb column on jobs
-- mirroring the existing pattern (costs / invoice / activity are also
-- jsonb). Schema-less inside; the TS shape (SiteAccess in
-- shared/lib/types.ts) is the source of truth. Fields include
-- buzzer/door/lockbox codes, parking notes, building access notes,
-- pet info, on-site backup contact, elevator + demo flags, photos
-- URL, and the best contact window.
--
-- The InstallCard component (features/installer/components/InstallCard.tsx)
-- surfaces a conditional pill strip from this column so installers see
-- the day-of intel right when they pick up the project for the day.

ALTER TABLE public.jobs
  ADD COLUMN site_access jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.jobs.site_access IS
  'Install-day intel: codes, parking, pet, on-site contact, building access. Shape lives in TS as SiteAccess.';

NOTIFY pgrst, 'reload schema';
