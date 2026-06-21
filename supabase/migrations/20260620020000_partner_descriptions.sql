-- Partners → job-description fields (Phase 1 review).
--
-- Andrew wants a "job description" at both levels: per person (what that person
-- does, e.g. the countertop installer's scope) and per company. Additive.

alter table public.partner_people add column if not exists description text;
comment on column public.partner_people.description is 'Free-text job description for this person (what they do / their scope).';

alter table public.subtrades add column if not exists description text;
comment on column public.subtrades.description is 'What this subtrade does for us (company-level job description).';

alter table public.catalog_suppliers add column if not exists description text;
comment on column public.catalog_suppliers.description is 'What this supplier specialises in (company-level description).';

notify pgrst, 'reload schema';
