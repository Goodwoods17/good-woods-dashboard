# Job Drawings & Markup — Design Spec

> **Status:** Draft for review (brainstorm complete 2026-06-23).
> **Author:** Andrew + Claude (brainstorming session).
> **Feature folder:** `features/drawings` (new).
> **Next step after approval:** `writing-plans` → implement **Slice 0** first.

---

## 1. Summary

Turn a job from a *record of* drawings into the place the shop actually **works on**
them. Inside a job, staff can:

1. **View uploaded PDF drawings** in-app (shop / designer / architectural / appliance).
2. **Mark them up with a stylus** — ink, highlighter, typed notes, shapes/arrows — saved
   per drawing.
3. **Check off build progress live** for every cabinet *and* standalone part (end panels,
   scribes, toe kicks, fillers), color-coded, updating in realtime across all screens.
4. **Sketch a detail** on a blank canvas (the per-project sketchpad) and reference it later.

One new surface, one shared ink/annotation engine reused three ways: over a PDF, over a
blank canvas, and as live status markers ("pins") on a drawing.

---

## 2. Why now / problem

- Drawings today are **Google Drive links** rendered through Drive's `<iframe>` embed
  (`features/documents`). You cannot draw on an embed — markup is impossible without owning
  the file bytes.
- Progress tracking is **counts by type** (`CabinetSummary`: 6 base, 4 wall…). There is no
  individual cabinet/part entity to check off, and nothing realtime.
- The shop draws details by hand on paper that then get lost; there's no durable, job-linked
  sketch surface.

---

## 3. Goals & non-goals

### Goals
- In-app PDF viewer for job drawings (uploaded into Supabase Storage).
- Stylus markup: **pen+eraser, highlighter, typed text notes, shapes & arrows**.
- First-class trackable **pieces** (cabinets + parts) with per-kind status lifecycles,
  shown as **pins on the drawing AND a synced checklist** ("Both").
- **True realtime** status across all screens (Supabase Realtime).
- Per-project **sketchpad** (blank-canvas sketches, multiple, named, referenceable).
- Design the **Mozaik seeding seam** now (so a later import slots in with zero schema repaint).

### Non-goals (v1 — YAGNI)
- Measurement / scale-calibration tools (no drawing-to-scale dimensioning).
- PDF text search / OCR.
- Live multi-user **cursors** on markup (status is realtime; ink syncs on reopen until a
  later slice).
- Google Drive **auto-sync** (pulling bytes from Drive) — links stay view-only.
- Drawing **version diffing**.
- Building the comprehensive Mozaik export itself (Andrew owns that; we consume it later).

---

## 4. Users & devices

Shop staff, foreman, installers, office. Target devices (confirmed): **Windows tablet /
Surface, touchscreen laptop/desktop, phone on-site** — all Chrome/Edge. **No iPad** → no
Safari/iOS pen quirks; we rely on standard **Pointer Events** (pressure, palm rejection,
tilt), which are cleanest on Chromium. Lean bundle matters (phones + shop hardware).

---

## 5. Locked decisions (brainstorm outcomes)

