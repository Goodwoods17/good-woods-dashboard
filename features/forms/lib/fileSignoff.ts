/**
 * Pure helpers for auto-filing a signoff PDF as a job document
 * (Forms P2 · Slice 4, issue #43).
 *
 * When a client submits a job-attached form via /f/<token>, the route
 * handler generates the signoff PDF server-side and calls
 * `fileSignoffToJob` (in `shareLinkServer.ts`) to persist it as a
 * `ProjectDocument` row in the `documents` table — so it appears on the
 * job's Documents card alongside shop drawings and other uploads.
 *
 * This module owns the *pure* derivation (label construction, document
 * shape building) and is the unit-tested seam. The side-effectful DB
 * write lives in `shareLinkServer.ts` where the service-role client is
 * already set up.
 */

import type { FormInstance, ProjectDocument } from "@shared/lib/types";

export type SignoffJobContext = {
  jobId: string;
  code: string;
  name: string;
};

/**
 * The label for the filed document row. Trims the title and falls back to
 * "Form Signoff" so the documents card never shows a blank label.
 */
export function signoffDocumentLabel(title: string): string {
  const t = title.trim();
  return t ? `${t} — Signoff` : "Form Signoff";
}

/**
 * Build the `ProjectDocument` shape for a signoff PDF. The caller (the
 * server-side submit route) is responsible for persisting this row.
 *
 * Idempotency contract: the caller upserts by `instance.id` — if a
 * `signoff_path` already exists for this instance, the existing document
 * row is overwritten (supersede, not pile up).
 */
export function buildSignoffDocumentRow(
  instance: FormInstance,
  storagePath: string,
  jobCtx: SignoffJobContext
): ProjectDocument {
  const parts: string[] = [`Job ${jobCtx.code}`];
  if (instance.phase) parts.push(`Phase: ${instance.phase}`);
  const notes = parts.join(" · ");

  return {
    id: crypto.randomUUID(),
    projectId: jobCtx.jobId,
    kind: "other",
    label: signoffDocumentLabel(instance.title),
    driveUrl: null,
    version: null,
    isCurrent: true,
    notes,
    uploadedBy: instance.completedBy ?? null,
    createdAt: instance.completedAt ?? new Date().toISOString(),
    source: "upload",
    storagePath,
    mime: "application/pdf",
    pageCount: null,
  };
}
