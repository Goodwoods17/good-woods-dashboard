import type { DocumentKind, ProjectDocument } from "@shared/lib/types";

export type DocumentRow = {
  id: string;
  project_id: string;
  kind: DocumentKind;
  label: string;
  drive_url: string;
  version: string | null;
  is_current: boolean;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
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
  };
}

export function documentToRow(doc: ProjectDocument): DocumentRow {
  return {
    id: doc.id,
    project_id: doc.projectId,
    kind: doc.kind,
    label: doc.label,
    drive_url: doc.driveUrl,
    version: doc.version ?? null,
    is_current: doc.isCurrent,
    notes: doc.notes ?? null,
    uploaded_by: doc.uploadedBy ?? null,
    created_at: doc.createdAt,
  };
}
