# Drawings — Slice 1 (Pieces + Pins + Status) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Slice 0 drawing viewer, let a user tap a drawing to drop a **pin** that creates a trackable **piece** (cabinet or finish part), advance each piece through its per-kind status **lifecycle**, and keep the **pins ↔ checklist** in sync — persisted to the shared Supabase DB.

**Architecture:** A new `job_pieces` table + a dual-mode `piecesStore` (mirrors `documentsStore`). Pure logic — the stage **pipelines**, **geometry** (normalized 0–1 coords), and **row mapping** — is TDD'd in `node` vitest. The viewer gains a pan/zoom layer (`react-zoom-pan-pinch`) with an absolutely-positioned **overlay** that captures taps (in "Add pin" mode) and renders **pins**; a collapsible **checklist** panel (grouped Cabinets / Parts) advances status. Realtime is deferred to Slice 2.

**Tech Stack:** Next.js 14.2 App Router · React 18 · TS strict · Supabase (`@supabase/ssr`) · `react-zoom-pan-pinch` (new) · pdf.js (Slice 0) · Tailwind tokens · Vitest (node).

## Global Constraints

- Path aliases only: `@/*`, `@features/*`, `@shared/*`. No deep `../../../`.
- `"use client"` only on hook/state/browser components. Route pages stay thin.
- Components `PascalCase.tsx` named exports; lib `camelCase.ts`; stores end in `Store`.
- Tailwind **design tokens only** (`bg-surface-muted`, `text-status-blocked`, `duration-fast`, the `status-*` ramp, `text-text-tertiary`, …). No hardcoded hex / magic spacing.
- **Touch targets ≥ 44px** on anything tappable (tablet/phone are real targets — PRODUCT.md). Honor `prefers-reduced-motion`.
- Domain terms per `docs/domain.md` (Piece, Pin, Stage, Status/lifecycle, Cut method, R#C#). `job_pieces` / "Piece" is canonical; never "build item".
- RLS = authenticated (single-tenant pattern: `..._authenticated_all USING (true)`), matching every existing table. Storage/data gated to `authenticated`.
- Attribution: `status_updated_by` / `created_by` = `useAuth().user?.email ?? null` (same as Slice 0 `uploaded_by`).
- Money: n/a this slice.
- Verification gate before each commit: `npx tsc --noEmit`, `npm run lint`, `npx vitest run <file>`. Full gate before merge: `tsc` + `lint` + `npm test` + `npm run build` + authed browser smoke.
- New dep approved: `react-zoom-pan-pinch` (pinch/double-tap/drag + transform wrapper). Assumption — vetoable; hand-roll fallback noted in Task 7.

### Grill decisions (2026-06-23) folded into this plan

- **Add-pin mode:** explicit toolbar toggle; tap-to-drop only in that mode. Gestures (pinch-zoom, double-tap-to-fit, drag-pan) always active and never drop pins (multi-finger / double-tap are distinct from a single deliberate tap).
- **Status advance:** checklist **row-tap advances one stage** (+ undo); **row-expand stepper** sets any stage (regress/skip); **pin-tap selects** (flashes its row). Pins locate, checklist acts.
- **Create form:** `kind` + `label` required; `code` (R#C#) optional, free-text, unenforced; `subtype` optional (cabinets).
- **Creation:** tap-only in Slice 1 (every Slice-1 piece is pinned); store/checklist stay pin-optional for future Mozaik seeding; reverse flows (add-unpinned, pin-existing) deferred.
- **Status model:** completed-milestones with universal bookends `not_started` → <stages> → `done`. Progress = index / total.
- **Cut method:** **forced prompt** (Table saw / Toolpath CNC) when ticking `not_started → cut`.
- **Persistence:** dual-mode (`job_pieces` Supabase + localStorage fallback). Realtime → Slice 2.
- **Pins:** render current `(document, page)` only; checklist is **job-wide**; jump-to-pin deferred.
- **Delete:** piece/pin delete IN Slice 1 (two-step touch-safe confirm, reuse Slice 0 pattern).

---

## File Structure

**New:**
- `supabase/migrations/20260624_job_pieces.sql` — table + RLS + realtime publication.
- `features/drawings/lib/pipelines.ts` (+ `.test.ts`) — kinds, stages, lifecycle helpers.
- `features/drawings/lib/geometry.ts` (+ `.test.ts`) — normalized-coord + clamp helpers.
- `features/drawings/lib/piecesRowMap.ts` (+ `.test.ts`) — `PieceRow` ↔ `JobPiece`.
- `features/drawings/lib/piecesStore.tsx` — dual-mode provider + hooks.
- `features/drawings/components/PieceCreateForm.tsx` — create-on-pin form.
- `features/drawings/components/PieceChecklist.tsx` — grouped checklist + advance/stepper/delete.
- `features/drawings/components/CutMethodPrompt.tsx` — forced inhouse/cnc choice at `cut`.
- `features/drawings/components/PiecePin.tsx` — pin marker.
- `features/drawings/components/DrawingStage.tsx` — pan/zoom + overlay wrapper around a rendered drawing; hosts pins + tap-capture.

**Modified:**
- `shared/lib/types.ts` — `PieceKind`, `PieceStatus`, `CutMethod`, `JobPiece`.
- `src/app/layout.tsx` — mount `PiecesProvider`.
- `features/drawings/components/DrawingsView.tsx` — add-pin mode, checklist panel, wire stage/pins.
- `features/drawings/components/DrawingDoc.tsx` — render inside `DrawingStage` (pan/zoom + overlay).

---

### Task 1: DB migration — `job_pieces` table + RLS + realtime

**Files:**
- Create: `supabase/migrations/20260624_job_pieces.sql`
- Apply via Supabase MCP `apply_migration` (name: `job_pieces`).

**Interfaces:**
- Produces: table `public.job_pieces` with columns used by `piecesRowMap` (Task 4): `id uuid pk`, `project_id text not null`, `kind text not null`, `subtype text`, `code text`, `room text`, `label text not null`, `cut_method text check in (inhouse,cnc_sub)`, `status text not null default 'not_started'`, `status_updated_at timestamptz`, `status_updated_by text`, `source text not null default 'manual' check in (manual,mozaik)`, `source_ref text`, `pin_document_id text`, `pin_page int`, `pin_x numeric`, `pin_y numeric`, `sort_order int not null default 0`, `dimensions text`, `material text`, `edgeband text`, `parent_ref text`, `created_by text`, `created_at timestamptz not null default now()`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260624_job_pieces.sql`:

```sql
-- Drawings Slice 1: trackable pieces (cabinets + finish parts) with per-kind
-- status lifecycles, optionally pinned to a drawing. See the drawings spec +
-- docs/domain.md (Piece / Stage / Status / Cut method). Status values are
-- validated in code (pipelines.ts), not by a DB check, so kinds/stages can
-- evolve without a migration. RLS = authenticated (single-tenant pattern).

CREATE TABLE IF NOT EXISTS public.job_pieces (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        text NOT NULL,
  kind              text NOT NULL,
  subtype           text,
  code              text,
  room              text,
  label             text NOT NULL,
  cut_method        text CHECK (cut_method IN ('inhouse','cnc_sub')),
  status            text NOT NULL DEFAULT 'not_started',
  status_updated_at timestamptz,
  status_updated_by text,
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','mozaik')),
  source_ref        text,
  pin_document_id   text,
  pin_page          int,
  pin_x             numeric,
  pin_y             numeric,
  sort_order        int NOT NULL DEFAULT 0,
  dimensions        text,
  material          text,
  edgeband          text,
  parent_ref        text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_pieces_project_idx ON public.job_pieces (project_id);

ALTER TABLE public.job_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_pieces_authenticated_all ON public.job_pieces
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime is consumed in Slice 2; enabling the publication now is harmless.
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_pieces;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `apply_migration`, `name: "job_pieces"`, project `zycdmlkffbaqofaygddx`, the SQL above.
> If the `ALTER PUBLICATION` line errors because the table is already in the publication, drop that line and re-apply; it's non-essential for Slice 1.

- [ ] **Step 3: Verify**

Via MCP `execute_sql`:
```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_schema='public' and table_name='job_pieces' order by ordinal_position;
```
Expected: all columns above; `status` default `'not_started'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260624_job_pieces.sql
git commit -m "feat(drawings): job_pieces table + RLS + realtime publication"
```

---

### Task 2: Piece types

**Files:**
- Modify: `shared/lib/types.ts` (append near `ProjectDocument`)

**Interfaces:**
- Produces: `PieceKind`, `CutMethod`, `PieceSource`, `PieceStatus`, `JobPiece`.

- [ ] **Step 1: Add the types**

Append to `shared/lib/types.ts`:

```typescript
export type PieceKind = "cabinet" | "end_panel" | "scribe" | "toe_kick" | "filler";
export type CutMethod = "inhouse" | "cnc_sub";
export type PieceSource = "manual" | "mozaik";
/** A lifecycle position: "not_started" | one of the kind's stages | "done". */
export type PieceStatus = string;

export type JobPiece = {
  id: string;
  projectId: string;
  kind: PieceKind;
  subtype?: string | null;
  code?: string | null;
  room?: string | null;
  label: string;
  cutMethod?: CutMethod | null;
  status: PieceStatus;
  statusUpdatedAt?: string | null;
  statusUpdatedBy?: string | null;
  source: PieceSource;
  sourceRef?: string | null;
  pinDocumentId?: string | null;
  pinPage?: number | null;
  pinX?: number | null;
  pinY?: number | null;
  sortOrder: number;
  dimensions?: string | null;
  material?: string | null;
  edgeband?: string | null;
  parentRef?: string | null;
  createdBy?: string | null;
  createdAt: string;
};
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add shared/lib/types.ts
git commit -m "feat(drawings): JobPiece + piece type vocabulary"
```
Expected: tsc clean.

---

### Task 3: Stage pipelines + lifecycle helpers (TDD)

**Files:**
- Create: `features/drawings/lib/pipelines.ts`
- Test: `features/drawings/lib/pipelines.test.ts`

**Interfaces:**
- Consumes: `PieceKind` (Task 2).
- Produces: `NOT_STARTED='not_started'`, `DONE='done'`; `STAGE_PIPELINES: Record<PieceKind, readonly string[]>`; `lifecycle(kind): string[]` (`[not_started, ...stages, done]`); `nextStatus(kind, status): string | null`; `prevStatus(kind, status): string | null`; `progress(kind, status): { index: number; total: number }`; `stageLabel(stage): string`; `isCutTransition(kind, from, to): boolean` (true when advancing into `cut`).

- [ ] **Step 1: Write the failing test**

Create `features/drawings/lib/pipelines.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  NOT_STARTED, DONE, lifecycle, nextStatus, prevStatus, progress,
  isCutTransition, STAGE_PIPELINES,
} from "./pipelines";

describe("pipelines", () => {
  it("cabinet lifecycle is bookended not_started..done", () => {
    const lc = lifecycle("cabinet");
    expect(lc[0]).toBe(NOT_STARTED);
    expect(lc[lc.length - 1]).toBe(DONE);
    expect(lc).toContain("assembled");
    expect(lc).toHaveLength(STAGE_PIPELINES.cabinet.length + 2);
  });

  it("part lifecycle uses the part stages", () => {
    expect(lifecycle("end_panel")).toContain("edgebanded");
    expect(lifecycle("end_panel")).not.toContain("assembled");
  });

  it("advances and regresses one step", () => {
    expect(nextStatus("cabinet", NOT_STARTED)).toBe("cut");
    expect(nextStatus("cabinet", "cut")).toBe("assembled");
    expect(prevStatus("cabinet", "cut")).toBe(NOT_STARTED);
  });

  it("nextStatus past done is null; prev before not_started is null", () => {
    expect(nextStatus("cabinet", DONE)).toBeNull();
    expect(prevStatus("cabinet", NOT_STARTED)).toBeNull();
  });

  it("progress is index/total", () => {
    expect(progress("cabinet", NOT_STARTED)).toEqual({ index: 0, total: lifecycle("cabinet").length - 1 });
    expect(progress("cabinet", DONE).index).toBe(lifecycle("cabinet").length - 1);
  });

  it("flags the cut transition (for the forced cut-method prompt)", () => {
    expect(isCutTransition("cabinet", NOT_STARTED, "cut")).toBe(true);
    expect(isCutTransition("cabinet", "cut", "assembled")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run features/drawings/lib/pipelines.test.ts`) — module not found.

- [ ] **Step 3: Write the implementation**

Create `features/drawings/lib/pipelines.ts`:

```typescript
import type { PieceKind } from "@shared/lib/types";

export const NOT_STARTED = "not_started";
export const DONE = "done";

export const CABINET_STAGES = [
  "cut", "assembled", "finished", "packed", "delivered", "installed", "final_adjustments",
] as const;
export const PART_STAGES = [
  "cut", "edgebanded", "sanded", "sprayed", "packed", "delivered", "installed", "final_adjustments",
] as const;

export const STAGE_PIPELINES: Record<PieceKind, readonly string[]> = {
  cabinet: CABINET_STAGES,
  end_panel: PART_STAGES,
  scribe: PART_STAGES,
  toe_kick: PART_STAGES,
  filler: PART_STAGES,
};

/** Full ordered lifecycle including the not_started/done bookends. */
export function lifecycle(kind: PieceKind): string[] {
  return [NOT_STARTED, ...STAGE_PIPELINES[kind], DONE];
}

export function nextStatus(kind: PieceKind, status: string): string | null {
  const lc = lifecycle(kind);
  const i = lc.indexOf(status);
  return i >= 0 && i < lc.length - 1 ? lc[i + 1] : null;
}

export function prevStatus(kind: PieceKind, status: string): string | null {
  const lc = lifecycle(kind);
  const i = lc.indexOf(status);
  return i > 0 ? lc[i - 1] : null;
}

export function progress(kind: PieceKind, status: string): { index: number; total: number } {
  const lc = lifecycle(kind);
  const i = lc.indexOf(status);
  return { index: i < 0 ? 0 : i, total: lc.length - 1 };
}

export function isCutTransition(kind: PieceKind, from: string, to: string): boolean {
  return to === "cut" && from !== "cut";
}

const LABELS: Record<string, string> = {
  not_started: "Not started", cut: "Cut", assembled: "Assembled", finished: "Finished",
  edgebanded: "Edgebanded", sanded: "Sanded", sprayed: "Sprayed", packed: "Packed",
  delivered: "Delivered", installed: "Installed", final_adjustments: "Final adjustments",
  done: "Done",
};
export function stageLabel(stage: string): string {
  return LABELS[stage] ?? stage;
}
```

- [ ] **Step 4: Run — expect PASS.** `npx vitest run features/drawings/lib/pipelines.test.ts`

- [ ] **Step 5: Commit**

```bash
git add features/drawings/lib/pipelines.ts features/drawings/lib/pipelines.test.ts
git commit -m "feat(drawings): stage pipelines + lifecycle helpers (TDD)"
```

---

### Task 4: Piece row mapping (TDD)

**Files:**
- Create: `features/drawings/lib/piecesRowMap.ts`
- Test: `features/drawings/lib/piecesRowMap.test.ts`

**Interfaces:**
- Consumes: `JobPiece` (Task 2).
- Produces: `type PieceRow` (snake_case mirror of the table); `rowToPiece(row): JobPiece`; `pieceToRow(piece): PieceRow`. Round-trips all fields; nullables default to `null`.

- [ ] **Step 1: Write the failing test**

Create `features/drawings/lib/piecesRowMap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rowToPiece, pieceToRow, type PieceRow } from "./piecesRowMap";
import type { JobPiece } from "@shared/lib/types";

const row: PieceRow = {
  id: "p1", project_id: "j1", kind: "cabinet", subtype: "base", code: "R1C7",
  room: "Kitchen", label: "3 Drawer", cut_method: "inhouse", status: "cut",
  status_updated_at: "2026-06-24T00:00:00Z", status_updated_by: "a@b.c",
  source: "manual", source_ref: null, pin_document_id: "d1", pin_page: 1,
  pin_x: 0.5, pin_y: 0.25, sort_order: 0, dimensions: null, material: null,
  edgeband: null, parent_ref: null, created_by: "a@b.c", created_at: "2026-06-24T00:00:00Z",
};

describe("piecesRowMap", () => {
  it("maps a row to a JobPiece", () => {
    const p = rowToPiece(row);
    expect(p.projectId).toBe("j1");
    expect(p.code).toBe("R1C7");
    expect(p.cutMethod).toBe("inhouse");
    expect(p.pinX).toBe(0.5);
  });
  it("round-trips", () => {
    expect(pieceToRow(rowToPiece(row))).toEqual(row);
  });
  it("defaults absent nullables to null", () => {
    const piece: JobPiece = {
      id: "p2", projectId: "j1", kind: "filler", label: "Filler",
      status: "not_started", source: "manual", sortOrder: 0, createdAt: "x",
    };
    const r = pieceToRow(piece);
    expect(r.code).toBeNull();
    expect(r.pin_x).toBeNull();
    expect(r.cut_method).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run features/drawings/lib/piecesRowMap.test.ts`

- [ ] **Step 3: Write the implementation**

Create `features/drawings/lib/piecesRowMap.ts`:

```typescript
import type { CutMethod, JobPiece, PieceKind, PieceSource } from "@shared/lib/types";

export type PieceRow = {
  id: string;
  project_id: string;
  kind: PieceKind;
  subtype: string | null;
  code: string | null;
  room: string | null;
  label: string;
  cut_method: CutMethod | null;
  status: string;
  status_updated_at: string | null;
  status_updated_by: string | null;
  source: PieceSource;
  source_ref: string | null;
  pin_document_id: string | null;
  pin_page: number | null;
  pin_x: number | null;
  pin_y: number | null;
  sort_order: number;
  dimensions: string | null;
  material: string | null;
  edgeband: string | null;
  parent_ref: string | null;
  created_by: string | null;
  created_at: string;
};

export function rowToPiece(row: PieceRow): JobPiece {
  return {
    id: row.id, projectId: row.project_id, kind: row.kind, subtype: row.subtype,
    code: row.code, room: row.room, label: row.label, cutMethod: row.cut_method,
    status: row.status, statusUpdatedAt: row.status_updated_at,
    statusUpdatedBy: row.status_updated_by, source: row.source, sourceRef: row.source_ref,
    pinDocumentId: row.pin_document_id, pinPage: row.pin_page, pinX: row.pin_x, pinY: row.pin_y,
    sortOrder: row.sort_order, dimensions: row.dimensions, material: row.material,
    edgeband: row.edgeband, parentRef: row.parent_ref, createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function pieceToRow(p: JobPiece): PieceRow {
  return {
    id: p.id, project_id: p.projectId, kind: p.kind, subtype: p.subtype ?? null,
    code: p.code ?? null, room: p.room ?? null, label: p.label, cut_method: p.cutMethod ?? null,
    status: p.status, status_updated_at: p.statusUpdatedAt ?? null,
    status_updated_by: p.statusUpdatedBy ?? null, source: p.source, source_ref: p.sourceRef ?? null,
    pin_document_id: p.pinDocumentId ?? null, pin_page: p.pinPage ?? null,
    pin_x: p.pinX ?? null, pin_y: p.pinY ?? null, sort_order: p.sortOrder,
    dimensions: p.dimensions ?? null, material: p.material ?? null, edgeband: p.edgeband ?? null,
    parent_ref: p.parentRef ?? null, created_by: p.createdBy ?? null, created_at: p.createdAt,
  };
}
```

- [ ] **Step 4: Run — expect PASS.** `npx vitest run features/drawings/lib/piecesRowMap.test.ts`

- [ ] **Step 5: Commit**

```bash
git add features/drawings/lib/piecesRowMap.ts features/drawings/lib/piecesRowMap.test.ts
git commit -m "feat(drawings): job_pieces row mapping (TDD)"
```

---

### Task 5: Normalized geometry helpers (TDD)

**Files:**
- Create: `features/drawings/lib/geometry.ts`
- Test: `features/drawings/lib/geometry.test.ts`

**Interfaces:**
- Produces: `clamp01(n): number`; `normalizePoint(offsetX, offsetY, width, height): { x: number; y: number }` (clamped 0–1); `denormalize(x, y, width, height): { left: number; top: number }`.

- [ ] **Step 1: Write the failing test**

Create `features/drawings/lib/geometry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { clamp01, normalizePoint, denormalize } from "./geometry";

describe("geometry", () => {
  it("clamps to 0..1", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
  it("normalizes a click within an element", () => {
    expect(normalizePoint(50, 25, 100, 100)).toEqual({ x: 0.5, y: 0.25 });
  });
  it("clamps out-of-bounds clicks", () => {
    expect(normalizePoint(150, -10, 100, 100)).toEqual({ x: 1, y: 0 });
  });
  it("denormalizes back to pixels", () => {
    expect(denormalize(0.5, 0.25, 200, 400)).toEqual({ left: 100, top: 100 });
  });
  it("guards a zero-sized element", () => {
    expect(normalizePoint(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run features/drawings/lib/geometry.test.ts`

- [ ] **Step 3: Write the implementation**

Create `features/drawings/lib/geometry.ts`:

```typescript
/** Normalized 0–1 geometry so pins/markup scale across zoom + device. Pure. */
export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function normalizePoint(
  offsetX: number, offsetY: number, width: number, height: number
): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return { x: clamp01(offsetX / width), y: clamp01(offsetY / height) };
}

export function denormalize(
  x: number, y: number, width: number, height: number
): { left: number; top: number } {
  return { left: x * width, top: y * height };
}
```

- [ ] **Step 4: Run — expect PASS.** `npx vitest run features/drawings/lib/geometry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add features/drawings/lib/geometry.ts features/drawings/lib/geometry.test.ts
git commit -m "feat(drawings): normalized geometry helpers (TDD)"
```

---

### Task 6: `piecesStore` (dual-mode provider) + mount

**Files:**
- Create: `features/drawings/lib/piecesStore.tsx`
- Modify: `src/app/layout.tsx` (mount `PiecesProvider` beside `DocumentsProvider`)
- Reference pattern: `features/documents/lib/documentsStore.tsx` (copy its dual-mode shape exactly).

**Interfaces:**
- Consumes: `JobPiece` (Task 2), `rowToPiece`/`pieceToRow`/`PieceRow` (Task 4), `getSupabase`/`hasSupabase` from `@shared/lib/supabase`.
- Produces: `PiecesProvider`; `usePieces(): { pieces, createPiece, updatePiece, deletePiece, backend }` with `createPiece(p: JobPiece) => Promise<void>`, `updatePiece(id: string, patch: Partial<JobPiece>) => Promise<void>`, `deletePiece(id: string) => Promise<void>`; `useProjectPieces(projectId: string): JobPiece[]` (sorted by `sortOrder` then `createdAt`).

- [ ] **Step 1: Add the table constant**

In `shared/lib/supabase.ts`, confirm/add a `JOB_PIECES_TABLE` export. Run:
`grep -n "DOCUMENTS_TABLE\|JOB_PIECES_TABLE" shared/lib/supabase.ts`
If `JOB_PIECES_TABLE` is absent, add next to `DOCUMENTS_TABLE`:
```typescript
export const JOB_PIECES_TABLE = "job_pieces";
```

- [ ] **Step 2: Write the store** (mirror `documentsStore.tsx`)

Create `features/drawings/lib/piecesStore.tsx`:

```tsx
"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { JOB_PIECES_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import type { JobPiece } from "@shared/lib/types";
import { rowToPiece, pieceToRow, type PieceRow } from "./piecesRowMap";

const STORAGE_KEY = "gw_job_pieces_v1";
type Backend = "supabase" | "localStorage";

type PiecesContextValue = {
  pieces: JobPiece[];
  backend: Backend;
  createPiece: (p: JobPiece) => Promise<void>;
  updatePiece: (id: string, patch: Partial<JobPiece>) => Promise<void>;
  deletePiece: (id: string) => Promise<void>;
};

const PiecesContext = createContext<PiecesContextValue | null>(null);

function localLoad(): JobPiece[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as JobPiece[]) : [];
  } catch {
    return [];
  }
}
function localSave(pieces: JobPiece[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pieces));
}

export function PiecesProvider({ children }: { children: ReactNode }) {
  const backend: Backend = hasSupabase() ? "supabase" : "localStorage";
  const [pieces, setPieces] = useState<JobPiece[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend === "localStorage") {
        if (!cancelled) { setPieces(localLoad()); setLoading(false); }
        return;
      }
      const { data, error } = await getSupabase().from(JOB_PIECES_TABLE).select("*");
      if (!cancelled) {
        if (!error && data) setPieces((data as PieceRow[]).map(rowToPiece));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [backend]);

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(pieces);
  }, [pieces, loading, backend]);

  const createPiece = useCallback(async (p: JobPiece) => {
    setPieces((prev) => [...prev, p]);
    if (backend === "supabase") {
      const { error } = await getSupabase().from(JOB_PIECES_TABLE).insert(pieceToRow(p));
      if (error) { setPieces((prev) => prev.filter((x) => x.id !== p.id)); throw error; }
    }
  }, [backend]);

  const updatePiece = useCallback(async (id: string, patch: Partial<JobPiece>) => {
    let prevSnapshot: JobPiece | undefined;
    setPieces((prev) => prev.map((x) => {
      if (x.id !== id) return x;
      prevSnapshot = x;
      return { ...x, ...patch };
    }));
    if (backend === "supabase") {
      const merged = prevSnapshot ? { ...prevSnapshot, ...patch } : undefined;
      if (merged) {
        const { error } = await getSupabase().from(JOB_PIECES_TABLE)
          .update(pieceToRow(merged)).eq("id", id);
        if (error) {
          if (prevSnapshot) setPieces((prev) => prev.map((x) => (x.id === id ? prevSnapshot! : x)));
          throw error;
        }
      }
    }
  }, [backend]);

  const deletePiece = useCallback(async (id: string) => {
    let removed: JobPiece | undefined;
    setPieces((prev) => { removed = prev.find((x) => x.id === id); return prev.filter((x) => x.id !== id); });
    if (backend === "supabase") {
      const { error } = await getSupabase().from(JOB_PIECES_TABLE).delete().eq("id", id);
      if (error) { if (removed) setPieces((prev) => [...prev, removed!]); throw error; }
    }
  }, [backend]);

  const value = useMemo<PiecesContextValue>(
    () => ({ pieces, backend, createPiece, updatePiece, deletePiece }),
    [pieces, backend, createPiece, updatePiece, deletePiece]
  );
  return <PiecesContext.Provider value={value}>{children}</PiecesContext.Provider>;
}

export function usePieces(): PiecesContextValue {
  const ctx = useContext(PiecesContext);
  if (!ctx) throw new Error("usePieces must be used inside <PiecesProvider>");
  return ctx;
}

export function useProjectPieces(projectId: string): JobPiece[] {
  const { pieces } = usePieces();
  return useMemo(
    () => pieces
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    [pieces, projectId]
  );
}
```

- [ ] **Step 3: Mount the provider** in `src/app/layout.tsx`

Add the import beside the other feature stores:
```tsx
import { PiecesProvider } from "@features/drawings/lib/piecesStore";
```
Wrap it inside the existing provider nest (place it adjacent to `DocumentsProvider` — same level). Find the `<DocumentsProvider>` open tag and add `<PiecesProvider>` immediately inside it (and its closing tag immediately before `</DocumentsProvider>`'s children close), e.g.:
```tsx
<DocumentsProvider>
  <PiecesProvider>
    {/* …existing children… */}
  </PiecesProvider>
</DocumentsProvider>
```
(Match the file's actual nesting; the only requirement is `PiecesProvider` wraps the app children.)

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add features/drawings/lib/piecesStore.tsx shared/lib/supabase.ts src/app/layout.tsx
git commit -m "feat(drawings): dual-mode piecesStore + provider mount"
```
Expected: tsc clean.

---

### Task 7: `DrawingStage` — pan/zoom + tap-capture overlay (tracer bullet; verify in browser early)

**Files:**
- Add dep: `react-zoom-pan-pinch`
- Create: `features/drawings/components/DrawingStage.tsx`
- Modify: `features/drawings/components/DrawingDoc.tsx` (render its PDF canvas / `<img>` inside `DrawingStage`)

**Interfaces:**
- Consumes: `normalizePoint` (Task 5).
- Produces: `<DrawingStage addingPin={boolean} onPlace={(x:number,y:number)=>void} overlay={ReactNode}>{children}</DrawingStage>` — wraps content in a pinch/double-tap/drag transform; when `addingPin`, a transparent capture layer turns a tap into a normalized `onPlace(x,y)`; `overlay` (pins) renders in the same transformed content space so pins track zoom/pan.

- [ ] **Step 1: Install the dep**

Run: `npm install react-zoom-pan-pinch`
Expected: appears in `package.json` dependencies.
> **Hand-roll fallback (only if the lib misbehaves):** drop the dep; wrap content in a `<div>` with CSS `touch-action: none`, track pointer events for pinch (two-pointer distance) + drag, apply `transform: translate()/scale()`. Keep the same `DrawingStage` props so callers don't change.

- [ ] **Step 2: Write `DrawingStage`**

Create `features/drawings/components/DrawingStage.tsx`:

```tsx
"use client";

import { useRef, type ReactNode } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { normalizePoint } from "../lib/geometry";

export function DrawingStage({
  addingPin, onPlace, overlay, children,
}: {
  addingPin: boolean;
  onPlace: (x: number, y: number) => void;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  function handleCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (!addingPin) return;
    const el = contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // rect is post-transform; convert the click to content-local 0..1.
    const { x, y } = normalizePoint(
      e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height
    );
    onPlace(x, y);
  }

  return (
    <TransformWrapper
      doubleClick={{ mode: "toggle", step: 0.7 }}
      panning={{ disabled: addingPin }}     // in add-pin mode a one-finger drag places, not pans
      pinch={{ step: 5 }}
      wheel={{ step: 0.2 }}
      minScale={1}
      maxScale={6}
    >
      <TransformComponent
        wrapperClass="!w-full !h-full"
        contentClass="!w-full"
      >
        <div ref={contentRef} className="relative w-full" onClick={handleCapture}>
          {children}
          {/* Pins render in the same transformed content box (normalized coords). */}
          <div className={addingPin ? "absolute inset-0 cursor-crosshair" : "pointer-events-none absolute inset-0"}>
            {overlay}
          </div>
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
}
```

- [ ] **Step 3: Render `DrawingDoc` content inside `DrawingStage`**

In `features/drawings/components/DrawingDoc.tsx`, accept two optional props and pass through to a `DrawingStage` wrapping the rendered PDF canvas / image. Change the `DrawingDoc` signature to:
```tsx
export function DrawingDoc({
  doc, addingPin = false, onPlace = () => {}, overlay,
}: {
  doc: ProjectDocument;
  addingPin?: boolean;
  onPlace?: (x: number, y: number) => void;
  overlay?: React.ReactNode;
}) { /* … */ }
```
Wrap the **PDF canvas** branch and the **image** branch each in `<DrawingStage addingPin={addingPin} onPlace={onPlace} overlay={overlay}>…</DrawingStage>`. Keep the link branch unchanged (no pins on view-only links). Import `DrawingStage` from `./DrawingStage`. The existing +/- zoom buttons can stay for the PDF page toolbar (page nav lives outside the stage); the stage adds gesture zoom on top.
> Keep the PDF page-nav toolbar **outside** `DrawingStage` (it's chrome, not content). Only the rendered page canvas / image goes inside.

- [ ] **Step 4: Type-check + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add package.json package-lock.json features/drawings/components/DrawingStage.tsx features/drawings/components/DrawingDoc.tsx
git commit -m "feat(drawings): DrawingStage pan/zoom + tap-capture overlay"
```
Expected: clean. (Browser verification of gestures happens in Task 12 smoke; if pins don't track zoom there, revisit the contentRef/getBoundingClientRect math.)

---

### Task 8: `PiecePin` marker

**Files:**
- Create: `features/drawings/components/PiecePin.tsx`

**Interfaces:**
- Consumes: `JobPiece` (Task 2), `progress`/`stageLabel` (Task 3).
- Produces: `<PiecePin piece={JobPiece} selected={boolean} onSelect={()=>void} />` — absolutely positioned at `pinX/pinY` (as `%`), shows the `code` (or label initial) + a status-tinted dot; ≥44px tap target.

- [ ] **Step 1: Write the component**

Create `features/drawings/components/PiecePin.tsx`:

```tsx
"use client";

import type { JobPiece } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { DONE, NOT_STARTED } from "../lib/pipelines";

function tone(status: string): string {
  if (status === DONE) return "bg-status-complete";
  if (status === NOT_STARTED) return "bg-text-tertiary";
  if (status === "installed" || status === "final_adjustments") return "bg-status-on-track";
  return "bg-status-at-risk";
}

export function PiecePin({
  piece, selected, onSelect,
}: { piece: JobPiece; selected: boolean; onSelect: () => void }) {
  if (piece.pinX == null || piece.pinY == null) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{ left: `${piece.pinX * 100}%`, top: `${piece.pinY * 100}%` }}
      className={cn(
        "pointer-events-auto absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
        "text-[10px] font-semibold text-white shadow-floating duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        tone(piece.status),
        selected ? "ring-2 ring-accent ring-offset-1" : ""
      )}
      title={`${piece.code ?? piece.label} — ${piece.status}`}
      aria-label={`${piece.code ?? piece.label}, ${piece.status}`}
    >
      {(piece.code ?? piece.label).slice(0, 4)}
    </button>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add features/drawings/components/PiecePin.tsx
git commit -m "feat(drawings): PiecePin marker"
```

---

### Task 9: `PieceCreateForm` + `CutMethodPrompt`

**Files:**
- Create: `features/drawings/components/PieceCreateForm.tsx`
- Create: `features/drawings/components/CutMethodPrompt.tsx`

**Interfaces:**
- Consumes: `PieceKind`/`CutMethod` (Task 2).
- Produces:
  - `<PieceCreateForm onCancel onCreate={(d:{kind:PieceKind;label:string;code?:string;subtype?:string})=>void} />` — kind select (5 kinds), label (required), code (optional, `R1C7` placeholder), subtype (optional, shown only for `cabinet`). Submit disabled until label non-empty.
  - `<CutMethodPrompt onPick={(m:CutMethod)=>void} onSkip />` — two big buttons "Table saw" (`inhouse`) / "Toolpath CNC" (`cnc_sub`) + a "Skip" link.

- [ ] **Step 1: Write `CutMethodPrompt`**

Create `features/drawings/components/CutMethodPrompt.tsx`:

```tsx
"use client";

import type { CutMethod } from "@shared/lib/types";

export function CutMethodPrompt({
  label, onPick, onSkip,
}: { label: string; onPick: (m: CutMethod) => void; onSkip: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3 shadow-resting">
      <p className="text-sm text-text-primary">How was <span className="font-medium">{label}</span> cut?</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onPick("inhouse")}
          className="min-h-[44px] flex-1 rounded-full bg-ink-pill px-3 text-sm font-medium text-white duration-fast hover:bg-accent-active">
          Table saw
        </button>
        <button type="button" onClick={() => onPick("cnc_sub")}
          className="min-h-[44px] flex-1 rounded-full border border-border bg-surface px-3 text-sm font-medium text-text-primary duration-fast hover:bg-surface-muted">
          Toolpath CNC
        </button>
      </div>
      <button type="button" onClick={onSkip} className="text-xs text-text-tertiary hover:text-text-secondary">
        Skip for now
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write `PieceCreateForm`**

Create `features/drawings/components/PieceCreateForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { PieceKind } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";

const KIND_LABELS: Record<PieceKind, string> = {
  cabinet: "Cabinet", end_panel: "End panel", scribe: "Scribe",
  toe_kick: "Toe kick", filler: "Filler",
};
const KINDS = Object.keys(KIND_LABELS) as PieceKind[];

export function PieceCreateForm({
  onCancel, onCreate,
}: {
  onCancel: () => void;
  onCreate: (d: { kind: PieceKind; label: string; code?: string; subtype?: string }) => void;
}) {
  const [kind, setKind] = useState<PieceKind>("cabinet");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [subtype, setSubtype] = useState("");
  const canSave = label.trim().length > 0;

  const field = "min-h-[44px] w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-soft";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        onCreate({
          kind, label: label.trim(),
          code: code.trim() || undefined,
          subtype: kind === "cabinet" && subtype.trim() ? subtype.trim() : undefined,
        });
      }}
      className="space-y-2 rounded-lg border border-border bg-surface p-3 shadow-resting"
    >
      <select value={kind} onChange={(e) => setKind(e.target.value as PieceKind)} className={field}>
        {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
      </select>
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. 3 Drawer)" className={field} />
      <input value={code} onChange={(e) => setCode(e.target.value)}
        placeholder="Code (optional, e.g. R1C7)" className={field} />
      {kind === "cabinet" && (
        <input value={subtype} onChange={(e) => setSubtype(e.target.value)}
          placeholder="Subtype (optional: base / wall / tall / island)" className={field} />
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="min-h-[44px] flex-1 rounded-full border border-border bg-surface text-sm text-text-secondary duration-fast hover:bg-surface-muted">
          Cancel
        </button>
        <button type="submit" disabled={!canSave}
          className={cn(
            "min-h-[44px] flex-1 rounded-full bg-ink-pill text-sm font-medium text-white duration-fast hover:bg-accent-active",
            "disabled:cursor-not-allowed disabled:bg-text-disabled"
          )}>
          Add piece
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Type-check + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add features/drawings/components/PieceCreateForm.tsx features/drawings/components/CutMethodPrompt.tsx
git commit -m "feat(drawings): piece create form + cut-method prompt"
```

---

### Task 10: `PieceChecklist` (grouped, advance + stepper + delete)

**Files:**
- Create: `features/drawings/components/PieceChecklist.tsx`

**Interfaces:**
- Consumes: `JobPiece` (Task 2); `lifecycle`/`nextStatus`/`progress`/`stageLabel`/`isCutTransition`/`NOT_STARTED`/`DONE` (Task 3); `CutMethodPrompt` (Task 9).
- Produces: `<PieceChecklist pieces={JobPiece[]} selectedId onSelect onAdvance onSetStatus onSetCutMethod onDelete />` where `onAdvance(piece)`, `onSetStatus(piece, status)`, `onSetCutMethod(piece, method)`, `onDelete(piece)`. Groups into **Cabinets** (`kind==='cabinet'`) and **Parts** (everything else); each row: code + label + progress badge; row-tap = advance; chevron = stepper; trash = two-step delete. When an advance is a cut-transition, render `CutMethodPrompt` inline before committing.

- [ ] **Step 1: Write the component**

Create `features/drawings/components/PieceChecklist.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import type { CutMethod, JobPiece } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import {
  lifecycle, nextStatus, progress, stageLabel, isCutTransition, DONE,
} from "../lib/pipelines";
import { CutMethodPrompt } from "./CutMethodPrompt";

export function PieceChecklist({
  pieces, selectedId, onSelect, onAdvance, onSetStatus, onSetCutMethod, onDelete,
}: {
  pieces: JobPiece[];
  selectedId: string | null;
  onSelect: (p: JobPiece) => void;
  onAdvance: (p: JobPiece) => void;
  onSetStatus: (p: JobPiece, status: string) => void;
  onSetCutMethod: (p: JobPiece, m: CutMethod) => void;
  onDelete: (p: JobPiece) => void;
}) {
  const cabinets = pieces.filter((p) => p.kind === "cabinet");
  const parts = pieces.filter((p) => p.kind !== "cabinet");
  return (
    <div className="flex flex-col gap-4 p-3">
      <Group title="Cabinets" pieces={cabinets} {...{ selectedId, onSelect, onAdvance, onSetStatus, onSetCutMethod, onDelete }} />
      <Group title="Parts" pieces={parts} {...{ selectedId, onSelect, onAdvance, onSetStatus, onSetCutMethod, onDelete }} />
    </div>
  );
}

function Group({
  title, pieces, selectedId, onSelect, onAdvance, onSetStatus, onSetCutMethod, onDelete,
}: {
  title: string; pieces: JobPiece[]; selectedId: string | null;
  onSelect: (p: JobPiece) => void; onAdvance: (p: JobPiece) => void;
  onSetStatus: (p: JobPiece, s: string) => void; onSetCutMethod: (p: JobPiece, m: CutMethod) => void;
  onDelete: (p: JobPiece) => void;
}) {
  if (pieces.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-micro font-semibold uppercase tracking-wider text-text-tertiary">
        {title} · {pieces.length}
      </h3>
      <div className="space-y-1">
        {pieces.map((p) => (
          <PieceRow key={p.id} piece={p} selected={selectedId === p.id}
            onSelect={() => onSelect(p)} onAdvance={() => onAdvance(p)}
            onSetStatus={(s) => onSetStatus(p, s)} onSetCutMethod={(m) => onSetCutMethod(p, m)}
            onDelete={() => onDelete(p)} />
        ))}
      </div>
    </div>
  );
}

function PieceRow({
  piece, selected, onSelect, onAdvance, onSetStatus, onSetCutMethod, onDelete,
}: {
  piece: JobPiece; selected: boolean; onSelect: () => void; onAdvance: () => void;
  onSetStatus: (s: string) => void; onSetCutMethod: (m: CutMethod) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [askCut, setAskCut] = useState(false);
  const { index, total } = progress(piece.kind, piece.status);

  function handleAdvance() {
    const to = nextStatus(piece.kind, piece.status);
    if (!to) return;
    if (isCutTransition(piece.kind, piece.status, to)) { setAskCut(true); return; }
    onSelect();
    onAdvance();
  }

  return (
    <div className={cn("rounded-md duration-fast", selected ? "bg-surface-muted" : "hover:bg-surface-muted")}>
      <div className="flex items-center gap-1">
        <button onClick={handleAdvance}
          className="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md">
          <span className="min-w-0">
            <span className="block truncate text-sm text-text-primary">
              {piece.code ? `${piece.code} · ` : ""}{piece.label}
            </span>
            <span className="text-micro uppercase tracking-wider text-text-tertiary">
              {stageLabel(piece.status)}{piece.cutMethod ? ` · ${piece.cutMethod === "cnc_sub" ? "CNC" : "saw"}` : ""}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-micro tabular-nums text-text-secondary">
            {index}/{total}
          </span>
        </button>
        <button onClick={() => setOpen((v) => !v)} aria-label="Edit stage"
          className="flex h-11 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:text-text-secondary">
          <ChevronDown className={cn("h-4 w-4 duration-fast", open && "rotate-180")} />
        </button>
        <button onClick={() => (armed ? onDelete() : setArmed(true))}
          aria-label={armed ? `Confirm delete ${piece.label}` : `Delete ${piece.label}`}
          className={cn(
            "flex h-11 w-8 shrink-0 items-center justify-center rounded-md duration-fast",
            armed ? "bg-status-blocked text-white" : "text-text-tertiary hover:bg-status-blocked-soft hover:text-status-blocked"
          )}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {askCut && (
        <div className="px-2.5 pb-2">
          <CutMethodPrompt label={piece.label}
            onPick={(m) => { setAskCut(false); onSelect(); onSetCutMethod(m); onAdvance(); }}
            onSkip={() => { setAskCut(false); onSelect(); onAdvance(); }} />
        </div>
      )}

      {open && (
        <div className="flex flex-wrap gap-1 px-2.5 pb-2">
          {lifecycle(piece.kind).map((s) => (
            <button key={s} onClick={() => { onSetStatus(s); setOpen(false); }}
              className={cn(
                "rounded-full px-2 py-1 text-micro duration-fast",
                s === piece.status ? "bg-ink-pill text-white" : "bg-surface text-text-secondary hover:bg-surface-muted"
              )}>
              {stageLabel(s)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add features/drawings/components/PieceChecklist.tsx
git commit -m "feat(drawings): PieceChecklist (advance, stepper, delete, cut prompt)"
```

---

### Task 11: Wire it into `DrawingsView` (add-pin mode + pins + checklist)

**Files:**
- Modify: `features/drawings/components/DrawingsView.tsx`

**Interfaces:**
- Consumes: `usePieces`/`useProjectPieces` (Task 6); `DrawingDoc` overlay/addingPin props (Task 7); `PiecePin` (Task 8); `PieceCreateForm` (Task 9); `PieceChecklist` (Task 10); `useAuth` (`@shared/lib/authStore`); `nextStatus`/`isCutTransition` (Task 3).
- Produces: the active drawing renders inside `DrawingDoc` with a pins overlay; an **"Add pin"** toggle in the header; a collapsible right **checklist** panel; create/advance/setStatus/setCutMethod/delete handlers calling the store.

- [ ] **Step 1: Add state + handlers + an "Add pin" toggle and checklist panel**

In `DrawingsView.tsx`:
1. Import: `useAuth`, `usePieces`, `useProjectPieces`, `PiecePin`, `PieceCreateForm`, `PieceChecklist`, `nextStatus`, `MapPin`/`ListChecks` icons from lucide-react, `crypto` id helper (reuse the one in `DrawingUpload` or inline `newId()`).
2. State: `const [addingPin, setAddingPin] = useState(false)`, `const [pendingPin, setPendingPin] = useState<{x:number;y:number}|null>(null)`, `const [selectedPieceId, setSelectedPieceId] = useState<string|null>(null)`, `const [showChecklist, setShowChecklist] = useState(true)`.
3. `const pieces = useProjectPieces(jobId)`; `const { createPiece, updatePiece, deletePiece } = usePieces()`; `const { user } = useAuth()`.
4. The current drawing's pins: `const pagePins = pieces.filter(p => p.pinDocumentId === active?.id && (p.pinPage ?? 1) === currentPage && p.pinX != null)`. (If `active` is a single-page image, treat page as 1. For PDFs, you need the current page — lift the PDF page index up, or for Slice 1 filter only by `pinDocumentId` and accept all pins on that doc; see note.)
   > **Page note:** Slice 0's `PdfCanvas` holds page state internally. For Slice 1, filter pins by `pinDocumentId` only (show the doc's pins) to avoid lifting page state in this slice; multi-page pin filtering by `pin_page` is a refinement. Record this as an assumption in the morning summary.
5. Handlers:
```tsx
async function handlePlace(x: number, y: number) {
  setPendingPin({ x, y });
  setAddingPin(false);
}
async function handleCreate(d: { kind: PieceKind; label: string; code?: string; subtype?: string }) {
  if (!pendingPin || !active) return;
  const id = newId();
  await createPiece({
    id, projectId: jobId, kind: d.kind, label: d.label, code: d.code ?? null,
    subtype: d.subtype ?? null, room: null, cutMethod: null, status: "not_started",
    statusUpdatedAt: null, statusUpdatedBy: null, source: "manual", sourceRef: null,
    pinDocumentId: active.id, pinPage: 1, pinX: pendingPin.x, pinY: pendingPin.y,
    sortOrder: pieces.length, dimensions: null, material: null, edgeband: null,
    parentRef: null, createdBy: user?.email ?? null, createdAt: new Date().toISOString(),
  });
  setPendingPin(null);
  setSelectedPieceId(id);
}
async function handleAdvance(p: JobPiece) {
  const to = nextStatus(p.kind, p.status);
  if (!to) return;
  await updatePiece(p.id, { status: to, statusUpdatedAt: new Date().toISOString(), statusUpdatedBy: user?.email ?? null });
}
async function handleSetStatus(p: JobPiece, status: string) {
  await updatePiece(p.id, { status, statusUpdatedAt: new Date().toISOString(), statusUpdatedBy: user?.email ?? null });
}
async function handleSetCutMethod(p: JobPiece, m: CutMethod) {
  await updatePiece(p.id, { cutMethod: m });
}
async function handleDeletePiece(p: JobPiece) {
  await deletePiece(p.id);
  if (selectedPieceId === p.id) setSelectedPieceId(null);
}
```
6. Header: add an "Add pin" toggle button beside the upload control:
```tsx
<button type="button" onClick={() => setAddingPin((v) => !v)}
  aria-pressed={addingPin}
  className={cn("inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium duration-fast",
    addingPin ? "bg-ink-pill text-white" : "border border-border bg-surface text-text-secondary hover:bg-surface-muted")}>
  <MapPin className="h-4 w-4" /> {addingPin ? "Tap drawing to place" : "Add pin"}
</button>
```
7. Pass the pins overlay + addingPin/onPlace into the active `DrawingDoc`:
```tsx
<DrawingDoc doc={active} addingPin={addingPin} onPlace={handlePlace}
  overlay={pagePins.map((p) => (
    <PiecePin key={p.id} piece={p} selected={selectedPieceId === p.id}
      onSelect={() => setSelectedPieceId(p.id)} />
  ))} />
```
8. Right checklist panel (collapsible), rendered beside `<main>`:
```tsx
{showChecklist && (
  <aside className="w-72 shrink-0 overflow-auto border-l border-border bg-surface">
    <PieceChecklist pieces={pieces} selectedId={selectedPieceId}
      onSelect={(p) => setSelectedPieceId(p.id)} onAdvance={handleAdvance}
      onSetStatus={handleSetStatus} onSetCutMethod={handleSetCutMethod} onDelete={handleDeletePiece} />
  </aside>
)}
```
   Add a toggle (e.g. a `ListChecks` button in the header) flipping `showChecklist`.
9. The pending-pin create form (overlay near the placed point, or simply a panel): when `pendingPin`, render `<PieceCreateForm onCancel={() => setPendingPin(null)} onCreate={handleCreate} />` (e.g., centered modal-ish container or in the checklist column top). Keep it simple — a small fixed panel is fine; do NOT introduce a modal library.

- [ ] **Step 2: Type-check + lint + build + commit**

```bash
npx tsc --noEmit && npm run lint && npm run build
git add features/drawings/components/DrawingsView.tsx
git commit -m "feat(drawings): add-pin mode, pins overlay, and piece checklist wired"
```
Expected: all clean; `/jobs/[id]/drawings` still compiles.

---

### Task 12: Impeccable pass + full gate + authed browser smoke (DoD)

**Files:**
- Polish touch-ups across the Slice 1 components as the pass finds them.

- [ ] **Step 1: Impeccable pass** — run the `impeccable` skill (polish) on the Drawings viewer: verify against `DESIGN.md` (sharp/quiet/focused, ≥44px targets, status color + text never color-alone, reduced-motion, contrast). Fix drift.

- [ ] **Step 2: Full gate**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: green. Vitest: pipelines + geometry + piecesRowMap + the Slice 0 suites all pass.

- [ ] **Step 3: Authed browser smoke (Playwright MCP, prod Supabase)**

Reset smoke user (`npx tsx scripts/reset-smoke-user.ts '<pw>'`), `PORT=3003 npm run dev` (separate from any build), sign in, open a job's `/drawings`, upload a PDF (or reuse one), then:
1. Toggle **Add pin** → tap the drawing → create form → add a **cabinet** (label, optional code) → a pin appears at the tap point and a checklist row under **Cabinets**.
2. Add a **part** (e.g. end panel) the same way → appears under **Parts**.
3. **Row-tap the cabinet** → advances `not_started → cut` → **cut-method prompt** appears → pick Table saw → advances; pin tint updates.
4. Advance each piece **through its full pipeline** to `done`; the progress badge climbs `index/total`.
5. **Pinch-zoom / double-tap / drag-pan** the drawing → pins stay locked to their spots.
6. **Tap a pin** → its checklist row highlights (select sync).
7. **Two-step delete** a piece from the checklist → row + pin gone.
8. **Reload** → pieces, pins, and statuses persist (Supabase). Zero console errors.
   Clean up any smoke pieces at the end (delete them).

- [ ] **Step 4: Commit polish (if any)**

```bash
git add -A
git commit -m "polish(drawings): Slice 1 impeccable pass + smoke fixes"
```

- [ ] **Step 5: Merge decision (per overnight mandate)**

If **every** gate + the full browser smoke pass with zero console errors: push, open PR, **auto-merge to main** (squash or merge), confirm CI green. Otherwise: push, open a PR, and leave a note in the morning summary describing exactly what blocked. Do **not** force a red gate.

---

## Self-Review

**Spec coverage (Slice 1 section + locked decisions):**
- `job_pieces` table → Task 1. ✅
- `pieces` store + `pipelines.ts` → Tasks 3, 6. ✅
- Tap-to-drop-pin → create piece (kind/label/code) → Tasks 7, 9, 11. ✅
- Checklist grouped Cabinets/Parts; advance status → Task 10, 11. ✅
- cut-method on `cut` → Tasks 3 (`isCutTransition`), 9 (`CutMethodPrompt`), 10/11 (wiring). ✅
- Pins ↔ checklist sync (pin-tap selects; row reflects) → Tasks 8, 10, 11. ✅
- Reload persists (dual-mode Supabase) → Task 6. ✅
- Pipeline/geometry unit tests → Tasks 3, 4, 5. ✅
- Gestures (pinch/double-tap/pan), pins track zoom → Task 7. ✅
- Delete in Slice 1 → Task 10. ✅
- DoD smoke → Task 12. ✅

**Placeholder scan:** none — every code step has complete code; the two "notes" (publication line; PDF page filtering) are explicit fallbacks/assumptions, not TODOs.

**Type consistency:** `JobPiece` field names (Task 2) used identically in `piecesRowMap` (4), `piecesStore` (6), `PiecePin` (8), `PieceChecklist` (10), `DrawingsView` (11). `nextStatus`/`prevStatus`/`progress`/`isCutTransition`/`lifecycle`/`stageLabel` signatures (Task 3) match all call sites. `DrawingStage` props (Task 7) match `DrawingDoc`'s pass-through and `DrawingsView`'s usage.

**Assumptions to surface in the morning summary:**
1. `react-zoom-pan-pinch` added (vetoable; hand-roll fallback documented in Task 7).
2. Slice-1 pins filter by `pinDocumentId` only (not `pin_page`) to avoid lifting PDF page state; multi-page pin filtering is a refinement.
3. Pin tint mapping in `PiecePin.tone()` is a first cut; the impeccable pass may refine the status→color scheme (kept to `status-*` tokens).

**Out of scope (later slices):** realtime (Slice 2) · ink markup, object-erase (Slice 3) · shapes/arrows/text (Slice 4) · sketchpad (Slice 5) · Mozaik CSV seeding + "pin an existing piece" reverse flow (later).
