-- Seed the 4 component cost codes (ADR 0012 grill). Idempotent upsert by code. Mirrors CANONICAL_COST_CODES.
insert into public.labour_operations
  (name, category_id, cabinet_type, default_minutes, driver_unit, code, active)
values
  ('Install insert / accessory', 'install',   null, 10, 'ea', 'INST-INSERT',  true),
  ('Install rollout / tray',     'install',   null,  8, 'ea', 'INST-ROLLOUT', true),
  ('Mount pulls / handles',      'install',   null,  4, 'ea', 'HW-PULL',      true),
  ('Fit / hang doors + fronts',  'finishing', null,  6, 'ea', 'FIT-DOOR',     true)
on conflict (code) where code is not null do update set
  name = excluded.name, category_id = excluded.category_id,
  cabinet_type = excluded.cabinet_type, default_minutes = excluded.default_minutes,
  driver_unit = excluded.driver_unit, active = true;

notify pgrst, 'reload schema';
