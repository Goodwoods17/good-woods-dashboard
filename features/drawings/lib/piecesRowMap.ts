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
