# Drawings — Slice 5 (Sketchpad) Implementation Plan

> Builds on Slices 3–4 (markup engine). Inline TDD where there's pure logic. Steps use `- [ ]`.

**Goal:** A per-job **blank-canvas sketchpad** — create multiple named sketches, draw on them with the full markup toolset (ink, highlighter, shapes, text), persisted and reopenable. Background is a **dot grid** with an **on/off toggle** (Andrew's call).

**Grill decisions (2026-06-24, Andrew):** dot grid (minimalist, dots as drawing reference); a toggle switch to turn dots on/off.

**Architecture:** A sketch is a `documents` row with `source='sketch'` (schema seam already shipped in Slice 0 — no migration). Its strokes live in `document_annotations` against `page=0`. `DrawingDoc` gains a sketch branch that renders a fixed-aspect **`SketchCanvas`** (white surface + optional dot grid) inside the existing `DrawingStage`, with the same `MarkupLayer` overlay. `DrawingsView` gets a **"New sketch"** action and a **dot-grid toggle**. Everything else (tools, undo/redo, select/move/resize, persistence) is reused verbatim.

## Global Constraints
- Tokens only; ≥44px targets; reduced-motion. No new deps. RLS unchanged.
- Gate before each commit: `tsc`, `lint`, `vitest <file>`. Before PR: full gate + authed browser smoke.

---

## File Structure

**New:**
- `features/drawings/components/SketchCanvas.tsx` — blank surface + dot-grid background (toggleable).

**Modified:**
- `features/drawings/components/DrawingDoc.tsx` — sketch branch (render `SketchCanvas` in `DrawingStage`; report `page 0`); accept `showDots`.
- `features/drawings/components/DrawingsView.tsx` — "New sketch" button (creates a `source='sketch'` doc + selects it), `showDots` state + toggle (shown only for sketches), sidebar badge reads "Sketch".

---

### Task 1: `SketchCanvas`

**Files:** `features/drawings/components/SketchCanvas.tsx`.

**Interfaces:** `<SketchCanvas showDots />` — a `w-full aspect-[4/3]` white surface with a token-bordered card look; when `showDots`, a subtle dot grid via CSS `radial-gradient` (≈24px pitch, `bg-border`-ish dots). Pure presentational; the markup overlay sits above it (provided by `DrawingDoc`'s `overlay`).

- [ ] **Step 1** Write it (no pointer handling — that's the overlay's job; `pointer-events-none` on the dots).
- [ ] **Step 2: tsc + lint + commit** — `feat(drawings): SketchCanvas (blank surface + dot grid)`

---

### Task 2: `DrawingDoc` sketch branch

**Files:** `DrawingDoc.tsx`.

- [ ] **Step 1** Add prop `showDots?: boolean`. In the `isPdfDoc` page-report effect, report **0** when `doc.source === 'sketch'` (sketches are single-surface, `page=0`), else 1 for non-pdf. Add a branch: when `doc.source === 'sketch'`, render
  `<DrawingStage disablePan onPlace overlay><SketchCanvas showDots/></DrawingStage>` (mirror the image branch; no URL load needed — return before the storage effect path or guard it). Sketches have no `storagePath`, so skip the signed-URL load for them.
- [ ] **Step 2: tsc + lint + commit** — `feat(drawings): render sketches on a blank dot-grid canvas (page 0)`

---

### Task 3: `DrawingsView` — create + toggle + badge

**Files:** `DrawingsView.tsx`.

**Interfaces:** New `showDots` state (default `true`). `handleNewSketch()` creates a `ProjectDocument` `{ source:'sketch', kind:'other', label:'Sketch N', storagePath:null, mime:null, driveUrl:null, pageCount:0, isCurrent:true, uploadedBy:email }`, `createDocument` it, then `setActiveId(id)`. N = count of existing sketches + 1.

- [ ] **Step 1** Add a **"New sketch"** button (lucide `PenLine`/`SquarePen`) next to `DrawingUpload`. Add a **dot-grid toggle** (a small pill with `Grid3x3` icon, `aria-pressed`) shown **only when the active doc is a sketch**. Sidebar: when `d.source === 'sketch'`, show kind label "Sketch" instead of the kind badge. Pass `showDots` into `DrawingDoc`. `canMarkup`/`canPin`: sketches are markup-able (`source !== 'link'` already true) — pins optional but harmless; keep markup on.
- [ ] **Step 2: tsc + lint + build + commit** — `feat(drawings): New sketch + dot-grid toggle wired`

---

### Task 4: Full gate + browser smoke (DoD)

- [ ] **Step 1: Impeccable** — toggle + button fit the header; dot grid is subtle (reference, not noise); reduced-motion; ≥44px.
- [ ] **Step 2: Full gate** — `tsc && lint && npm test && build`.
- [ ] **Step 3: Authed browser smoke** — click **New sketch** → a named sketch opens on a dot-grid canvas; **draw ink + a shape + a text note**; toggle **dots off/on**; it's listed in the sidebar; open another drawing then reopen the sketch → markup persists; **reload** → sketch + markup persist; zero console errors; clean up test data.
- [ ] **Step 4: Commit** polish; push; open PR (stacked on Slice 4 / #25; base = `feat/drawings-slice-4`).

## Self-Review
- **Spec coverage (Slice 5):** blank-canvas sketches, multiple named per job, listed with drawings, reuse engine → T1–T3 ✅; `source='sketch'`, `page=0` → T2 ✅. **Grill:** dot grid + on/off toggle → T1/T3 ✅.
- **Out of scope (later):** sketch rename/delete-specific UX (delete reuses the existing doc trash), sketch templates, export, Mozaik.
- **Assumptions:** 4:3 landscape surface; dot pitch ~24px; sketches use `kind='other'` with a "Sketch" sidebar label; `page=0` namespaces sketch annotations away from PDF pages.
