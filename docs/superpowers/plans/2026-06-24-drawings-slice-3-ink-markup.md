# Drawings — Slice 3 (Ink Markup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or subagent-driven-development. Steps use `- [ ]`.

**Goal:** On the Slice 1/2 viewer, draw **pen** and **highlighter** strokes on a drawing page, **erase** whole strokes by tapping, **undo/redo** markup, all persisted per `(document, page)` and crisp at any zoom.

**Architecture:** A new `document_annotations` table + a dual-mode `annotationsStore` (load-on-open, NOT realtime). Strokes are stored as **normalized 0–1 input points + color + size**; `perfect-freehand` recomputes the outline at render into an **SVG overlay** (one `<path>` per stroke), inside the same pan/zoom content box as the pins. The viewer's `addingPin` boolean becomes a single **`activeTool`** (`pan | pin | pen | highlighter | eraser`) driven by a **MarkupToolbar**. PDF current-page state is lifted up so ink **and** pins filter by page. A session-scoped **history** powers undo/redo over markup actions.

**Tech Stack:** Next.js 14.2 · React 18 · TS strict · Supabase · `perfect-freehand` (new) · `react-zoom-pan-pinch` (Slice 1) · Tailwind tokens · Vitest (node).

## Global Constraints

- Path aliases only; `"use client"` only where needed; thin route pages.
- Components `PascalCase.tsx`; lib `camelCase.ts`; stores end in `Store`.
- Tailwind **design tokens only**; **touch targets ≥ 44px**; honor `prefers-reduced-motion`.
- Domain terms per `docs/domain.md` (Markup/annotation, normalized 0–1).
- RLS = authenticated (`..._authenticated_all USING (true)`), matching every table.
- Attribution: `created_by` = `useAuth().user?.email ?? null`.
- Gate before each commit: `tsc`, `lint`, `vitest <file>`. Before merge: `tsc` + `lint` + `npm test` + `build` + authed browser smoke.
- **NOT realtime** (annotations load on open). New dep approved: `perfect-freehand`.

### Grill decisions (2026-06-24) folded in
Active-tool toolbar (replaces `addingPin`) · SVG overlay, store input points + recompute outline · undo/redo markup-only + session-scoped + ⌘Z/⇧⌘Z · lift page state (ink+pins per-page) · eraser tap-to-delete · palette pen{black,red,blue}/highlighter{yellow,green}, pressure width.

---

## File Structure

**New:**
- `supabase/migrations/20260624_document_annotations.sql`
- `features/drawings/lib/strokes.ts` (+ `.test.ts`) — perfect-freehand path + normalize + color presets.
- `features/drawings/lib/annotationsRowMap.ts` (+ `.test.ts`)
- `features/drawings/lib/annotationsStore.tsx`
- `features/drawings/lib/useMarkupHistory.ts`
- `features/drawings/components/MarkupToolbar.tsx`
- `features/drawings/components/InkLayer.tsx`

**Modified:**
- `shared/lib/types.ts` — `Annotation`, `AnnotationType`, `StrokeData`.
- `shared/lib/supabase.ts` — `DOCUMENT_ANNOTATIONS_TABLE`.
- `src/app/layout.tsx` — mount `AnnotationsProvider`.
- `features/drawings/components/DrawingDoc.tsx` — report current page up; accept `activeTool` + `inkOverlay`.
- `features/drawings/components/DrawingStage.tsx` — pass `drawing` flag (disable pan while a draw tool is active) — already keys off `addingPin`; generalize the prop name.
- `features/drawings/components/DrawingsView.tsx` — `activeTool` state, MarkupToolbar, page state, ink wiring, undo/redo.

---

### Task 1: DB migration — `document_annotations`

**Files:** Create `supabase/migrations/20260624_document_annotations.sql`; apply via MCP `apply_migration` (name `document_annotations`).

