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
  visibility: "owner",
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
