import { describe, it, expect } from "vitest";
import { rowToAnnotation, annotationToRow, type AnnotationRow } from "./annotationsRowMap";

const row: AnnotationRow = {
  id: "a1",
  document_id: "d1",
  project_id: "j1",
  page: 2,
  type: "ink",
  data: { points: [[0.1, 0.1, 0.5]] },
  color: "#1A1916",
  stroke_width: 6,
  created_by: "a@b.c",
  created_at: "t",
  updated_at: "t",
};

describe("annotationsRowMap", () => {
  it("maps a row", () => {
    const a = rowToAnnotation(row);
    expect(a.documentId).toBe("d1");
    expect(a.page).toBe(2);
    expect(a.data.points[0][0]).toBe(0.1);
  });
  it("round-trips", () => {
    expect(annotationToRow(rowToAnnotation(row))).toEqual(row);
  });
});
