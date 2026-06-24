# Drawings — Slice 4 (Shapes / Arrows + Typed Text) Implementation Plan

> Builds on Slice 3 (ink markup). REQUIRED SUB-SKILL: inline TDD (like Slices 1–3). Steps use `- [ ]`.

**Goal:** On the Slice 3 markup overlay, add **shape** tools (arrow · rectangle · line) and **typed text notes**, plus a **select** tool that lets you **move** and **resize** any shape/text and **edit** a note's words. All persisted in `document_annotations`, normalized 0–1, undo/redo-able.

**Grill decisions (2026-06-24, Andrew):**
- Shapes: **arrow + rectangle + line** (no ellipse).
- Editing: **full select tool** — tap to select, drag body to move, corner handles to resize (shapes + text). Ink/highlight stay draw+erase only.
- Text: **plain colored text, no box**, rendered with a subtle **white halo** (paint-order stroke) so it's legible over linework without covering it. Movable + resizable.
- (Slice 5 will reuse all of this on the sketchpad.)

**Architecture:** Widen `Annotation.data` to a union (`StrokeData | ShapeData | TextData`). Evolve `InkLayer` → **`MarkupLayer`**: one SVG overlay that renders all four annotation types and drives every tool (ink draw, shape drag, text place/edit, select/move/resize, tap-erase). Add `updateAnnotation` to the store and an `update` entry (before/after) to `useMarkupHistory`. Pure geometry (`shapes.ts`) is TDD'd; the interactive layer is browser-smoked.

**Tech:** No new deps. SVG `<line>`/`<rect>`/`<text>` + a computed arrowhead polygon. Normalized 0–1 coords throughout; denormalize by the layer's own layout size (constant under CSS-transform zoom), same as Slice 3.

## Global Constraints
- Path aliases; `"use client"` only where needed; thin routes; tokens only; ≥44px targets; `prefers-reduced-motion`.
- RLS unchanged (authenticated). Attribution `created_by` = `useAuth().user?.email ?? null`.
- Gate before each commit: `tsc`, `lint`, `vitest <file>`. Before PR: `tsc` + `lint` + `npm test` + `build` + authed browser smoke.

---

## File Structure

**New:**
- `features/drawings/lib/shapes.ts` (+ `.test.ts`) — shape/text geometry: arrowhead, rect-normalize, hit-test, bounds.

**Modified:**
- `shared/lib/types.ts` — `ShapeKind`, `ShapeData`, `TextData`, widen `Annotation.data` to `AnnotationData`.
- `features/drawings/lib/annotationsStore.tsx` — add `updateAnnotation(id, patch)` (optimistic + rollback).
- `features/drawings/lib/useMarkupHistory.ts` — add `recordUpdate(before, after)` + invert `update`.
- `features/drawings/components/InkLayer.tsx` → rename to **`MarkupLayer.tsx`** (render all types; tools: shape/text/select/move/resize in addition to ink/erase).
- `features/drawings/components/MarkupToolbar.tsx` — add `shape` (+ arrow/rect/line sub-row), `text`, `select` tools; show color row for pen/highlighter/shape/text; a "Delete" affordance when something is selected.
- `features/drawings/components/DrawingsView.tsx` — new tools, `shapeKind` state, selection state, text-editor state, `handleCommitShape`/`handleCommitText`/`handleUpdate`/`handleEditText`; pass selection + update down.

---

### Task 1: Annotation data union (types)

**Files:** `shared/lib/types.ts`.

- [ ] **Step 1** Add below `StrokeData`:

```typescript
export type ShapeKind = "arrow" | "rect" | "line";
/** Shape payload: endpoints (arrow/line) or opposite corners (rect), normalized 0–1. */
export type ShapeData = { shape: ShapeKind; x1: number; y1: number; x2: number; y2: number };
/** Text note: top-left x/y (0–1) + the words + fontSize normalized to page height. */
export type TextData = { x: number; y: number; text: string; fontSize: number };

export type AnnotationData = StrokeData | ShapeData | TextData;
```

- [ ] **Step 2** Change `Annotation.data: StrokeData` → `data: AnnotationData`. Add a doc comment that `type` discriminates the union (`ink`/`highlight` → `StrokeData`, `shape` → `ShapeData`, `text` → `TextData`).
- [ ] **Step 3** Fix the narrowing fallout: in `MarkupLayer` (Slice 3 `InkLayer`) the ink branch reads `a.data.points` — guard with `a.type === "ink" || a.type === "highlight"`. `annotationsRowMap` is unaffected (`data` is opaque jsonb passthrough; widen its `data` field type to `AnnotationData`).
- [ ] **Step 4: tsc + commit** — `feat(drawings): widen Annotation.data union (shape/text)`

---

### Task 2: Shape + text geometry (TDD)

**Files:** `features/drawings/lib/shapes.ts` (+ `.test.ts`).

