import { describe, it, expect } from "vitest";
import { rowToPiece, pieceToRow, partialPieceToRow, type PieceRow } from "./piecesRowMap";
import type { JobPiece } from "@shared/lib/types";

// S8b: pin_* columns are removed from PieceRow — pins live in job_piece_pins.
const row: PieceRow = {
  id: "p1",
  project_id: "j1",
  kind: "cabinet",
  subtype: "base",
  code: "R1C7",
  room: "Kitchen",
  label: "3 Drawer",
  cut_method: "inhouse",
  status: "cut",
  status_updated_at: "2026-06-24T00:00:00Z",
  status_updated_by: "a@b.c",
  source: "manual",
  source_ref: null,
  sort_order: 0,
  dimensions: null,
  material: null,
  edgeband: null,
  parent_ref: null,
  created_by: "a@b.c",
  created_at: "2026-06-24T00:00:00Z",
  visibility: "owner",
};

describe("piecesRowMap", () => {
  it("maps a row to a JobPiece", () => {
    const p = rowToPiece(row);
    expect(p.projectId).toBe("j1");
    expect(p.code).toBe("R1C7");
    expect(p.cutMethod).toBe("inhouse");
  });
  it("round-trips (no pin_* columns)", () => {
    expect(pieceToRow(rowToPiece(row))).toEqual(row);
  });
  it("defaults absent nullables to null — no pin_* emitted", () => {
    const piece: JobPiece = {
      id: "p2",
      projectId: "j1",
      kind: "filler",
      label: "Filler",
      status: "not_started",
      source: "manual",
      sortOrder: 0,
      createdAt: "x",
    };
    const r = pieceToRow(piece);
    expect(r.code).toBeNull();
    expect(r.cut_method).toBeNull();
    // S8b: pin_* are not part of PieceRow anymore — no pin keys in output
    expect("pin_x" in r).toBe(false);
    expect("pin_document_id" in r).toBe(false);
  });

  describe("partialPieceToRow", () => {
    it("maps only the provided patch keys — status cycle", () => {
      const patch: Partial<JobPiece> = { status: "cut", statusUpdatedAt: "2026-07-01T00:00:00Z" };
      const r = partialPieceToRow(patch);
      expect(r.status).toBe("cut");
      expect(r.status_updated_at).toBe("2026-07-01T00:00:00Z");
      // Unset fields are absent (not null) so Supabase only updates the named cols.
      expect("label" in r).toBe(false);
      expect("pin_x" in r).toBe(false);
    });
    it("maps visibility patch", () => {
      const r = partialPieceToRow({ visibility: "client" });
      expect(r.visibility).toBe("client");
      expect("status" in r).toBe(false);
    });
    it("maps cutMethod null to null", () => {
      const r = partialPieceToRow({ cutMethod: null });
      expect(r.cut_method).toBeNull();
    });
  });
});
