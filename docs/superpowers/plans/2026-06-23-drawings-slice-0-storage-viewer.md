# Drawings — Slice 0 (Storage + Viewer spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload PDFs/images to a private Supabase Storage bucket against a job, and view them in a dedicated full-screen route opened by a shared button from the job / shop-floor / installer pages.

**Architecture:** Extend the existing `documents` table + store to carry uploaded files alongside Drive links. A new `features/drawings` folder owns: a storage lib (mirrors `features/reface/lib/storage.ts`), a pdf.js render lib, the viewer components, and a route `/jobs/[id]/drawings`. A shared `<DrawingsButton/>` (a styled `next/link`) launches it. No pieces/pins/markup in this slice.

**Tech Stack:** Next.js 14.2 (App Router) · React 18 · TypeScript strict · Supabase Storage (`@supabase/ssr`) · `pdfjs-dist` (new) · Tailwind design tokens · Vitest.

## Grill deltas (2026-06-23, grill-with-docs)

Four build decisions resolved after the plan was written. The task bodies below
predate these; where they conflict, **these win**:

- **Q1 — Upload `kind` is user-chosen, not hardcoded.** T7's `DrawingUpload` adds
  an inline `<select>` of `DOCUMENT_KIND_ORDER` (default `shop`); the chosen kind
  is written to the doc (the plan's literal `kind: "shop"` is replaced).
- **Q2 — Overview lists uploads as link-out rows (does not hide them).** T8's
  `DocumentsCard` change is NOT a `source !== "upload"` filter. Instead, an
  `upload`/`sketch` doc renders a lightweight row (label + kind + "View in
  Drawings →" link) rather than a Drive `<iframe>`. Keeps **Document** one list
  per `domain.md`.
- **Q3 — `uploaded_by` = login email.** T7 stamps `uploaded_by =
  useAuth().user?.email ?? null`. The User↔Worker "Employee" unification is
  flagged in `domain.md` as a future, ADR-worthy slice — not built here.
- **Q4 — Delete control in the Drawings sidebar.** T7 adds a per-item trash
  button: for `source='upload'` it calls `removeDrawing(storagePath)` then
  `deleteDocument(id)`; for link/sketch just `deleteDocument(id)`. The store
  already exposes `deleteDocument`.
- **Note (no action):** signed-URL TTL stays 1 h; mark `SIGNED_URL_TTL` with a
  `TODO(slice-3)` for refresh-on-expiry once markup lands.

## Global Constraints

- Path aliases only: `@/*`, `@features/*`, `@shared/*`. No deep `../../../` across boundaries.
- `"use client"` only on components using hooks/state/browser APIs. Route pages stay thin.
- Components `PascalCase.tsx` named exports; lib files `camelCase.ts`; stores end in `Store`.
- Tailwind **design tokens only** (`bg-ink-pill`, `text-text-tertiary`, `shadow-resting`, `duration-fast`, …). No hardcoded hex/magic spacing.
- Money via `formatCAD` (not relevant this slice).
- Domain terms per `docs/domain.md` (Document, Drawing, Sketch — this slice; Piece/Pin later).
- Storage decision governed by **ADR 0016** (active in Supabase, links view-only).
- Verification gate (must pass before a task's commit): `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Uploads **require Supabase** — no data-URL/offline fallback for files (unlike Reface photos).
- New dep approved in spec: `pdfjs-dist`. (No `react-pdf` wrapper — we call pdfjs directly.)

---

### Task 1: DB migration — extend `documents` + create `job-documents` bucket

**Files:**
- Create: `supabase/migrations/20260623_drawings_uploads.sql`
- Apply via Supabase MCP `apply_migration` (name: `drawings_uploads`).

**Interfaces:**
- Produces: `documents.source` (`upload`|`link`|`sketch`, default `link`), `documents.storage_path text`, `documents.mime text`, `documents.page_count int`; `documents.drive_url` becomes nullable; a private `job-documents` Storage bucket + 4 `bucket_id`-gated policies.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260623_drawings_uploads.sql`:

```sql
-- Drawings Slice 0: let `documents` hold uploaded files (Supabase Storage)
-- alongside Drive/URL links. Active drawings live in Supabase; links stay
-- view-only. See ADR 0016 + spec 2026-06-23-job-drawings-markup-design.md.

ALTER TABLE public.documents
  ALTER COLUMN drive_url DROP NOT NULL,
  ADD COLUMN source       text NOT NULL DEFAULT 'link'
                          CHECK (source IN ('upload','link','sketch')),
  ADD COLUMN storage_path text,
  ADD COLUMN mime         text,
  ADD COLUMN page_count   int;

COMMENT ON COLUMN public.documents.source IS
  'upload (Supabase Storage file) | link (external/Drive URL) | sketch (in-app canvas)';
COMMENT ON COLUMN public.documents.storage_path IS
  'Path within the private job-documents Storage bucket (when source=upload).';
COMMENT ON COLUMN public.documents.mime IS
  'MIME of the uploaded file (application/pdf, image/jpeg, image/png, image/webp).';
COMMENT ON COLUMN public.documents.page_count IS
  'PDF page count (1 for images); null until known.';

-- Private bucket for uploaded job drawings (mirrors reface-photos posture).
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-documents', 'job-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY job_documents_bucket_read ON storage.objects
  FOR SELECT USING (bucket_id = 'job-documents');
CREATE POLICY job_documents_bucket_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'job-documents');
CREATE POLICY job_documents_bucket_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'job-documents') WITH CHECK (bucket_id = 'job-documents');
CREATE POLICY job_documents_bucket_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'job-documents');
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP `apply_migration` tool with `name: "drawings_uploads"` and the SQL above (project: Goodwoods).

