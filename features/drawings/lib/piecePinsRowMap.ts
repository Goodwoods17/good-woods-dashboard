import type { JobPiecePin, PinRole } from "@shared/lib/types";

/** A row of `job_piece_pins` (ADR 0023). Mirrors the migration column shape. */
export type PinRow = {
  id: string;
  job_piece_id: string;
  document_id: string;
  page: number | null;
  x: number | null;
  y: number | null;
  role: string | null;
  is_primary: boolean;
  created_at: string;
  created_by: string | null;
};

export function rowToPin(row: PinRow): JobPiecePin {
  return {
    id: row.id,
    jobPieceId: row.job_piece_id,
    documentId: row.document_id,
    page: row.page,
    x: row.x,
    y: row.y,
    role: (row.role as PinRole | null) ?? null,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export function pinToRow(p: JobPiecePin): PinRow {
  return {
    id: p.id,
    job_piece_id: p.jobPieceId,
    document_id: p.documentId,
    page: p.page ?? null,
    x: p.x ?? null,
    y: p.y ?? null,
    role: p.role ?? null,
    is_primary: p.isPrimary,
    created_at: p.createdAt,
    created_by: p.createdBy ?? null,
  };
}
