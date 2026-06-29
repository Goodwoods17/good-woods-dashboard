# 22. Generalized `share_tokens` capability registry

Date: 2026-06-29
Status: Accepted (lands with the S1 tracer PR, milestone #12)

## Context

No-login "capability link" portals already exist **twice**, sharing one column
contract and one read helper:

- **Forms** — `form_share_links` (anchor: `form_instances`), the `/f/[token]`
  fill portal. **Live in prod, unflagged**, write-heavy (stamps `started_at` /
  `submitted_at` / `progress` / `submit_ip` / `submit_user_agent`), with a
  per-recipient `locked_field_ids` server-enforced lock list. Tokens are
  **no-expiry**, reusable until `revoked_at` (save-and-resume depends on it).
- **Scheduling** — `schedule_share_links` (anchor: `jobs`), the `/s/[token]`
  read-only client portal + ICS feed. **Dark in prod** (behind
  `NEXT_PUBLIC_SCHEDULING_ENABLED`, off). Carries `committed_date_snapshot`.

Both are read through the generic `shared/lib/capabilityLink.ts` →
`loadCapabilityRow(sb, table, token)` (select-by-token → revoked check →
best-effort first-view `viewed_at` stamp, service-role only). The public read
path never touches the anon client: an opaque token scopes a **service-role**
read to exactly one row; the table itself is `anon_none`.

Tier-2 (Project Files & Sharing) adds a third capability type (document view) and
a **fourth that writes** (designer upload portal / file request). Adding two more
per-feature `*_share_links` tables would triple a contract that is already
duplicated, and leave the shared head (`loadCapabilityRow`, the token generator)
straddling N tables.

## Decision

Introduce one generalized **`share_tokens`** capability registry and migrate the
two existing tables onto it.

**Schema** (additive migration, ships behind `NEXT_PUBLIC_PROJECT_FILES_ENABLED`
off in prod):

- **Anchors as typed *nullable* FK columns**, not a polymorphic text id:
  `form_instance_id` → `form_instances(id)`, `job_id` → `jobs(id)` (TEXT — `jobs.id`
  is text), `document_id` → `documents(id)`. **Each `ON DELETE CASCADE`.** A
  `capability_type` discriminator (`document_view | document_request | form |
  schedule`, validated in TS) + a CHECK that **exactly one anchor is set** per row.
  _(This reverses an earlier in-grill idea to use a generic `resource_type` +
  `resource_id` text pair — see Consequences: that would have dropped the cascade
  integrity the live FKs depend on and lost token-type safety.)_
- **Shared typed columns** the generic contract reads by name: `token` (one
  **global** unique index, ≥32-byte opaque base64url), `recipient_name`,
  `viewed_at`, `revoked_at`, `expires_at` (**NULL = never**), `view_count`, audit
  `ip` / `ua`, `created_at` / `created_by`.
- **`state` jsonb** for type-specific fields (`locked_field_ids`,
  `committed_date_snapshot`, `progress`, requested-files, notification prefs).
  The DB-level guards lost in the move to jsonb are re-added: a CHECK equivalent
  for `progress` (0..100) and a non-null default for `locked_field_ids` (it is the
  server-side security gate, not cosmetic).

**Read path:** generalize `loadCapabilityRow` to take a `capability_type` and
filter on it (a global token table means a `/f` token query could otherwise
return a schedule row → wrong-type cast); assert the loaded row's type before
casting. Preserve the existing `stampView` semantics exactly (Forms always stamps
`viewed_at`; the ICS feed passes `false` so calendar polls don't masquerade as a
human open). Expiry is **opt-in**; NULL means never and retrofitted rows backfill
NULL — no existing `/f` link may ever silently expire.

**Retrofit (dual-write, never big-bang):**

1. Migrate the **Scheduling** side first — it is dark in prod, so it rehearses the
   mechanics against zero live traffic.
2. Then **Forms** (the real risk): **dual-write both tables** for the whole
   overlap window (answers of record stay in `form_instance_fields`, unchanged;
   only the share-link stamps are dual-homed), mirror writes back so the owner
   status pill (which reads once at mount, no realtime resync) cannot diverge,
   **row-for-row verify** all stamp columns, and flip read **and** write in the
   **same** deploy. Deprecate the old tables only after the verify passes.
3. Consolidate the two byte-identical token generators (`generateShareToken`,
   `generateCapabilityToken`) into one in `shared/lib`.

`import "server-only"` is added to the service client and every `*Server` module
so an accidental client import is a build error, not a silent `null`.

## Consequences

- **Positive:** one rail for every no-login capability (view, upload, form,
  schedule); new capability types are a `capability_type` value + a `state` shape,
  not a new table; the shared head stops straddling N tables.
- **Cost / risk:** the Forms retrofit mutates a **live, unflagged** feature — the
  highest-risk slice in the milestone (mitigated by dual-write + mirror + verify +
  same-deploy cutover, rehearsed on the dark Scheduling side first).
- **Integrity preserved deliberately:** keeping real nullable FK columns (not a
  generic text `resource_id`) retains `ON DELETE CASCADE` cleanup and lets
  `loadCapabilityRow` reject a foreign-type token; the trade is a wider, sparser
  table and a CHECK to enforce exactly-one-anchor.
- **Guards moved to app+CHECK:** `progress` range and `locked_field_ids`
  non-null move from dedicated columns into jsonb + re-added CHECK/default; the
  security-critical lock-list enforcement stays server-side in the `/f` route.
- **Single-tenant unchanged:** the table is `anon_none`; public reads remain
  service-role-scoped-by-token, never an anon RLS policy.

## What S1 (the tracer) actually lands

The registry + the rails, **no UI** (NO read/write of the new table in any route
yet — that is S2+):

- Migration `20260715000000_share_tokens.sql` — the table, the global-unique token
  index, the anchor indexes, the exactly-one-anchor + progress + locked-field-ids
  CHECKs, and canonical `authenticated_all` + `anon_none` RLS. Additive; the live
  `form_share_links` / `schedule_share_links` are untouched.
- `loadCapabilityRow` generalized: optional `capabilityType` filter **and**
  pre-cast type assertion; opt-in `expires_at` (NULL = never); `stampView`
  semantics preserved (the legacy `/f` + `/s` callers pass no `capabilityType`,
  so their behaviour is byte-for-byte unchanged; the generalized `expired` reason
  collapses to `not_found` at those two boundaries).
- The token generator consolidated to one home (`shared/lib/capabilityToken.ts`);
  Forms' `generateShareToken` and `shared/lib/utils` re-export it.
- `SHARE_TOKENS_TABLE` constant, the `ShareToken` / `CapabilityType` types, and
  the `shareTokensRowMap` (row ↔ domain, with the lost-in-jsonb defaults re-added).
- `NEXT_PUBLIC_PROJECT_FILES_ENABLED` flag helper (`projectFilesEnabled()`).
- `import "server-only"` on the service client + every `*Server` module.

## Related

- ADR 0017 — trunk-based vertical slices behind feature flags (how the migration
  ships dark).
- ADR 0020 — scheduling dual-dates & client commitment (origin of
  `schedule_share_links` + the `/s` portal).
- ADR 0016 — active drawings in Supabase / signed-URL private-bucket model
  (relevant when share tokens expose files).
- `features/forms/CLAUDE.md` — the original Forms token model + `locked_field_ids`
  enforcement.
- ADR 0023 — `job_piece_pins` (the other Tier-2 schema decision).
