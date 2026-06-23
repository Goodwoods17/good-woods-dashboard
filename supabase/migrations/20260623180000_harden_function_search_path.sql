-- Harden the 5 SECURITY-advisor-flagged functions by pinning an empty
-- search_path (lint 0011_function_search_path_mutable). All five reference only
-- fully-qualified objects (public.contacts, public.catalog_offers) or built-ins
-- (now()), so an empty search_path is safe and changes no behaviour — it just
-- removes the role-mutable-search_path attack surface.

alter function public.set_updated_at() set search_path = '';
alter function public.tg_jobs_touch_updated() set search_path = '';
alter function public.tg_reface_projects_touch_updated() set search_path = '';
alter function public.bump_contact_last_touched() set search_path = '';
alter function public.set_preferred_offer(text, uuid) set search_path = '';
