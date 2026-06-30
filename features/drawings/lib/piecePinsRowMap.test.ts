import { describe, it, expect } from "vitest";
import { rowToPin, pinToRow, type PinRow } from "./piecePinsRowMap";
import type { JobPiecePin } from "@shared/lib/types";

const row: PinRow = {
  id: "11110000-0000-4000-8000-000000000001",
  job_piece_id: "22220000-0000-4000-8000-000000000002",
  document_id: "33330000-0000-4000-8000-000000000003",
  page: 2,
  x: 0.5,
  y: 0.25,
  role: "elevation",
  is_primary: true,
  created_at: "2026-06-29T00:00:00Z",
  created_by: "a@b.c",
};

describe("piecePinsRowMap", () => {
  it("maps a row to a JobPiecePin", () => {
    const p = rowToPin(row);
    expect(p.jobPieceId).toBe("22220000-0000-4000-8000-000000000002");
    expect(p.documentId).toBe("33330000-0000-4000-8000-000000000003");
    expect(p.page).toBe(2);
    expect(p.x).toBe(0.5);
    expect(p.role).toBe("elevation");
    expect(p.isPrimary).toBe(true);
  });

  it("round-trips row → pin → row", () => {
    expect(pinToRow(rowToPin(row))).toEqual(row);
  });

  it("defaults absent nullables to null and is_primary false", () => {
    const pin: JobPiecePin = {
      id: "44440000-0000-4000-8000-000000000004",
      jobPieceId: "22220000-0000-4000-8000-000000000002",
      documentId: "33330000-0000-4000-8000-000000000003",
      isPrimary: false,
      createdAt: "2026-06-29T00:00:00Z",
    };
    const r = pinToRow(pin);
    expect(r.page).toBeNull();
    expect(r.x).toBeNull();
    expect(r.y).toBeNull();
    expect(r.role).toBeNull();
    expect(r.is_primary).toBe(false);
    expect(r.created_by).toBeNull();
  });
});
