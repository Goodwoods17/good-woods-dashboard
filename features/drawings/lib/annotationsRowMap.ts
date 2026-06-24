import type { Annotation, AnnotationType, StrokeData } from "@shared/lib/types";

export type AnnotationRow = {
  id: string;
  document_id: string;
  project_id: string;
  page: number;
  type: AnnotationType;
  data: StrokeData;
  color: string;
  stroke_width: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToAnnotation(r: AnnotationRow): Annotation {
  return {
    id: r.id,
    documentId: r.document_id,
    projectId: r.project_id,
    page: r.page,
    type: r.type,
    data: r.data,
    color: r.color,
    strokeWidth: r.stroke_width,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function annotationToRow(a: Annotation): AnnotationRow {
  return {
    id: a.id,
    document_id: a.documentId,
    project_id: a.projectId,
    page: a.page,
    type: a.type,
    data: a.data,
    color: a.color,
    stroke_width: a.strokeWidth ?? null,
    created_by: a.createdBy ?? null,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}