- [ ] **Step 3: Verify the columns + bucket exist**

Run via MCP `execute_sql`:
```sql
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema='public' and table_name='documents'
  and column_name in ('source','storage_path','mime','page_count','drive_url')
order by column_name;
select id from storage.buckets where id='job-documents';
```
Expected: 5 column rows (`drive_url` now `is_nullable = YES`; `source` present), and one bucket row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260623_drawings_uploads.sql
git commit -m "feat(drawings): documents upload columns + job-documents bucket (ADR 0016)"
```

---

### Task 2: Extend document types + row mapping (TDD)

**Files:**
- Modify: `shared/lib/types.ts` (ProjectDocument + new DocumentSource)
- Modify: `features/documents/lib/documentsRowMap.ts`
- Test: `features/documents/lib/documentsRowMap.test.ts` (create)

**Interfaces:**
- Produces: `type DocumentSource = "upload" | "link" | "sketch"`; `ProjectDocument` gains `source: DocumentSource`, `storagePath?: string | null`, `mime?: string | null`, `pageCount?: number | null`; `driveUrl` becomes `string | null`. `DocumentRow` gains `source`, `storage_path`, `mime`, `page_count`. `rowToDocument`/`documentToRow` round-trip all fields.

- [ ] **Step 1: Write the failing test**

Create `features/documents/lib/documentsRowMap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rowToDocument, documentToRow, type DocumentRow } from "./documentsRowMap";
import type { ProjectDocument } from "@shared/lib/types";

const uploadRow: DocumentRow = {
  id: "d1", project_id: "j1", kind: "shop", label: "Kitchen plan",
  drive_url: null, version: "R2", is_current: true, notes: null,
  uploaded_by: null, created_at: "2026-06-23T00:00:00Z",
  source: "upload", storage_path: "j1/d1.pdf", mime: "application/pdf", page_count: 3,
};