| # | Decision |
|---|---|
| D1 | New `features/drawings` folder. Drawings live at the **project/job level** (uploaded during the design phase) and are referenced from many surfaces. The viewer is a **dedicated full-screen route `/jobs/[id]/drawings`**, opened by a shared **`<DrawingsButton/>`** launcher placed on the **job page, shop-floor cards, and installer view** (drawings are referenced a lot during build + install). Deep-linkable (bookmark a shop tablet to a job's drawings), survives refresh, hardware back works. Upload affordance lives inside the viewer route. |
| D2 | **Storage:** uploaded PDFs → Supabase Storage (own the bytes). Drive/URL links remain a **view-only** option. Reuse the Reface upload pattern (`features/reface/lib/storage.ts`). |
| D3 | **Build approach A — custom lean layer**: `pdfjs-dist` to render, Pointer Events for input, `perfect-freehand` (~5kb) for ink quality, annotations stored as **vector JSON** in Supabase. Built phased (unique value first). |
| D4 | Trackable thing is a generalized **piece** with a `kind` and a **per-kind stage pipeline** defined in code. |
| D5 | **Cabinet pipeline (7):** cut → assembled → finished → packed → delivered → installed → final_adjustments. **Part pipeline (8):** cut → edgebanded → sanded → sprayed → packed → delivered → installed → final_adjustments. Shared tail (packed→…→final_adjustments). |
| D6 | `cut` carries a **cut method**: `inhouse` (table saw) or `cnc_sub` (Toolpath subbed) — ties to ADR 0012 make-vs-buy. |
| D7 | **Both** model: pieces appear as **pins on the drawing** *and* in a **synced checklist**; tapping either updates the other. |
| D8 | **True realtime, all screens** via Supabase Realtime on the pieces table. |
| D9 | Markup toolset: **pen+eraser, highlighter, typed text notes, shapes & arrows**. |
| D10 | **Mozaik `R{room}C{cabinet}` code is the join key** (e.g. `R1C7` = Room 1/Kitchen, Cabinet 7 "3-drawer"), printed on the drawing. Items can be seeded from Mozaik **or** hand-typed off a supplied drawing — same machinery. |
| D11 | Mozaik **data** ingests as **CSV/XLSX** (not print-to-PDF/XPS/DOCX). Drawings to mark up stay **PDF**. |

---

## 6. Architecture overview

```
features/drawings/
  CLAUDE.md                 Feature spec (canonical)
  PLAN.md                   Phased plan (kept current)
  components/
    DrawingsTab.tsx         Job tab: lists drawings/links/sketches + item progress summary
    DrawingViewer.tsx       Full-screen: PDF page + annotation overlay + toolbar + checklist
    MarkupToolbar.tsx       Pen / highlighter / shapes / text / eraser
    PieceChecklist.tsx  Grouped checklist (Cabinets / Parts), tap to advance status
    PiecePin.tsx        Pin on the drawing carrying a status badge + R#C# code
    SketchpadCanvas.tsx     Blank-canvas variant of the viewer
    DocumentUpload.tsx      Upload PDF (storage) or paste link
  lib/
    pdf.ts                  pdfjs-dist load/render helpers
    annotations.ts          Annotation types + Supabase CRUD store
    pieces.ts           Item store, stage pipelines, realtime subscription
    pipelines.ts            STAGE_PIPELINES registry (single source of truth)
    storage.ts              job-documents bucket helpers (mirrors reface/lib/storage.ts)
    mozaikSeed.ts           (later slice) CSV → pieces mapping
```

Route page stays thin (`src/app/jobs/[id]` already renders `JobDetail`; we add a tab).
Shared work used by 2+ features goes in `shared/` per project rules.

---

## 7. Data model (Supabase, RLS = authenticated)

### 7.1 `documents` (extend existing)
Add columns (keep `driveUrl` for links):
- `source` — `upload` | `link` | `sketch`
- `storage_path` — text, nullable (set for `upload`)
- `mime` — text, nullable
- `page_count` — int, nullable

A **sketch is a document** with `source='sketch'` and no PDF; its strokes live in
`document_annotations` against a blank background. Sketchpad reuses everything.

### 7.2 `document_annotations` (new)
One row per markup object.
- `id`, `document_id` (fk → documents), `page` (int; 0 for sketches)
- `type` — `ink` | `highlight` | `shape` | `text`
- `data` — jsonb: stroke points+pressure / rect / arrow endpoints / text+position
- `color` — text; `stroke_width` — numeric, nullable
- `created_by`, `created_at`, `updated_at`
- **All geometry normalized 0–1** relative to page size → scales across zoom & device.

### 7.3 `job_pieces` (new) — the check-off spine
- `id`, `project_id` (fk)
- `kind` — `cabinet` | `end_panel` | `scribe` | `toe_kick` | `filler` | … (extensible)
- `subtype` — text, nullable (cabinets: `base`/`wall`/`tall`/`island`)
- `code` — text, nullable — the **`R{room}C{cabinet}`** drawing code (join key; a pin's label)
- `room` — text, nullable (e.g. "Kitchen"; carried by the code)
- `label` — text — the type name ("3 Drawer", "Base End Panel")
- `cut_method` — `inhouse` | `cnc_sub` | null
- `status` — text, validated against the kind's pipeline (`pipelines.ts`)
- `status_updated_at`, `status_updated_by`
- `source` — `manual` | `mozaik`
- `source_ref` — text, nullable (raw Mozaik string for reconcile/dedupe on re-import)
- **Pin** (nullable): `pin_document_id` (fk), `pin_page` (int), `pin_x`, `pin_y` (0–1)
- `sort_order` — int
- **Optional cutlist fields** (filled by Mozaik, null when hand-made):
  `dimensions` (text, e.g. "23 1/4 × 58 1/2"), `material` (text), `edgeband` (text),
  `parent_ref` (text — parent cabinet `code` for a part)
- **Realtime enabled** on this table.

> **Naming:** `job_pieces` / "Piece" is the canonical term (settled in the grill; recorded in
> `docs/domain.md`). "Build item" was an earlier working name — do not use it.

### 7.4 Stage pipelines (`lib/pipelines.ts` — code, not DB)
```ts
export const CABINET_STAGES = [
  'cut','assembled','finished','packed','delivered','installed','final_adjustments',
] as const;
export const PART_STAGES = [
  'cut','edgebanded','sanded','sprayed','packed','delivered','installed','final_adjustments',
] as const;
export const STAGE_PIPELINES: Record<ItemKind, readonly string[]> = {
  cabinet: CABINET_STAGES,
  end_panel: PART_STAGES, scribe: PART_STAGES, toe_kick: PART_STAGES, filler: PART_STAGES,
};
```
Colors/labels/order derive from this single source. Adding a kind = one entry.

---

## 8. UI surfaces

- **Drawings tab** (`DrawingsTab`): a grid/list of items in the job — uploaded PDFs, link
  docs, and sketches — each with kind badge + a compact **build-progress summary**
  (e.g. "Cabinets 6/13 installed · Parts 2/7"). Upload button + "New sketch" + "Add link".
- **Drawing viewer** (`DrawingViewer`): full-screen. Center = the PDF page (pdf.js) with the
  annotation overlay + pins. Top/side = **markup toolbar**. Right (collapsible) = the
  **piece checklist** grouped Cabinets / Parts, each row showing `code` + label +
  colored stage badge; tap a row or its pin to advance status. Page nav + zoom/pan/pinch.
- **Checklist** readable with 7–8 stages: show a small **progress ring / step badge** (not
  color alone), since 7–8 colors are hard to distinguish as dots. Visual polish via the
  `impeccable` skill at build time.
- **Sketchpad** (`SketchpadCanvas`): same engine, blank/grid background, `page=0`. Named,
  listed alongside drawings, openable any time.

---

## 9. Realtime

Supabase Realtime channel on `job_pieces` filtered by `project_id`;
`postgres_changes` → patch the `pieces` store. Foreman taps "Installed" at site → shop
wall tablet + office update within ~1s, no refresh. (Annotations realtime is a possible
later slice; v1 ink syncs on reopen.)

---

## 10. Build approach & dependencies

**Approach A (custom lean):** `pdfjs-dist` renders PDF pages to a canvas/img; an
absolutely-positioned overlay (canvas/SVG) captures Pointer Events; `perfect-freehand`
turns input into pressure-variable stroke outlines; everything persists as vector JSON.

**New dependencies (small, MIT, mature):**
- `pdfjs-dist` (+ optionally the `react-pdf` wrapper) — render existing PDFs.
  > Note: the repo's `@react-pdf/renderer` *generates* PDFs and **cannot render** existing
  > ones — this is a genuinely new capability.
- `perfect-freehand` — ink stroke quality (~5kb, no deps).

Per project rule "suggest, don't suppress": these are proposed, not assumed — confirm at
plan time. Bundle impact is modest and lazy-loadable on the viewer route.

---

## 11. Build slices (tracer-bullet; riskiest/most-valuable first; merge at each boundary)

### Slice 0 — Storage + Viewer spine
- `job-documents` Supabase Storage bucket + RLS (mirror `reface-photos`); extend `documents`
  (source/storage_path/mime/page_count; make `drive_url` nullable).
- Dedicated full-screen route `/jobs/[id]/drawings` + shared `<DrawingsButton/>` launcher on
  the job page, shop-floor cards, and installer view.
- Upload **PDF or image (JPG/PNG/WebP), ~50MB cap** (client-side guard), into the bucket;
  also paste a link (view-only). Viewer picks the renderer by `mime`: **pdf.js** for PDFs,
  **`<img>`** for images. Page nav + zoom/pan/pinch for PDFs.
- Link docs render view-only (existing Drive embed path preserved).
- **DoD:** upload a PDF *and* an image to a job, open `/jobs/[id]/drawings` from the
  DrawingsButton on the job page (and it appears on shop floor + installer), see each render
  in-app, page/zoom the PDF; a pasted link still shows view-only; over-cap upload is blocked
  with a clear message; `tsc`/`lint`/Vitest/build green; browser smoke.

### Slice 1 — Pieces + pins + status (save-first)
- `job_pieces` table + `pieces` store + `pipelines.ts`.
- Tap a drawing to drop a pin → create an item (enter `code`/label/kind); checklist panel
  grouped Cabinets/Parts; advance status; cut-method on `cut`.
- **DoD:** create cabinet + part items by tapping a drawing, advance each through its full
  pipeline, see pins + checklist stay in sync, reload persists; math/pipeline unit tests;
  smoke.

### Slice 2 — Realtime
- Supabase Realtime on `job_pieces`; two browsers reflect status changes < ~1s.
- **DoD:** status change in window A appears in window B without refresh; smoke on two
  sessions.

### Slice 3 — Ink markup
- `document_annotations` table + store; pen + eraser + highlighter; persist per page; 0–1
  coords; redraw on zoom.
- **DoD:** draw on a PDF, reload, ink reappears correctly at any zoom; serialization unit
  tests; smoke.

### Slice 4 — Shapes/arrows + typed text notes
- Lines/rects/arrows + tap-to-place text callouts (searchable text).
- **DoD:** place each annotation type, edit/delete, persists; smoke.

### Slice 5 — Sketchpad
- Blank-canvas sketches (reuse engine), multiple named per job, listed with drawings.
- **DoD:** create/name a sketch, draw, reopen later from the job; smoke.

### Later — Mozaik seeding (deferred; needs the comprehensive CSV)
- `mozaikSeed.ts`: parse the Cutlist/Job-Costing **CSV** → seed `job_pieces`:
  - **Cabinets** → one piece per named row; `code` = `R#C#`; `label` = type name;
    `source_ref` = raw string.
  - **Finish pieces** (Panelized End, Fin Panel, Filler, Finished End/Toe Skin) → expand
    counts into instances; `parent_ref` = parent cabinet `code`; carry dims/material/edgeband.
  - **Granularity:** seed checkable pieces for **cabinets + standalone finish pieces only** —
    NOT every cutlist **component** (a small job's cutlist is ~35 components: doors/backs/
    shelves are reference data, not check-off rows).
  - **Reconcile** on re-import by `source_ref` (no duplicates).

### Later — Archive to Google Drive (deferred; ADR 0016)
- On job completion/archive: move uploaded files to a Drive folder, flip those `documents`
  rows to `source = 'link'`, free the Supabase objects. Pins/markup stay in Postgres;
  optionally **flatten markup into the archived PDF** so the Drive copy is the final record.
- Not urgent (Pro's 100 GB covers years of active jobs); keeps the active bucket tidy + puts
  the permanent record in Andrew's Drive ecosystem.

---

## 12. Testing

- **Vitest** (already in CI): pipeline transitions, 0–1 coordinate normalization round-trips,
  annotation (de)serialization, and later Mozaik CSV → item mapping.
- **Playwright** browser smoke per slice (per project memory).
- CI gate (`.github/workflows/ci.yml`): tsc → lint → Vitest → build on every PR.

---

## 13. Open questions / deferred

- **Mozaik export format**: Andrew to find the Cutlist/Pricing **CSV/Excel** export (not the
  Windows print dialog's Print-to-PDF / XPS). Resolved before the Mozaik slice, not before.
- **ADR 0016** (written) records the storage lifecycle: active drawings in Supabase Storage,
  archive to Drive on completion, links view-only.
- **ADR?** Consider a *second* ADR for "pieces as first-class with per-kind pipelines + R#C#
  join key" once Slice 1 lands (a durable model decision). Optional.
- **Annotation realtime** (multi-user live ink) — possible post-v1 slice.
- Final **checklist visual** (rings vs badges vs color) settled in the `impeccable` pass.
- Glossary terms recorded in `docs/domain.md` (Piece, Cabinet, Finish piece, Component,
  R#C# code, Pin, Markup, Document, Drawing, Sketch).

---

## 14. Relationship to existing work

- Reuses Reface storage pattern (`features/reface/lib/storage.ts`) and the Supabase
  store/RLS conventions used across features.
- Complements (doesn't replace) `CabinetSummary` counts in the estimator/job-costing —
  pieces are *instances for tracking*, not the costing budget.
- Ties to ADR 0012 (Mozaik import + make-vs-buy cut) via `cut_method` and the seeding seam.
- Storage lifecycle governed by **ADR 0016** (active in Supabase, archive to Drive).
- Terminology governed by `docs/domain.md` → *Drawings, markup & piece tracking*.
