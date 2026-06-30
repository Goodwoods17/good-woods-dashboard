import type { CutMethod, JobPiece, PieceKind, PieceSource } from "@shared/lib/types";

// S8b: pin_* columns are removed from this mapper. They now live in
// job_piece_pins (ADR 0023). S8c will drop the columns from the DB.
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
  sort_order: number;
  dimensions: string | null;
  material: string | null;
  edgeband: string | null;
  parent_ref: string | null;
  created_by: string | null;
  created_at: string;
  /** Added in job-status slice 1 migration; NOT NULL DEFAULT 'owner'. */
  visibility: string;
};

export function rowToPiece(row: PieceRow): JobPiece {
  return {
    id: row.id, projectId: row.project_id, kind: row.kind, subtype: row.subtype,
    code: row.code, room: row.room, label: row.label, cutMethod: row.cut_method,
    status: row.status, statusUpdatedAt: row.status_updated_at,
    statusUpdatedBy: row.status_updated_by, source: row.source, sourceRef: row.source_ref,
    sortOrder: row.sort_order, dimensions: row.dimensions, material: row.material,
    edgeband: row.edgeband, parentRef: row.parent_ref, createdBy: row.created_by,
    createdAt: row.created_at,
    visibility: row.visibility ?? "owner",
  };
}

export function pieceToRow(p: JobPiece): PieceRow {
  return {
    id: p.id, project_id: p.projectId, kind: p.kind, subtype: p.subtype ?? null,
    code: p.code ?? null, room: p.room ?? null, label: p.label, cut_method: p.cutMethod ?? null,
    status: p.status, status_updated_at: p.statusUpdatedAt ?? null,
    status_updated_by: p.statusUpdatedBy ?? null, source: p.source, source_ref: p.sourceRef ?? null,
    sort_order: p.sortOrder,
    dimensions: p.dimensions ?? null, material: p.material ?? null, edgeband: p.edgeband ?? null,
    parent_ref: p.parentRef ?? null, created_by: p.createdBy ?? null, created_at: p.createdAt,
    visibility: p.visibility ?? "owner",
  };
}

/**
 * Map only the keys present in a `Partial<JobPiece>` patch to their DB column
 * equivalents. Used for narrow UPDATE calls so Supabase only touches the changed
 * columns — crucially, no pin_* columns are ever sent (S8b).
 */
export function partialPieceToRow(p: Partial<JobPiece>): Partial<PieceRow> {
  const r: Partial<PieceRow> = {};
  if (p.projectId !== undefined) r.project_id = p.projectId;
  if (p.kind !== undefined) r.kind = p.kind;
  if (p.subtype !== undefined) r.subtype = p.subtype ?? null;
  if (p.code !== undefined) r.code = p.code ?? null;
  if (p.room !== undefined) r.room = p.room ?? null;
  if (p.label !== undefined) r.label = p.label;
  if (p.cutMethod !== undefined) r.cut_method = p.cutMethod ?? null;
  if (p.status !== undefined) r.status = p.status;
  if (p.statusUpdatedAt !== undefined) r.status_updated_at = p.statusUpdatedAt ?? null;
  if (p.statusUpdatedBy !== undefined) r.status_updated_by = p.statusUpdatedBy ?? null;
  if (p.source !== undefined) r.source = p.source;
  if (p.sourceRef !== undefined) r.source_ref = p.sourceRef ?? null;
  if (p.sortOrder !== undefined) r.sort_order = p.sortOrder;
  if (p.dimensions !== undefined) r.dimensions = p.dimensions ?? null;
  if (p.material !== undefined) r.material = p.material ?? null;
  if (p.edgeband !== undefined) r.edgeband = p.edgeband ?? null;
  if (p.parentRef !== undefined) r.parent_ref = p.parentRef ?? null;
  if (p.createdBy !== undefined) r.created_by = p.createdBy ?? null;
  if (p.createdAt !== undefined) r.created_at = p.createdAt;
  if (p.visibility !== undefined) r.visibility = p.visibility ?? "owner";
  return r;
}