describe("documentsRowMap", () => {
  it("maps an uploaded-file row to a ProjectDocument", () => {
    const doc = rowToDocument(uploadRow);
    expect(doc.source).toBe("upload");
    expect(doc.storagePath).toBe("j1/d1.pdf");
    expect(doc.mime).toBe("application/pdf");
    expect(doc.pageCount).toBe(3);
    expect(doc.driveUrl).toBeNull();
  });

  it("round-trips an upload doc back to a row", () => {
    const doc: ProjectDocument = rowToDocument(uploadRow);
    expect(documentToRow(doc)).toEqual(uploadRow);
  });

  it("defaults a link doc's new fields to null", () => {
    const linkDoc: ProjectDocument = {
      id: "d2", projectId: "j1", kind: "designer", label: "Elevations",
      driveUrl: "https://drive.google.com/file/d/x/view", version: null,
      isCurrent: true, notes: null, uploadedBy: null,
      createdAt: "2026-06-23T00:00:00Z", source: "link",
    };
    const row = documentToRow(linkDoc);
    expect(row.source).toBe("link");
    expect(row.storage_path).toBeNull();
    expect(row.mime).toBeNull();
    expect(row.page_count).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/documents/lib/documentsRowMap.test.ts`
Expected: FAIL — `source`/`storagePath` not on the types; compile/type error.

- [ ] **Step 3: Extend the types**

In `shared/lib/types.ts`, replace the `ProjectDocument` type (lines ~79–90) with:

```typescript
export type DocumentSource = "upload" | "link" | "sketch";

export type ProjectDocument = {
  id: string;
  projectId: string;
  kind: DocumentKind;
  label: string;
  /** External/Drive URL when source='link'; null for uploads/sketches. */
  driveUrl: string | null;
  version?: string | null;
  isCurrent: boolean;
  notes?: string | null;
  uploadedBy?: string | null;
  createdAt: string;
  /** How the document is stored. Existing rows default to 'link'. */
  source: DocumentSource;
  /** Path in the private job-documents bucket when source='upload'. */
  storagePath?: string | null;
  /** MIME of the uploaded file. */
  mime?: string | null;
  /** PDF page count (1 for images); null until known. */
  pageCount?: number | null;
};
```

- [ ] **Step 4: Extend the row mapping**

Replace `features/documents/lib/documentsRowMap.ts` with:

```typescript
import type { DocumentKind, DocumentSource, ProjectDocument } from "@shared/lib/types";

export type DocumentRow = {
  id: string;
  project_id: string;
  kind: DocumentKind;
  label: string;
  drive_url: string | null;
  version: string | null;
  is_current: boolean;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  source: DocumentSource;
  storage_path: string | null;
  mime: string | null;
  page_count: number | null;
};

export function rowToDocument(row: DocumentRow): ProjectDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    label: row.label,
    driveUrl: row.drive_url,
    version: row.version,
    isCurrent: row.is_current,
    notes: row.notes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    source: row.source,
    storagePath: row.storage_path,
    mime: row.mime,
    pageCount: row.page_count,
  };
}

export function documentToRow(doc: ProjectDocument): DocumentRow {
  return {
    id: doc.id,
    project_id: doc.projectId,
    kind: doc.kind,
    label: doc.label,
    drive_url: doc.driveUrl ?? null,
    version: doc.version ?? null,
    is_current: doc.isCurrent,
    notes: doc.notes ?? null,
    uploaded_by: doc.uploadedBy ?? null,
    created_at: doc.createdAt,
    source: doc.source,
    storage_path: doc.storagePath ?? null,
    mime: doc.mime ?? null,
    page_count: doc.pageCount ?? null,
  };
}
```

- [ ] **Step 5: Make existing `ProjectDocument` creators set `source`**

The `documents` store and `AddDocumentForm` create link docs. In `features/documents/lib/documentsStore.tsx`, find where a `ProjectDocument` is constructed from the form callback (the `onSave` handler / `createDocument` caller in `DocumentsCard` + `/jobs/new`) and add `source: "link"` to each constructed object. Search:

Run: `grep -rn "driveUrl:" features src | grep -v "documentsRowMap\|driveUrl.ts"`
For each `ProjectDocument` literal found (DocumentsCard, jobs/new page), add `source: "link",`.

- [ ] **Step 6: Run tests + type-check**

Run: `npx vitest run features/documents/lib/documentsRowMap.test.ts && npx tsc --noEmit`
Expected: tests PASS; tsc clean (every `ProjectDocument` literal now has `source`).

- [ ] **Step 7: Commit**

```bash
git add shared/lib/types.ts features/documents/lib/documentsRowMap.ts features/documents/lib/documentsRowMap.test.ts features/documents/lib/documentsStore.tsx src/app/jobs/new/page.tsx
git commit -m "feat(drawings): extend ProjectDocument for uploads (source/storagePath/mime/pageCount)"
```

---

### Task 3: Upload validation logic (TDD)

**Files:**
- Create: `features/drawings/lib/upload.ts`
- Test: `features/drawings/lib/upload.test.ts`

**Interfaces:**
- Produces: `MAX_UPLOAD_BYTES = 52428800`; `ACCEPTED_UPLOAD_MIME` (pdf/jpeg/png/webp); `validateUploadFile(file: { type: string; size: number }): { ok: true } | { ok: false; reason: string }`; `isPdf(mime: string | null | undefined): boolean`.

- [ ] **Step 1: Write the failing test**

Create `features/drawings/lib/upload.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateUploadFile, isPdf, MAX_UPLOAD_BYTES } from "./upload";

describe("validateUploadFile", () => {
  it("accepts a PDF under the cap", () => {
    expect(validateUploadFile({ type: "application/pdf", size: 1024 })).toEqual({ ok: true });
  });
  it("accepts a JPEG under the cap", () => {
    expect(validateUploadFile({ type: "image/jpeg", size: 1024 })).toEqual({ ok: true });
  });
  it("rejects an unsupported type", () => {
    const r = validateUploadFile({ type: "text/plain", size: 10 });
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("reason");
  });
  it("rejects a file over the cap", () => {
    const r = validateUploadFile({ type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
});

describe("isPdf", () => {
  it("true for application/pdf", () => expect(isPdf("application/pdf")).toBe(true));
  it("false for images and null", () => {
    expect(isPdf("image/png")).toBe(false);
    expect(isPdf(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/drawings/lib/upload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `features/drawings/lib/upload.ts`:

```typescript
/** Upload guards for job drawings. Pure — no Supabase, no DOM. */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export const ACCEPTED_UPLOAD_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type UploadValidation = { ok: true } | { ok: false; reason: string };

const PRETTY_CAP = `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`;

export function validateUploadFile(file: { type: string; size: number }): UploadValidation {
  if (!ACCEPTED_UPLOAD_MIME.includes(file.type as (typeof ACCEPTED_UPLOAD_MIME)[number])) {
    return { ok: false, reason: "Only PDF or image files (JPG, PNG, WebP) can be uploaded." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `File is too large. Maximum is ${PRETTY_CAP}.` };
  }
  return { ok: true };
}

export function isPdf(mime: string | null | undefined): boolean {
  return mime === "application/pdf";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run features/drawings/lib/upload.test.ts`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add features/drawings/lib/upload.ts features/drawings/lib/upload.test.ts
git commit -m "feat(drawings): upload validation (type + 50MB cap)"
```

---

### Task 4: Storage lib + path helper (TDD for the pure part)

**Files:**
- Create: `features/drawings/lib/storage.ts`
- Test: `features/drawings/lib/storage.test.ts`

**Interfaces:**
- Produces: `JOB_DOCUMENTS_BUCKET = "job-documents"`; `documentStoragePath(projectId: string, docId: string, file: { name: string; type: string }): string`; `uploadDrawing(projectId: string, docId: string, file: File): Promise<{ storagePath: string }>`; `resolveDocumentUrl(storagePath: string): Promise<string>`; `removeDrawing(storagePath: string): Promise<void>`.

- [ ] **Step 1: Write the failing test (pure helper only)**

Create `features/drawings/lib/storage.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { documentStoragePath } from "./storage";

describe("documentStoragePath", () => {
  it("uses projectId/docId.<ext from name>", () => {
    expect(documentStoragePath("j1", "d9", { name: "Kitchen.PDF", type: "application/pdf" }))
      .toBe("j1/d9.pdf");
  });
  it("falls back to the mime subtype when the name has no extension", () => {
    expect(documentStoragePath("j1", "d9", { name: "scan", type: "image/jpeg" }))
      .toBe("j1/d9.jpeg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/drawings/lib/storage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `features/drawings/lib/storage.ts`:

```typescript
/**
 * Upload + signed-URL helpers for the private `job-documents` bucket.
 * Browser-only. Uploads REQUIRE Supabase (no data-URL fallback — PDFs/large
 * images would exceed localStorage quota). See ADR 0016.
 */
import { getSupabase, hasSupabase } from "@shared/lib/supabase";

export const JOB_DOCUMENTS_BUCKET = "job-documents";

/** Signed-URL lifetime (1 hour) — long enough for a markup session. */
const SIGNED_URL_TTL = 60 * 60;

function fileExt(file: { name: string; type: string }): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  const ext = (fromName || file.type.split("/")[1] || "bin").toLowerCase();
  return ext.replace(/[^a-z0-9]/g, "") || "bin";
}

/** Deterministic object path: `<projectId>/<docId>.<ext>`. */
export function documentStoragePath(
  projectId: string,
  docId: string,
  file: { name: string; type: string }
): string {
  return `${projectId}/${docId}.${fileExt(file)}`;
}

/** Upload a drawing file. Throws if Supabase is not configured. */
export async function uploadDrawing(
  projectId: string,
  docId: string,
  file: File
): Promise<{ storagePath: string }> {
  if (!hasSupabase()) {
    throw new Error("File uploads require Supabase. Configure it, or paste a link instead.");
  }
  const sb = getSupabase();
  const path = documentStoragePath(projectId, docId, file);
  const { error } = await sb.storage.from(JOB_DOCUMENTS_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) throw error;
  return { storagePath: path };
}

/** Resolve a stored path to a fresh signed URL. */
export async function resolveDocumentUrl(storagePath: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(JOB_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

/** Best-effort removal of a stored file. */
export async function removeDrawing(storagePath: string): Promise<void> {
  if (!hasSupabase()) return;
  const sb = getSupabase();
  await sb.storage.from(JOB_DOCUMENTS_BUCKET).remove([storagePath]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run features/drawings/lib/storage.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add features/drawings/lib/storage.ts features/drawings/lib/storage.test.ts
git commit -m "feat(drawings): job-documents storage lib (upload/resolve/remove)"
```

---

### Task 5: pdf.js render lib + dependency

**Files:**
- Modify: `package.json` (add `pdfjs-dist`)
- Create: `features/drawings/lib/pdf.ts`

**Interfaces:**
- Produces: `loadPdf(url: string): Promise<PDFDocumentProxy>`; `renderPdfPage(pdf: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, scale: number): Promise<void>`; `clampScale(scale: number): number` (pure, min 0.5 max 4).

- [ ] **Step 1: Add the dependency**

Run: `npm install pdfjs-dist@^4`
Expected: `pdfjs-dist` appears in `package.json` dependencies.

- [ ] **Step 2: Write the pure helper test**

Create `features/drawings/lib/pdf.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { clampScale } from "./pdf";

describe("clampScale", () => {
  it("clamps below 0.5 up to 0.5", () => expect(clampScale(0.1)).toBe(0.5));
  it("clamps above 4 down to 4", () => expect(clampScale(99)).toBe(4));
  it("passes a normal scale through", () => expect(clampScale(1.5)).toBe(1.5));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run features/drawings/lib/pdf.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

Create `features/drawings/lib/pdf.ts`:

```typescript
"use client";
/** Thin pdf.js wrapper. Browser-only (worker + canvas). */
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";

// Next 14 (webpack) resolves this asset URL at build time.
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 4;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  return getDocument({ url }).promise;
}

export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<void> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: clampScale(scale) });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
}
```

- [ ] **Step 5: Run test + type-check**

Run: `npx vitest run features/drawings/lib/pdf.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

> **Worker risk note:** if the browser smoke (Task 8) shows a "worker failed to load" error, fall back to: copy `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` → `public/pdf.worker.min.mjs` and set `GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"`. Add that as a follow-up step only if needed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json features/drawings/lib/pdf.ts features/drawings/lib/pdf.test.ts
git commit -m "feat(drawings): pdf.js render lib + pdfjs-dist dep"
```

---

### Task 6: Viewer components (document renderer)

**Files:**
- Create: `features/drawings/components/DrawingDoc.tsx` (renders one document by mime)

**Interfaces:**
- Consumes: `resolveDocumentUrl` (Task 4), `loadPdf`/`renderPdfPage`/`clampScale` (Task 5), `isPdf` (Task 3), `ProjectDocument` (Task 2).
- Produces: `<DrawingDoc doc={ProjectDocument} />` — resolves the signed URL, renders a PDF (canvas + page nav + zoom) or an image (`<img>`), or an external link (open-in-new-tab) for `source='link'`.

- [ ] **Step 1: Write the component**

Create `features/drawings/components/DrawingDoc.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import type { ProjectDocument } from "@shared/lib/types";
import { resolveDocumentUrl } from "../lib/storage";
import { isPdf } from "../lib/upload";
import { loadPdf, renderPdfPage, clampScale } from "../lib/pdf";

export function DrawingDoc({ doc }: { doc: ProjectDocument }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (doc.source === "link") {
          if (!cancelled) setUrl(doc.driveUrl ?? null);
          return;
        }
        if (doc.storagePath) {
          const signed = await resolveDocumentUrl(doc.storagePath);
          if (!cancelled) setUrl(signed);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load drawing.");
      }
    })();
    return () => { cancelled = true; };
  }, [doc.source, doc.driveUrl, doc.storagePath]);

  if (err) return <p className="text-sm text-status-blocked">{err}</p>;
  if (!url) return <p className="text-sm text-text-tertiary">Loading…</p>;

  if (doc.source === "link") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover duration-fast">
        <ExternalLink className="h-4 w-4" strokeWidth={1.75} /> Open linked document
      </a>
    );
  }

  if (isPdf(doc.mime)) return <PdfCanvas url={url} />;
  return <img src={url} alt={doc.label} className="max-w-full rounded-lg shadow-resting" />;
}

function PdfCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdf = await loadPdf(url);
        if (cancelled) return;
        setPages(pdf.numPages);
        const canvas = canvasRef.current;
        if (canvas) await renderPdfPage(pdf, Math.min(page, pdf.numPages), canvas, scale);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not render PDF.");
      }
    })();
    return () => { cancelled = true; };
  }, [url, page, scale]);

  if (err) return <p className="text-sm text-status-blocked">{err}</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
          className="rounded-md p-1 hover:bg-surface-muted disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular-nums">{page} / {pages}</span>
        <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}
          className="rounded-md p-1 hover:bg-surface-muted disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="mx-2 h-4 w-px bg-border" />
        <button onClick={() => setScale((s) => clampScale(s - 0.25))}
          className="rounded-md p-1 hover:bg-surface-muted" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button onClick={() => setScale((s) => clampScale(s + 0.25))}
          className="rounded-md p-1 hover:bg-surface-muted" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <div className="overflow-auto rounded-lg border border-border bg-surface-muted p-2">
        <canvas ref={canvasRef} className="mx-auto" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add features/drawings/components/DrawingDoc.tsx