**Interfaces:** Produces `public.document_annotations`: `id uuid pk`, `document_id text not null`, `project_id text not null`, `page int not null default 1`, `type text not null check in (ink,highlight,shape,text)`, `data jsonb not null`, `color text not null`, `stroke_width numeric`, `created_by text`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`.

- [ ] **Step 1: Write the SQL**

```sql
-- Drawings Slice 3: vector markup objects (ink/highlight; shapes+text in Slice 4).
-- One row per object; geometry normalized 0–1 (data jsonb). RLS authenticated.
CREATE TABLE IF NOT EXISTS public.document_annotations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  text NOT NULL,
  project_id   text NOT NULL,
  page         int  NOT NULL DEFAULT 1,
  type         text NOT NULL CHECK (type IN ('ink','highlight','shape','text')),
  data         jsonb NOT NULL,
  color        text NOT NULL,
  stroke_width numeric,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_annotations_doc_idx
  ON public.document_annotations (document_id, page);
ALTER TABLE public.document_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_annotations_authenticated_all ON public.document_annotations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply via MCP** `apply_migration` (project `zycdmlkffbaqofaygddx`).
- [ ] **Step 3: Verify** — `select count(*) from information_schema.columns where table_name='document_annotations';` (expect 11) and the policy is `{authenticated}`.
- [ ] **Step 4: Commit** — `git commit -m "feat(drawings): document_annotations table + RLS"`

---

### Task 2: Annotation types

**Files:** Modify `shared/lib/types.ts`.

**Interfaces:** Produces `AnnotationType = "ink" | "highlight" | "shape" | "text"`; `StrokeData = { points: [number, number, number][] }` (each `[x,y,pressure]`, x/y normalized 0–1); `Annotation`.

- [ ] **Step 1: Add types** (append near `JobPiece`)

```typescript
export type AnnotationType = "ink" | "highlight" | "shape" | "text";

/** Ink/highlight payload: normalized input points [x, y, pressure]. */
export type StrokeData = { points: [number, number, number][] };

export type Annotation = {
  id: string;
  documentId: string;
  projectId: string;
  page: number;
  type: AnnotationType;
  data: StrokeData;            // Slice 3: ink/highlight. Slice 4 widens the union.
  color: string;
  strokeWidth?: number | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: tsc + commit** — `git commit -m "feat(drawings): Annotation types"`

---

### Task 3: Stroke geometry + presets (TDD)

**Files:** Create `features/drawings/lib/strokes.ts` (+ `.test.ts`). Add dep `perfect-freehand`.

**Interfaces:** Produces `PEN_COLORS`, `HIGHLIGHTER_COLORS` (hex strings); `strokeOptions(type, size)`; `strokePathData(points: [number,number,number][], width: number, height: number, type: AnnotationType, size: number): string` — denormalizes points to pixel space, runs `perfect-freehand`, returns an SVG path `d`; `appendPoint(points, x, y, pressure)` (pure). Pressure defaults to 0.5 when absent.

- [ ] **Step 1: Install dep** — `npm install perfect-freehand`

- [ ] **Step 2: Write the failing test** `features/drawings/lib/strokes.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { strokePathData, appendPoint, PEN_COLORS } from "./strokes";

