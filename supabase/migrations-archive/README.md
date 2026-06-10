# Archived migrations

SQL files that were written but **never applied** to the live database,
kept here for history and out of the `supabase/migrations/` run path so a
fresh `supabase db reset` doesn't execute them.

- **`20260524_catalog_v2.sql.superseded`** — an early "catalog v2" schema
  (`gw_catalog`, `gw_cabinet_types`, `gw_price_history`,
  `gw_estimate_templates`). Never applied; nothing in the code referenced
  those tables. Its good ideas (price history, cabinet-type minutes) were
  folded into the live schema by `20260609120000_catalog_library.sql`,
  which builds on the `catalog_*` tables that actually shipped.