git commit -m "feat(drawings): DrawingDoc renderer (pdf canvas / image / link)"
```

---

### Task 7: Drawings view + upload + route + launcher button

**Files:**
- Create: `features/drawings/components/DrawingsView.tsx`
- Create: `features/drawings/components/DrawingUpload.tsx`
- Create: `src/app/jobs/[id]/drawings/page.tsx`
- Create: `shared/components/ui/DrawingsButton.tsx`
- Modify: `features/jobs/components/JobDetail.tsx` (header toolbar)
- Modify: `features/shop/components/JobBoard.tsx` (after the `<h2>` title)
- Modify: `features/installer/components/InstallCard.tsx` (action row)

**Interfaces:**
- Consumes: `useProjectDocuments` + `useDocuments().createDocument` (documents store), `useJob` (jobs store), `uploadDrawing` (Task 4), `validateUploadFile` (Task 3), `DrawingDoc` (Task 6).
- Produces: `<DrawingsView jobId={string} />`; `<DrawingsButton jobId={string} />` (a `next/link` to `/jobs/${jobId}/drawings`).

- [ ] **Step 1: Build the upload control**

Create `features/drawings/components/DrawingUpload.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useDocuments } from "@features/documents/lib/documentsStore";
import { validateUploadFile, ACCEPTED_UPLOAD_MIME } from "../lib/upload";
import { uploadDrawing } from "../lib/storage";
import type { ProjectDocument } from "@shared/lib/types";

