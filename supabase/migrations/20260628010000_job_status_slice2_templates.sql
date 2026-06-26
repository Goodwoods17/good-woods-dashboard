-- Job Status slice 2: seed phase_step_templates with the starter SOP step set.
-- These are the standard operating procedure (SOP) steps for a custom cabinet
-- shop: brief → approval (Design), sheet goods → QC (CNC), glue-up → QC
-- (Assembly), sand → cure (Finishing), pack → sign-off (Delivery), site prep
-- → walkthrough (Install).
--
-- Fixed-prefix UUIDs make this idempotent across environments; ON CONFLICT
-- DO NOTHING means a replay on an already-seeded project is a safe no-op.
-- Delivery and Install are intentionally sparse: Drawings pieces (slice 4)
-- cover detailed item tracking there; these steps are lightweight check-offs.

insert into public.phase_step_templates
  (id, phase, label, sort_order, default_visibility, active)
values
  -- Design (3 steps: brief → drawings reviewed → client approval)
  ('10000000-0000-4000-a000-000000000001', 'design', 'Client brief received',       10, 'owner',  true),
  ('10000000-0000-4000-a000-000000000002', 'design', 'Shop drawings reviewed',      20, 'owner',  true),
  ('10000000-0000-4000-a000-000000000003', 'design', 'Design approved by client',   30, 'client', true),

  -- CNC (5 steps: cut list → order → cut → label → QC)
  ('10000000-0000-4000-a000-000000000011', 'cnc', 'Cut list prepared',              10, 'owner', true),
  ('10000000-0000-4000-a000-000000000012', 'cnc', 'Sheet goods ordered',            20, 'owner', true),
  ('10000000-0000-4000-a000-000000000013', 'cnc', 'Parts cut',                      30, 'owner', true),
  ('10000000-0000-4000-a000-000000000014', 'cnc', 'Parts labeled',                  40, 'owner', true),
  ('10000000-0000-4000-a000-000000000015', 'cnc', 'Parts QC checked',               50, 'owner', true),

  -- Assembly (5 steps: carcass → doors → drawers → hardware → QC)
  ('10000000-0000-4000-a000-000000000021', 'assembly', 'Carcass glued up',          10, 'owner', true),
  ('10000000-0000-4000-a000-000000000022', 'assembly', 'Doors fitted',              20, 'owner', true),
  ('10000000-0000-4000-a000-000000000023', 'assembly', 'Drawers fitted',            30, 'owner', true),
  ('10000000-0000-4000-a000-000000000024', 'assembly', 'Hardware installed',        40, 'owner', true),
  ('10000000-0000-4000-a000-000000000025', 'assembly', 'Assembly QC passed',        50, 'owner', true),

  -- Finishing (5 steps: sand → seal → topcoat → cure → QC)
  ('10000000-0000-4000-a000-000000000031', 'finishing', 'Sanded',                   10, 'owner', true),
  ('10000000-0000-4000-a000-000000000032', 'finishing', 'Sealed',                   20, 'owner', true),
  ('10000000-0000-4000-a000-000000000033', 'finishing', 'Top coat applied',         30, 'owner', true),
  ('10000000-0000-4000-a000-000000000034', 'finishing', 'Cured',                    40, 'owner', true),
  ('10000000-0000-4000-a000-000000000035', 'finishing', 'Finishing QC passed',      50, 'owner', true),

  -- Delivery (4 steps: pack → load → deliver → sign-off; pieces cover detail)
  ('10000000-0000-4000-a000-000000000041', 'delivery', 'Packed for delivery',       10, 'owner', true),
  ('10000000-0000-4000-a000-000000000042', 'delivery', 'Loaded on truck',           20, 'owner', true),
  ('10000000-0000-4000-a000-000000000043', 'delivery', 'Delivered to site',         30, 'both',  true),
  ('10000000-0000-4000-a000-000000000044', 'delivery', 'Delivery signed off',       40, 'both',  true),

  -- Install (5 steps: site prep → position → level → adjust → walkthrough)
  ('10000000-0000-4000-a000-000000000051', 'install', 'Site prepped',              10, 'owner', true),
  ('10000000-0000-4000-a000-000000000052', 'install', 'Cabinets positioned',       20, 'owner', true),
  ('10000000-0000-4000-a000-000000000053', 'install', 'Leveled and secured',       30, 'owner', true),
  ('10000000-0000-4000-a000-000000000054', 'install', 'Hardware adjusted',         40, 'owner', true),
  ('10000000-0000-4000-a000-000000000055', 'install', 'Client walkthrough done',   50, 'both',  true)
on conflict (id) do nothing;
