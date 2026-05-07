# SOPs

Standard Operating Procedures library — read-only reference for cabinet shop
procedures.

## What it does

A single page (`/sops`) listing the shop's documented procedures. Each SOP
has a category (shop / finishing / install / office), an estimated time,
ordered steps, and known pitfalls. Users browse by category in the left
nav and read the full text on the right.

This is a **reference module**, not a workflow tool — no editing, no state,
no Supabase. The SOP corpus lives in source as a typed `SOPS` array.

## Where things live

- `lib/sops.ts` — the typed `SOP` model and the canonical `SOPS` array
  (currently 5 procedures: cut list, drawer box, spray booth, install
  pre-flight, invoicing).

The route file at `src/app/sops/page.tsx` imports from
`@features/sops/lib/sops` and renders the two-pane reader UI.

## Domain notes

- "Cut list" terminology and the install pre-flight refer to the domain
  glossary in `docs/domain.md`.
- Procedures are written for a 1–3 person shop. Don't add scaffolding
  (versioning, attachments, comments) unless someone actually needs it.

## When to revisit

- Add a new SOP → append to the `SOPS` array.
- Add a new category → extend the union in `SOP["category"]` and update
  the icon/label maps in `src/app/sops/page.tsx`.
- If SOPs ever need editing in-app, that's a real feature, not a tweak —
  worth a `/plan-feature` pass before building.