function newId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `doc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function DrawingUpload({ jobId }: { jobId: string }) {
  const { createDocument } = useDocuments();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const check = validateUploadFile(file);
    if (!check.ok) { setErr(check.reason); return; }
    setErr(null);
    setBusy(true);
    const id = newId();
    try {
      const { storagePath } = await uploadDrawing(jobId, id, file);
      const doc: ProjectDocument = {
        id, projectId: jobId, kind: "shop", label: file.name,
        driveUrl: null, version: null, isCurrent: true, notes: null,
        uploadedBy: null, createdAt: new Date().toISOString(),
        source: "upload", storagePath, mime: file.type,
        pageCount: file.type === "application/pdf" ? null : 1,
      };
      await createDocument(doc);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <input ref={inputRef} type="file" accept={ACCEPTED_UPLOAD_MIME.join(",")}
        onChange={onPick} className="hidden" />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-3 py-1.5 text-xs font-medium hover:bg-accent-active duration-fast",
          "disabled:bg-text-disabled disabled:cursor-not-allowed"
        )}>
        <Upload className="h-3.5 w-3.5" strokeWidth={2} />
        {busy ? "Uploading…" : "Upload drawing"}
      </button>
      {err && <p className="text-xs text-status-blocked">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Build the view**

Create `features/drawings/components/DrawingsView.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useJob } from "@features/jobs/lib/jobsStore";
import { useProjectDocuments } from "@features/documents/lib/documentsStore";
import { DOCUMENT_KIND_LABELS } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { DrawingUpload } from "./DrawingUpload";
import { DrawingDoc } from "./DrawingDoc";