describe("strokes", () => {
  it("builds a non-empty SVG path from points", () => {
    const pts: [number, number, number][] = [[0.1,0.1,0.5],[0.2,0.2,0.5],[0.3,0.25,0.5]];
    const d = strokePathData(pts, 1000, 800, "ink", 8);
    expect(typeof d).toBe("string");
    expect(d.length).toBeGreaterThan(0);
    expect(d.startsWith("M")).toBe(true);
  });
  it("returns empty path for no points", () => {
    expect(strokePathData([], 1000, 800, "ink", 8)).toBe("");
  });
  it("appendPoint adds a normalized point with pressure", () => {
    expect(appendPoint([], 0.5, 0.25, 0.7)).toEqual([[0.5,0.25,0.7]]);
  });
  it("ships a fixed pen palette", () => {
    expect(PEN_COLORS.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 3: Run — FAIL** (`npx vitest run features/drawings/lib/strokes.test.ts`).

- [ ] **Step 4: Implement** `features/drawings/lib/strokes.ts`

```typescript
import { getStroke } from "perfect-freehand";
import type { AnnotationType } from "@shared/lib/types";

export const PEN_COLORS = ["#1A1916", "#B5544C", "#547DAB"] as const;        // black, red, blue
export const HIGHLIGHTER_COLORS = ["#C99846", "#6B8E5C"] as const;           // amber, sage (semi)
export const PEN_SIZE = 6;
export const HIGHLIGHTER_SIZE = 22;

export function appendPoint(
  points: [number, number, number][], x: number, y: number, pressure: number
): [number, number, number][] {
  return [...points, [x, y, pressure || 0.5]];
}

export function strokeOptions(type: AnnotationType, size: number) {
  return type === "highlight"
    ? { size, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, last: true }
    : { size, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: true, last: true };
}

/** Denormalize points to pixel space, run perfect-freehand, return an SVG path `d` (filled outline). */
export function strokePathData(
  points: [number, number, number][], width: number, height: number,
  type: AnnotationType, size: number
): string {
  if (points.length === 0) return "";
  const input = points.map(([x, y, p]) => [x * width, y * height, p] as number[]);
  const outline = getStroke(input, strokeOptions(type, size));
  if (outline.length === 0) return "";
  const d = outline.reduce(
    (acc, [x, y], i) => acc + (i === 0 ? `M ${x} ${y} ` : `L ${x} ${y} `), ""
  );
  return `${d}Z`;
}
```

- [ ] **Step 5: Run — PASS.** **Step 6: Commit** — `git commit -m "feat(drawings): perfect-freehand stroke geometry + palette (TDD)"`

---

### Task 4: Annotation row mapping (TDD)

**Files:** Create `features/drawings/lib/annotationsRowMap.ts` (+ `.test.ts`).

**Interfaces:** `AnnotationRow` (snake_case; `data` jsonb); `rowToAnnotation`, `annotationToRow`. Round-trips; `stroke_width` nullable.

- [ ] **Step 1: Failing test** `annotationsRowMap.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { rowToAnnotation, annotationToRow, type AnnotationRow } from "./annotationsRowMap";

const row: AnnotationRow = {
  id: "a1", document_id: "d1", project_id: "j1", page: 2, type: "ink",
  data: { points: [[0.1,0.1,0.5]] }, color: "#1A1916", stroke_width: 6,
  created_by: "a@b.c", created_at: "t", updated_at: "t",
};

describe("annotationsRowMap", () => {
  it("maps a row", () => {
    const a = rowToAnnotation(row);
    expect(a.documentId).toBe("d1");
    expect(a.page).toBe(2);
    expect(a.data.points[0][0]).toBe(0.1);
  });
  it("round-trips", () => { expect(annotationToRow(rowToAnnotation(row))).toEqual(row); });
});
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement** `annotationsRowMap.ts`

```typescript
import type { Annotation, AnnotationType, StrokeData } from "@shared/lib/types";

export type AnnotationRow = {
  id: string; document_id: string; project_id: string; page: number;
  type: AnnotationType; data: StrokeData; color: string; stroke_width: number | null;
  created_by: string | null; created_at: string; updated_at: string;
};

export function rowToAnnotation(r: AnnotationRow): Annotation {
  return {
    id: r.id, documentId: r.document_id, projectId: r.project_id, page: r.page,
    type: r.type, data: r.data, color: r.color, strokeWidth: r.stroke_width,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function annotationToRow(a: Annotation): AnnotationRow {
  return {
    id: a.id, document_id: a.documentId, project_id: a.projectId, page: a.page,
    type: a.type, data: a.data, color: a.color, stroke_width: a.strokeWidth ?? null,
    created_by: a.createdBy ?? null, created_at: a.createdAt, updated_at: a.updatedAt,
  };
}
```

- [ ] **Step 4: Run — PASS. Step 5: Commit** — `git commit -m "feat(drawings): annotation row mapping (TDD)"`

---

### Task 5: `annotationsStore` (dual-mode, load-on-open)

**Files:** Create `features/drawings/lib/annotationsStore.tsx`; modify `shared/lib/supabase.ts` (`DOCUMENT_ANNOTATIONS_TABLE = "document_annotations"`); mount `AnnotationsProvider` in `src/app/layout.tsx` (wrap beside `PiecesProvider`).

**Interfaces:** Mirror `piecesStore` exactly (synchronous `annotationsRef`, NO realtime). Produces `AnnotationsProvider`; `useAnnotations(): { annotations, createAnnotation(a), deleteAnnotation(id), restoreAnnotation(a) }` (`restoreAnnotation` = create with an explicit id, for undo); `useDocAnnotations(documentId, page): Annotation[]`.

- [ ] **Step 1** Add `DOCUMENT_ANNOTATIONS_TABLE` to `shared/lib/supabase.ts`.

- [ ] **Step 2** Create `annotationsStore.tsx` — copy `piecesStore.tsx`'s structure (ref-synced mutators, dual-mode), but:
  - storage key `gw_document_annotations_v1`; table `DOCUMENT_ANNOTATIONS_TABLE`; map via `rowToAnnotation`/`annotationToRow`/`AnnotationRow`.
  - expose `createAnnotation`, `deleteAnnotation`, and `restoreAnnotation` (identical to create — re-inserts a full annotation incl. id; used by undo).
  - **NO realtime effect** (Slice 3 is load-on-open).
  - `useDocAnnotations(documentId, page)` returns `annotations.filter(a => a.documentId === documentId && a.page === page)` (memoized).

```tsx
// (structure identical to piecesStore.tsx; mutators use annotationsRef synchronously)
export function useDocAnnotations(documentId: string | null, page: number): Annotation[] {
  const { annotations } = useAnnotations();
  return useMemo(
    () => (documentId ? annotations.filter((a) => a.documentId === documentId && a.page === page) : []),
    [annotations, documentId, page]
  );
}
```

- [ ] **Step 3** Mount `<AnnotationsProvider>` inside `<PiecesProvider>` in `layout.tsx`.
- [ ] **Step 4: tsc + commit** — `git commit -m "feat(drawings): dual-mode annotationsStore (load-on-open)"`

---

### Task 6: `useMarkupHistory` (undo/redo)

**Files:** Create `features/drawings/lib/useMarkupHistory.ts`.

**Interfaces:** Produces `useMarkupHistory({ onAdd, onRemove })` where `onAdd(a: Annotation)` re-creates and `onRemove(id: string)` deletes. Returns `{ recordAdd(a), recordDelete(a), undo(), redo(), canUndo, canRedo }`. History is session-scoped in-memory. `recordAdd` is called after a stroke is created; `recordDelete` after an erase. `undo`/`redo` invert by calling the callbacks.

- [ ] **Step 1: Implement** `useMarkupHistory.ts`

```tsx
"use client";
import { useCallback, useRef, useState } from "react";
import type { Annotation } from "@shared/lib/types";

type Entry = { kind: "add" | "delete"; annotation: Annotation };

export function useMarkupHistory(ops: {
  onAdd: (a: Annotation) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
}) {
  const undoStack = useRef<Entry[]>([]);
  const redoStack = useRef<Entry[]>([]);
  const [, force] = useState(0);
  const sync = () => force((n) => n + 1);

  const recordAdd = useCallback((a: Annotation) => {
    undoStack.current.push({ kind: "add", annotation: a }); redoStack.current = []; sync();
  }, []);
  const recordDelete = useCallback((a: Annotation) => {
    undoStack.current.push({ kind: "delete", annotation: a }); redoStack.current = []; sync();
  }, []);

  const undo = useCallback(async () => {
    const e = undoStack.current.pop(); if (!e) return;
    if (e.kind === "add") await ops.onRemove(e.annotation.id);
    else await ops.onAdd(e.annotation);
    redoStack.current.push(e); sync();
  }, [ops]);

  const redo = useCallback(async () => {
    const e = redoStack.current.pop(); if (!e) return;
    if (e.kind === "add") await ops.onAdd(e.annotation);
    else await ops.onRemove(e.annotation.id);
    undoStack.current.push(e); sync();
  }, [ops]);

  return {
    recordAdd, recordDelete, undo, redo,
    canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0,
  };
}
```

- [ ] **Step 2: tsc + commit** — `git commit -m "feat(drawings): session-scoped markup undo/redo hook"`

---

### Task 7: Lift PDF current-page state

**Files:** Modify `features/drawings/components/DrawingDoc.tsx`.

**Interfaces:** `DrawingDoc` + `PdfCanvas` accept `onPageChange?: (page: number) => void` and call it whenever the page changes (and on load with `1`). Images report page `1` on mount. This lets `DrawingsView` filter pins + ink by the current page.

- [ ] **Step 1** Add `onPageChange` to `DrawingDoc` props and thread to `PdfCanvas`. In `PdfCanvas`, add `useEffect(() => { onPageChange?.(page); }, [page, onPageChange])`. In the image branch and link branch, call `onPageChange?.(1)` once via a mount effect. Keep `onPageChange` optional.
- [ ] **Step 2: tsc + lint + commit** — `git commit -m "feat(drawings): lift PDF current-page up via onPageChange"`

---

### Task 8: `InkLayer` (SVG overlay — render, draw, erase)

**Files:** Create `features/drawings/components/InkLayer.tsx`.

**Interfaces:**
- Consumes: `strokePathData`/`strokeOptions`/sizes (Task 3), `Annotation`/`StrokeData` (Task 2), `normalizePoint` (geometry), `useMarkupHistory` callbacks via props.
- Produces: `<InkLayer annotations activeTool penColor highlighterColor onCommit onErase />`. Renders existing annotations as SVG `<path>` fills; when `activeTool` is `pen`/`highlighter`, captures pointer down/move/up into a live stroke (normalized points) and calls `onCommit({type,color,size,points})` on pointer-up; when `eraser`, a tap on a path calls `onErase(annotation)`. Uses the layer's own layout size (constant under CSS-zoom) for denormalization, so no recompute on zoom.

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useRef, useState, useEffect } from "react";
import type { Annotation, AnnotationType, StrokeData } from "@shared/lib/types";
import { strokePathData, PEN_SIZE, HIGHLIGHTER_SIZE } from "../lib/strokes";
import { normalizePoint } from "../lib/geometry";

type Tool = "pan" | "pin" | "pen" | "highlighter" | "eraser";

export function InkLayer({
  annotations, activeTool, penColor, highlighterColor, onCommit, onErase,
}: {
  annotations: Annotation[];
  activeTool: Tool;
  penColor: string;
  highlighterColor: string;
  onCommit: (s: { type: AnnotationType; color: string; size: number; data: StrokeData }) => void;
  onErase: (a: Annotation) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [live, setLive] = useState<[number, number, number][] | null>(null);
  const drawing = activeTool === "pen" || activeTool === "highlighter";

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  function pt(e: React.PointerEvent): [number, number, number] {
    const r = ref.current!.getBoundingClientRect();
    const { x, y } = normalizePoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    return [x, y, e.pressure || 0.5];
  }

  function onDown(e: React.PointerEvent) {
    if (!drawing) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setLive([pt(e)]);
  }
  function onMove(e: React.PointerEvent) {
    if (!drawing || !live) return;
    setLive((cur) => (cur ? [...cur, pt(e)] : cur));
  }
  function onUp() {
    if (!drawing || !live) return;
    if (live.length > 1) {
      const type: AnnotationType = activeTool === "highlighter" ? "highlight" : "ink";
      onCommit({
        type, color: type === "highlight" ? highlighterColor : penColor,
        size: type === "highlight" ? HIGHLIGHTER_SIZE : PEN_SIZE,
        data: { points: live },
      });
    }
    setLive(null);
  }

  return (
    <svg ref={ref}
      className={drawing ? "absolute inset-0 h-full w-full touch-none" : "absolute inset-0 h-full w-full"}
      style={{ pointerEvents: activeTool === "pan" || activeTool === "pin" ? "none" : "auto" }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      {annotations.map((a) => (
        <path key={a.id}
          d={strokePathData(a.data.points, size.w, size.h, a.type, a.strokeWidth ?? (a.type === "highlight" ? HIGHLIGHTER_SIZE : PEN_SIZE))}
          fill={a.color} fillOpacity={a.type === "highlight" ? 0.35 : 1}
          style={{ pointerEvents: activeTool === "eraser" ? "auto" : "none", cursor: activeTool === "eraser" ? "pointer" : "default" }}
          onPointerDown={activeTool === "eraser" ? (e) => { e.stopPropagation(); onErase(a); } : undefined} />
      ))}
      {live && live.length > 1 && (
        <path
          d={strokePathData(live, size.w, size.h, activeTool === "highlighter" ? "highlight" : "ink",
            activeTool === "highlighter" ? HIGHLIGHTER_SIZE : PEN_SIZE)}
          fill={activeTool === "highlighter" ? highlighterColor : penColor}
          fillOpacity={activeTool === "highlighter" ? 0.35 : 1} style={{ pointerEvents: "none" }} />
      )}
    </svg>
  );
}
```

- [ ] **Step 2: tsc + lint + commit** — `git commit -m "feat(drawings): InkLayer SVG overlay (draw / render / tap-erase)"`

---

### Task 9: `MarkupToolbar`

**Files:** Create `features/drawings/components/MarkupToolbar.tsx`.

**Interfaces:** `<MarkupToolbar activeTool onTool penColor onPenColor highlighterColor onHighlighterColor canUndo canRedo onUndo onRedo />`. Tool buttons (MapPin, Pen, Highlighter, Eraser, plus a Hand/Move for pan) ≥44px; active tool filled. Undo/Redo buttons (disabled when their stack empty). When `pen`/`highlighter` active, show the matching color swatch row (`PEN_COLORS`/`HIGHLIGHTER_COLORS`).

- [ ] **Step 1: Write** the toolbar (lucide `Hand`, `MapPin`, `Pen`, `Highlighter`, `Eraser`, `Undo2`, `Redo2`; tokens only; swatches are buttons with `background` = the hex, ring when selected). Full component code mirrors the `DrawingUpload`/checklist button idiom.
- [ ] **Step 2: tsc + lint + commit** — `git commit -m "feat(drawings): MarkupToolbar (tools + swatches + undo/redo)"`

---

### Task 10: Wire into `DrawingsView`

**Files:** Modify `features/drawings/components/DrawingsView.tsx`.

**Interfaces:** Replace `addingPin` boolean with `activeTool` state (`"pan"` default; `"pin"` does what `addingPin` did). Add `currentPage` state (from `DrawingDoc onPageChange`). Filter `docPins` and `docAnnotations` by `(active.id, currentPage)`. Render `<MarkupToolbar>` in the header; pass the ink overlay (`<InkLayer>`) plus pins into `DrawingDoc`'s `overlay`. Wire create/erase to `annotationsStore` + `useMarkupHistory`; wire `onPlace` to fire only when `activeTool === "pin"`.

- [ ] **Step 1** Update state + handlers:
  - `const [activeTool, setActiveTool] = useState<Tool>("pan");`
  - `const [currentPage, setCurrentPage] = useState(1);`
  - `const { createAnnotation, deleteAnnotation, restoreAnnotation } = useAnnotations();`
  - `const docAnnotations = useDocAnnotations(active?.id ?? null, currentPage);`
  - history: `const history = useMarkupHistory({ onAdd: (a) => restoreAnnotation(a), onRemove: (id) => deleteAnnotation(id) });`
  - `handleCommitStroke({type,color,size,data})`: build an `Annotation` (id, documentId=active.id, projectId=jobId, page=currentPage, type, data, color, strokeWidth=size, createdBy=email, timestamps), `await createAnnotation(a)`, then `history.recordAdd(a)`.
  - `handleErase(a)`: `await deleteAnnotation(a.id)`, `history.recordDelete(a)`.
  - `handlePlace` (pin): unchanged but gated on `activeTool === "pin"`; after placing, the create-form flow is the same as Slice 1.
  - Keyboard: a `useEffect` binding `⌘Z`/`⇧⌘Z` (and Ctrl) to `history.undo`/`redo` when not typing in an input.

- [ ] **Step 2** Pass through to `DrawingDoc`:
  - `addingPin={activeTool === "pin"}` (DrawingStage still disables pan when truthy — also disable for pen/highlighter: pass `drawing={activeTool==='pin' || activeTool==='pen' || activeTool==='highlighter'}` — generalize `DrawingDoc`/`DrawingStage` to take a `disablePan` boolean instead of `addingPin`; `onPlace` only fires for pin).
  - `onPageChange={setCurrentPage}`.
  - `overlay={<>{pins}{<InkLayer .../>}</>}` (InkLayer rendered above pins; both inside the transformed content box).

- [ ] **Step 3** Render `<MarkupToolbar>` in the header (replacing the lone "Add pin" button), keeping the checklist toggle + upload.

- [ ] **Step 4: tsc + lint + build + commit** — `git commit -m "feat(drawings): markup toolbar, ink layer, per-page filtering wired"`

> **Note (DrawingStage generalization):** rename the `addingPin` prop to `disablePan` (panning disabled when any non-pan tool needs the surface) and keep `onPlace` firing only when the caller is in pin mode (gate in `DrawingsView`). Pins overlay and InkLayer both live in `overlay`.

---

### Task 11: Impeccable + full gate + browser smoke (DoD)

- [ ] **Step 1: Impeccable pass** on the toolbar + ink (tokens, ≥44px, contrast of swatches, reduced-motion, the toolbar doesn't crowd the header on tablet).
- [ ] **Step 2: Full gate** — `tsc && lint && npm test && build`. Vitest: strokes + annotationsRowMap + the Slice 0–1 suites green.
- [ ] **Step 3: Authed browser smoke** (Playwright, prod Supabase): upload a PDF; select **Pen (red)** → drag → a stroke appears; **Highlighter (yellow)** → drag → translucent stroke; **pinch-zoom** → strokes stay aligned/crisp; **Eraser** → tap a stroke → it's gone; **Undo** → it returns; **Redo** → gone again; draw on **page 2** → switch to page 1 → page-1 ink only (per-page); **reload** → all ink reappears at the right page + zoom; zero console errors; clean up test data.
- [ ] **Step 4: Commit** any polish; then merge decision (PR; Andrew is awake — open PR for review unless he says auto-merge).

## Self-Review

**Spec coverage (Slice 3):** `document_annotations` + store → T1/T5 ✅ · pen+eraser+highlighter → T8/T9 ✅ · per-page + 0–1 coords + redraw on zoom → T7/T8 ✅ · serialization unit tests → T3/T4 ✅ · DoD draw/reload/zoom → T11 ✅. **Grill:** active-tool toolbar T9/T10 · SVG store-points-recompute T3/T8 · undo/redo markup-only T6/T10 · per-page T7/T10 · tap-erase T8 · palette T3/T9. **Placeholders:** none (T9 toolbar described against an existing idiom; full code written at build). **Type consistency:** `Annotation`/`StrokeData` (T2) used identically in rowmap/store/InkLayer/history; `strokePathData` signature stable T3→T8.

**Assumptions to surface:** `perfect-freehand` dep · highlighter opacity 0.35 / blend choice · ink layer denormalizes by layout size (constant under CSS-transform zoom; if a future zoom impl changes layout size, revisit) · `DrawingStage.addingPin` renamed to `disablePan`.

**Out of scope (later):** shapes/arrows/text (Slice 4) · sketchpad (Slice 5) · realtime ink · eraser sweep · Mozaik.
