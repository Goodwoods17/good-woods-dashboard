import { describe, it, expect } from "vitest";
import { rowToDocument, documentToRow, type DocumentRow } from "./documentsRowMap";
import type { ProjectDocument } from "@shared/lib/types";

const uploadRow: DocumentRow = {
  id: "d1", project_id: "j1", kind: "shop", label: "Kitchen plan",
  drive_url: null, version: "R2", is_current: true, notes: null,
  uploaded_by: null, created_at: "2026-06-23T00:00:00Z",
  source: "upload", storage_path: "j1/d1.pdf", mime: "application/pdf", page_count: 3,
};

describe("documentsRowMap", () => {
  it("maps an uploaded-file row to a ProjectDocument", () => {
    const doc = rowToDocument(uploadRow);
    expect(doc.source).toBe("upload");
    expect(doc.storagePath).toBe("j1/d1.pdf");
    expect(doc.mime).toBe("application/pdf");
    expect(doc.pageCount).toBe(3);
    expect(doc.driveUrl).toBeNull();
  });

  it("round-trips an upload doc back to a row", () => {
    const doc: ProjectDocument = rowToDocument(uploadRow);
    expect(documentToRow(doc)).toEqual(uploadRow);
  });

  it("defaults a link doc's new fields to null", () => {
    const linkDoc: ProjectDocument = {
      id: "d2", projectId: "j1", kind: "designer", label: "Elevations",
      driveUrl: "https://drive.google.com/file/d/x/view", version: null,
      isCurrent: true, notes: null, uploadedBy: null,
      createdAt: "2026-06-23T00:00:00Z", source: "link",
    };
    const row = documentToRow(linkDoc);
    expect(row.source).toBe("link");
    expect(row.storage_path).toBeNull();
    expect(row.mime).toBeNull();
    expect(row.page_count).toBeNull();
  });
});