export function DrawingsView({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  const docs = useProjectDocuments(jobId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = docs.find((d) => d.id === activeId) ?? docs[0] ?? null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/jobs/${jobId}`}
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary duration-fast">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <h1 className="truncate font-serif text-title text-text-primary">
            {job ? `${job.name} — Drawings` : "Drawings"}
          </h1>
        </div>
        <DrawingUpload jobId={jobId} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto border-r border-border bg-surface p-2">
          {docs.length === 0 ? (
            <p className="p-2 text-xs text-text-tertiary">No drawings yet. Upload a PDF or image.</p>
          ) : (
            docs.map((d) => (
              <button key={d.id} onClick={() => setActiveId(d.id)}
                className={cn(
                  "block w-full rounded-md px-2.5 py-2 text-left text-sm duration-fast",
                  active?.id === d.id ? "bg-surface-muted text-text-primary" : "text-text-secondary hover:bg-surface-muted"
                )}>
                <span className="block truncate">{d.label}</span>
                <span className="text-micro uppercase tracking-wider text-text-tertiary">
                  {DOCUMENT_KIND_LABELS[d.kind]}{d.source === "link" ? " · link" : ""}
                </span>
              </button>
            ))
          )}
        </aside>
        <main className="min-w-0 flex-1 overflow-auto p-4">
          {active ? <DrawingDoc doc={active} /> : (
            <p className="text-sm text-text-tertiary">Select or upload a drawing.</p>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the thin route page**

Create `src/app/jobs/[id]/drawings/page.tsx`:

```tsx
import { DrawingsView } from "@features/drawings/components/DrawingsView";

export default function JobDrawingsPage({ params }: { params: { id: string } }) {
  return <DrawingsView jobId={params.id} />;
}
```

- [ ] **Step 4: Build the shared launcher button**

Create `shared/components/ui/DrawingsButton.tsx`:

```tsx
import Link from "next/link";
import { PencilRuler } from "lucide-react";
import { cn } from "@shared/lib/utils";

export function DrawingsButton({ jobId, className }: { jobId: string; className?: string }) {
  return (
    <Link href={`/jobs/${jobId}/drawings`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary duration-fast",
        className
      )}>
      <PencilRuler className="h-3.5 w-3.5" strokeWidth={1.75} />
      Drawings
    </Link>
  );
}
```

- [ ] **Step 5: Mount the button on the three surfaces**

In `features/jobs/components/JobDetail.tsx`, import and place `<DrawingsButton jobId={job.id} />` in the header action row beside the "Add to calendar" button:
```tsx
import { DrawingsButton } from "@shared/components/ui/DrawingsButton";
// ...beside the "Add to calendar" button:
<DrawingsButton jobId={job.id} />
```

In `features/shop/components/JobBoard.tsx`, right after the `<h2>{jobName}</h2>`:
```tsx
import { DrawingsButton } from "@shared/components/ui/DrawingsButton";
// ...
<div className="mb-3"><DrawingsButton jobId={jobId} /></div>
```

In `features/installer/components/InstallCard.tsx`, in the action buttons row (beside "Job details"):
```tsx
import { DrawingsButton } from "@shared/components/ui/DrawingsButton";
// ...
<DrawingsButton jobId={job.id} />
```

- [ ] **Step 6: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean (the new route compiles; pdf.js worker URL resolves in the build).

- [ ] **Step 7: Commit**

```bash
git add features/drawings src/app/jobs/[id]/drawings shared/components/ui/DrawingsButton.tsx features/jobs/components/JobDetail.tsx features/shop/components/JobBoard.tsx features/installer/components/InstallCard.tsx
git commit -m "feat(drawings): drawings route, upload view, and shared DrawingsButton"
```

---

### Task 8: Resilience fix + full verification + browser smoke (DoD)

**Files:**
- Modify: `features/documents/components/DocumentsCard.tsx` (don't break Overview on upload docs)

**Interfaces:** none new.

- [ ] **Step 1: Keep the Overview DocumentsCard link-only**

`DocumentsCard` (Overview tab) renders Drive embeds. An uploaded doc has `driveUrl = null`. In `features/documents/components/DocumentsCard.tsx`, filter the list it renders to link/sketch docs so uploads only appear in the Drawings route:
```tsx
// where it reads useProjectDocuments(projectId):
const docs = useProjectDocuments(projectId).filter((d) => d.source !== "upload");
```

- [ ] **Step 2: Full gate**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all green. Vitest: documentsRowMap (3) + upload (6) + storage (2) + pdf (3) pass.

- [ ] **Step 3: Browser smoke (Playwright MCP, authed)**

Start dev (`PORT=3003 npm run dev`), sign in, then:
1. Open a job → click **Drawings** in the header → lands on `/jobs/[id]/drawings`.
2. **Upload a PDF** → it appears in the sidebar and renders on a canvas; page nav + zoom work.
3. **Upload a JPG/PNG** → renders as an image.
4. Try a **>50 MB** file → blocked with the cap message.
5. Confirm the **Drawings button** also shows on a shop-floor `JobBoard` and an installer `InstallCard`, and both route to the same screen.
6. Overview tab's documents card still shows existing **Drive links** unchanged.

- [ ] **Step 4: Commit**

```bash
git add features/documents/components/DocumentsCard.tsx
git commit -m "fix(drawings): keep Overview documents card link-only; Slice 0 verified"
```

---

## Self-Review

**Spec coverage (Slice 0 section of the spec):**
- Bucket + RLS → Task 1. ✅
- Extend `documents` (source/storage_path/mime/page_count; drive_url nullable) → Task 1 + 2. ✅
- Route `/jobs/[id]/drawings` + `<DrawingsButton/>` on job/shop/installer → Task 7. ✅
- Upload PDF + image ~50MB → Task 3 (guard) + 4 (storage) + 7 (UI). ✅
- Renderer by mime (pdf.js / `<img>`); page nav + zoom → Task 5 + 6. ✅
- Links view-only → Task 6 (DrawingDoc link branch) + Task 8 (Overview card). ✅
- DoD (upload+open+render+over-cap blocked+gate green+smoke) → Task 8. ✅

**Placeholder scan:** none — every code step has complete code; every command has expected output.

**Type consistency:** `ProjectDocument.source` / `storagePath` / `mime` / `pageCount` defined in Task 2 and used identically in Tasks 4/6/7. `documentStoragePath` signature (Task 4) matches its use. `validateUploadFile` / `isPdf` (Task 3) used as defined in Tasks 6/7. `resolveDocumentUrl`, `loadPdf`, `renderPdfPage`, `clampScale` signatures consistent across Tasks 4/5/6.

**Out of scope (later slices):** pieces/pins/checklist (Slice 1), realtime (Slice 2), ink/markup/annotations (Slice 3–4), sketchpad (Slice 5), Mozaik seeding + archive-to-Drive (later).
