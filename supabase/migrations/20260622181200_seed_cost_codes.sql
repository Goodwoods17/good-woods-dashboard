-- Seed the canonical cost codes (ADR 0012) into labour_operations so the unified
-- Job template's code set resolves to real code_id FKs at Save-as-Job.
--
-- Idempotent: upsert keyed by `code` (partial-unique on code, set in the
-- cost_codes_schema migration). Re-running refreshes name/phase/driver/minutes
-- without duplicating. Mirrors CANONICAL_COST_CODES in
-- features/job-costing/lib/costCodes.ts — keep the two in lockstep.
--
-- Per ADR 0012 the "cnc" phase reads as "Cut" (table saw, no in-house CNC); the
-- category id stays `cnc` for stability. Minutes mirror the estimator's
-- DEFAULT_ASSEMBLY/INSTALL_MINUTES so a fresh shop budgets == quotes.

insert into public.labour_operations
  (name, category_id, cabinet_type, default_minutes, driver_unit, code, active)
values
  ('Assemble base cabinet',            'assembly',  'base',   60, 'ea',    'ASM-BASE',    true),
  ('Assemble wall cabinet',            'assembly',  'wall',   45, 'ea',    'ASM-WALL',    true),
  ('Assemble tall cabinet',            'assembly',  'tall',   90, 'ea',    'ASM-TALL',    true),
  ('Assemble island cabinet',          'assembly',  'island', 90, 'ea',    'ASM-ISLAND',  true),
  ('Cut + edgeband sheet (table saw)', 'cnc',        null,    15, 'sheet', 'CUT-SHEET',   true),
  ('Spray finishing',                  'finishing',  null,     2, 'sqft',  'FIN-SPRAY',   true),
  ('Load / deliver cabinet',           'delivery',   null,     5, 'ea',    'DEL-LOAD',    true),
  ('Install base cabinet',             'install',   'base',   30, 'ea',    'INST-BASE',   true),
  ('Install wall cabinet',             'install',   'wall',   20, 'ea',    'INST-WALL',   true),
  ('Install tall cabinet',             'install',   'tall',   45, 'ea',    'INST-TALL',   true),
  ('Install island cabinet',           'install',   'island', 45, 'ea',    'INST-ISLAND', true),
  ('Design / drafting',                'design',     null,     0,  null,   'DSN',         true)
on conflict (code) where code is not null do update set
  name           = excluded.name,
  category_id    = excluded.category_id,
  cabinet_type   = excluded.cabinet_type,
  default_minutes = excluded.default_minutes,
  driver_unit    = excluded.driver_unit,
  active         = true;

notify pgrst, 'reload schema';
