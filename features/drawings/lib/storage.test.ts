import { describe, it, expect } from "vitest";
import { documentStoragePath } from "./storage";

describe("documentStoragePath", () => {
  it("uses projectId/docId.<ext from name>", () => {
    expect(documentStoragePath("j1", "d9", { name: "Kitchen.PDF", type: "application/pdf" }))
      .toBe("j1/d9.pdf");
  });
  it("falls back to the mime subtype when the name has no extension", () => {
    expect(documentStoragePath("j1", "d9", { name: "scan", type: "image/jpeg" }))
      .toBe("j1/d9.jpeg");
  });
});
