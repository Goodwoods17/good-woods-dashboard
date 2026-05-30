-- Workspace settings: a single-row table holding editable workspace config
-- (company identity, tax rate, labour rates, default markup/overhead, delivery
-- defaults). Stored as one jsonb blob keyed by a fixed id so the shape can
-- evolve in TS without a migration each time. Retires localStorage-only
-- "gw_workspace_settings_v1" (kept as a fallback when Supabase is absent).

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.workspace_settings (
  id text primary key default 'singleton',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.workspace_settings is
  'Single-row workspace config (company, tax, labour rates, defaults) as jsonb';

drop trigger if exists workspace_settings_set_updated_at on public.workspace_settings;
create trigger workspace_settings_set_updated_at
  before update on public.workspace_settings
  for each row execute function public.set_updated_at();

alter table public.workspace_settings enable row level security;

drop policy if exists "workspace_settings_authenticated_all" on public.workspace_settings;
create policy "workspace_settings_authenticated_all"
  on public.workspace_settings for all
  to authenticated using (true) with check (true);

drop policy if exists "workspace_settings_anon_none" on public.workspace_settings;
create policy "workspace_settings_anon_none"
  on public.workspace_settings for all
  to anon using (false) with check (false);