**Interfaces:**
- `normRect(s: ShapeData)` → `{ x, y, w, h }` in 0–1 (min corner + size; for line/arrow returns the bbox).
- `arrowHead(x1,y1,x2,y2, headLen, width, height)` → `[number,number][]` pixel points of the 3-point head (denormalized).
- `shapeBounds(a)` / `textBounds(a, w, h, measure)` → pixel bbox `{x,y,w,h}` for selection.
- `hitTestShape(s, px, py, w, h, tol)` → boolean (point near a line/arrow segment, on a rect's stroke or interior, within `tol` px).
- `pointSegDist(px,py,ax,ay,bx,by)` → number (px distance to a segment) — the core primitive.

- [ ] **Step 1: Failing test** covering: `pointSegDist` on a known segment; `normRect` swaps inverted corners; `arrowHead` returns 3 points; `hitTestShape` true near a line and false far away.
- [ ] **Step 2: Implement** `shapes.ts` (pure functions; denormalize where pixel output is needed). Arrowhead = two barbs at ±25° rotated from the segment direction, length `headLen` px.
- [ ] **Step 3: Run — PASS. Commit** — `feat(drawings): shape/text geometry + hit-testing (TDD)`

---

### Task 3: Store `updateAnnotation` + history `update`

**Files:** `annotationsStore.tsx`, `useMarkupHistory.ts`.

- [ ] **Step 1** `annotationsStore`: add `updateAnnotation(id, patch: Partial<Annotation>)` — optimistic merge into `annotationsRef`, `setAnnotations`, then `getSupabase().update(annotationToRow(merged)).eq("id", id)` with rollback on error (mirror `piecesStore.updatePiece`). Bump `updatedAt`. Expose in context value + type.
- [ ] **Step 2** `useMarkupHistory`: add `Entry` kind `"update"` carrying `before` + `after` annotations. `recordUpdate(before, after)`. `undo` of update → `ops.onUpdate(before)`; `redo` → `ops.onUpdate(after)`. Add `onUpdate` to the ops param. Keep add/delete behavior.
- [ ] **Step 3: tsc + commit** — `feat(drawings): updateAnnotation store mutator + history update entry`

---

### Task 4: `MarkupToolbar` — shape / text / select tools

**Files:** `MarkupToolbar.tsx`.

**Interfaces:** `Tool` widens to `"pan" | "pin" | "pen" | "highlighter" | "shape" | "text" | "select" | "eraser"`. New props: `shapeKind`, `onShapeKind`, `selectionActive`, `onDeleteSelection`.

- [ ] **Step 1** Add tool buttons (lucide: `Spline`/`MoveUpRight` arrow, `Square`, `Minus` line grouped under one **Shapes** button; `Type` text; `MousePointer2` select). When `shape` active, show a **shape-kind sub-row** (arrow/rect/line) mirroring the swatch-row idiom. Show the **color row** for `pen`/`highlighter`/`shape`/`text`. When `selectionActive`, show a **Delete** button (`Trash2`) that calls `onDeleteSelection`.
- [ ] **Step 2: tsc + lint + commit** — `feat(drawings): toolbar shape/text/select tools + shape-kind picker`

---

### Task 5: `InkLayer` → `MarkupLayer` (render + draw shapes/text + select/move/resize/erase)

**Files:** rename `InkLayer.tsx` → `MarkupLayer.tsx` (update import in `DrawingsView`).

**Behavior:**
- **Render** every annotation by `type`:
  - `ink`/`highlight` → `<path>` (Slice 3 logic, guarded narrowing).
  - `shape=line` → `<line>`; `shape=arrow` → `<line>` + arrowhead `<polygon>`; `shape=rect` → `<rect>` (stroke only, `fill=transparent`). Stroke = `color`, width from `strokeWidth ?? 2` (denormalized lightly).
  - `text` → `<text>` at denormalized x/y, `fontSize = data.fontSize * height`, `fill=color`, **halo** via `style={{ paintOrder: "stroke", stroke: "#FBFAF7", strokeWidth: 3 }}`.
- **Tools:**
  - `pen`/`highlighter`/`eraser` — unchanged from Slice 3.
  - `shape` — pointer down→move→up drags out a shape from start to current; commit `{type:"shape", data:{shape: shapeKind, x1,y1,x2,y2}, color: penColor, size}` on pointer-up (ignore zero-length). Live preview path during drag.
  - `text` — tap places a caret; an **inline `<textarea>`/input** (absolutely positioned at the tap point, in layer px) opens via an `onRequestText(x,y)` callback to the parent; parent commits on blur/Enter.
  - `select` — tap hit-tests shapes+text (topmost wins via `hitTestShape`/`textBounds`); sets selection. A selected object draws a dashed **bounding box** + **handles**. Drag the body → move (translate coords by normalized delta → `onUpdate(before, after)` once per gesture). Drag a **handle** → resize (line/arrow: move that endpoint; rect: move that corner; text: scale `fontSize` by drag distance). Double-tap a selected text → `onEditText(annotation)`. Tap empty space → deselect.
- **Props added:** `shapeKind`, `selectedId`, `onSelect(id|null)`, `onUpdate(before, after)`, `onRequestText(xNorm,yNorm)`, `onEditText(a)`. Keep `onCommit` (ink) + add `onCommitShape`. Erase unchanged (`onErase`).
- Selection state for the *gesture* (drag start point, which handle) is local; the committed change goes up via `onUpdate`.

- [ ] **Step 1** Rename + implement. Keep the ResizeObserver layout-size approach. Pointer routing by `activeTool`. Hit-test in layer px.
- [ ] **Step 2: tsc + lint + commit** — `feat(drawings): MarkupLayer — render+draw shapes/text, select/move/resize`

---

### Task 6: Wire into `DrawingsView`

**Files:** `DrawingsView.tsx`.

- [ ] **Step 1** State: `shapeKind` (`"arrow"` default), `selectedId` (string|null), `editingText` (`{ id?: string; x: number; y: number; value: string } | null`). `useAnnotations()` now also gives `updateAnnotation`.
- [ ] **Step 2** History ops gain `onUpdate: (a) => updateAnnotation(a.id, a)`. Handlers:
  - `handleCommitShape(s)` — build `Annotation` (type `shape`, data, color=penColor, strokeWidth), `createAnnotation` + `history.recordAdd`.
  - `handleRequestText(x,y)` — open `editingText` at (x,y) with empty value (new note).
  - `handleEditText(a)` — open `editingText` seeded from the existing text annotation.
  - `handleCommitText(value)` — if editing existing: `updateAnnotation` + `history.recordUpdate(before, after)`; if new and non-empty: `createAnnotation` (type `text`, data `{x,y,text:value,fontSize:0.022}`) + `recordAdd`. Close editor.
  - `handleUpdate(before, after)` — `updateAnnotation(after.id, after)` + `history.recordUpdate(before, after)`.
  - `handleDeleteSelection()` — find selected annotation, `deleteAnnotation` + `history.recordDelete`, clear `selectedId`.
  - Deleting via the toolbar Delete button **or** the `Delete`/`Backspace` key when a selection exists and not typing.
- [ ] **Step 3** Render the inline text editor (absolutely positioned `<textarea>` over the stage when `editingText`) — commit on Enter (no shift) / blur, cancel on Escape. Pass `shapeKind`, `selectedId`, `onSelect`, `onUpdate`, `onRequestText`, `onEditText`, `onCommitShape` into `MarkupLayer`. `selectionActive`/`onDeleteSelection` into the toolbar.
- [ ] **Step 4** `disablePan = activeTool !== "pan"` (select also disables pan so drags don't pan). `onPlace` still pin-only.
- [ ] **Step 5: tsc + lint + build + commit** — `feat(drawings): wire shapes, text notes, select/move/resize into the viewer`

---

### Task 7: Impeccable + full gate + browser smoke (DoD)

- [ ] **Step 1: Impeccable** — toolbar grew; verify it wraps cleanly on tablet, tokens, ≥44px, selection box/handles are visible but subtle, text halo reads over dark linework, reduced-motion.
- [ ] **Step 2: Full gate** — `tsc && lint && npm test && build`. New `shapes.test.ts` green; Slice 0–3 suites green.
- [ ] **Step 3: Authed browser smoke** (Playwright, prod Supabase, upload a PDF): draw an **arrow**, a **rectangle**, a **line** (each in a chosen color) → all render; place a **text note** → type → it appears with a halo, not boxing the drawing; **select** the rectangle → **move** it → **resize** via a corner handle; **select** the text → **resize** it; **double-tap** the text → edit the words → persists; **undo** a move (returns to prior spot), **redo**; **erase**/delete an object; **reload** → everything reappears at the right page/zoom; **per-page** still isolates; zero console errors; clean up test data.
- [ ] **Step 4: Commit** polish; push branch; open PR (stacked on Slice 3 / #24 — base = `feat/drawings-slice-3` until #24 merges, then retarget to `main`).

## Self-Review
- **Spec coverage (Slice 4 / D9):** lines/rects/arrows + tap-to-place text → T5/T6; edit/delete/persist → T3/T5/T6; searchable text (plain `text` in jsonb) → T1. **Grill:** arrow+rect+line T4/T5; select+move+resize T5; plain text + halo T5; ink/highlight stay erase-only (select scoped to shapes+text) T5.
- **Out of scope (later):** ellipse; multi-select; rotate; freehand move; Slice 5 sketchpad; realtime ink.
- **Assumptions:** text fontSize normalized to page **height** (0.022 ≈ readable default); arrowhead barbs ±25°; select hit-tolerance ~8px; rect renders stroke-only (no fill) so it never covers linework.
