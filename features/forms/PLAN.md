# Forms — implementation plan

Full design + rationale: `~/.claude/plans/i-want-to-create-vivid-minsky.md`.
4 shippable slices, one feature. Land each to `main` (feature-flag what isn't
ready) — never stack PRs.

## Slice 1 — Tracer (this PR, issue #32) ✅

Migration (4 tables + triggers + RLS + form-photos bucket + seed 3 templates) +
domain types + table constants + both row maps + both stores (snapshot-on-create)

- providers mounted + `/forms` listing + registry scaffold (`section` + `checkbox`)
- JobFormsTab manual-add + fill + persist (both backends).

DoD: add Pre-Install to a job → check boxes → reload → persists; tsc/lint/build
green; row-map + snapshot + registry vitests; Playwright authed smoke.

## Slice 2 — Full registry + template CRUD

Remaining non-media field types (`short_text`, `long_text`, `number`, `yes_no`,
`dropdown`, `date`) + `TemplateEditor` with dnd-kit reorder + template CRUD +
mark default/active + `attachDefaultForms(id)` on `/jobs/new` + standalone
instances.

## Slice 3 — Photo + signature

`lib/storage.ts` (`form-photos`, `data:` fallback) + `PhotoField` + `SignaturePad`
(perfect-freehand) registered.

## Slice 4 — Lock + PDF signoff ✅ SHIPPED (#35)

`lib/completion.ts` (pure gate: `isInstanceComplete` / `incompleteRequiredFields`
over the registry `isComplete`, + `signoffFileName`) · `completeInstance` /
`reopenInstance` / `setSignoffPath` on the instances store (complete stamps
`completed_at`/`completed_by` + locks read-only; reopen voids the prior
`signoff_path` PDF) · `FormSignoffDocument` (react-pdf, every field type +
embedded photo/signature `<Image>` + completed-by/signer/timestamp audit block)
· `lib/signoff.ts` (`generateSignoffPdf` — pre-resolve image URLs → `pdf().toBlob()`
→ download → upload → record path) · `FormCompletionBar` on the job Forms tab +
`/forms` standalone instances. Owner-only reopen; standalone-only (no job-gate
side effects). No schema migration needed — columns + bucket shipped in slice 1.

## Phase 2 — Client fill portal

### Slice 1 — Token model + public route + bare fill page (issue #40)

`form_share_links` (token, recipient, `locked_field_ids`, no expiry, revoke-only)

- canonical RLS. `lib/shareLink.ts` (pure: `generateShareToken`,
  `isShareLinkActive`, `filterLockedAnswers` — the server-side lock gate) +
  `shareLinkServer.ts` (service-role, scoped-by-token load + submit). Public route
  `src/app/f/[token]/` — `page.tsx` (server load → `PublicFillView`) + `submit/route.ts`
  (POST; strips locked + unknown ids before writing). `/f` added to middleware
  `PUBLIC_ROUTES` + AppShell `BARE_PATHS`. Owner mints a link via
  `createShareLink` on the instances store + `ShareFormButton` on the job Forms tab.
  Vitest covers the token + locked-field filter + row-map; Playwright covers
  owner-mints-link → no-login open → submit → resume. Touches the auth boundary +
  adds a schema migration — stop-and-ping before the prod migration.

### Slice 2 (next) — Owner share UI + per-field lock controls + QR + branding.

### Slice 3 — Owner tracking + signature audit trail (issue #42)

Additive migration (`20260625140000_form_share_tracking.sql`) on `form_share_links`:
`started_at`, `progress` (0..100 check), `signature_affirmed`, `signed_ip`,
`signed_user_agent` — all nullable, prod-safe. `lib/shareTracking.ts` (pure:
`recipientStatus` Created→Sent→Opened→Started→Submitted, `daysSince` /
`daysSinceLabel`, `computeProgress`) + vitest. Owner-private surface
`RecipientStatusList` on the job Forms tab — a status pill + funnel track + sent
date · "N days ago" + opened date per recipient; reads the authenticated store
(`shareLinksForInstance`), never the public page. `submitShareLink` stamps
`started_at`/`submitted_at`, recomputes `progress`, and on a signing submit
records the audit trail (IP/UA/`affirmed`) server-side from request headers;
PublicFillView shows the "I confirm" affirmation (gates submit) when the form
carries a signature, and the affirmation lands on the signoff PDF. Touches the
auth boundary + a schema migration — stop-and-ping before the prod migration.
