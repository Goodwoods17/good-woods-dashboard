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

## Phase 2 (later) — Client fill portal

No-login tokenized `/f/<token>` link served by a service-role route scoped to one
instance. Touches the auth boundary — stop-and-ping before prod.
