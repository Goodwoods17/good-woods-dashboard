import { describe, it, expect } from "vitest";
import { invoiceFileExt, invoiceObjectPath } from "./storage";

describe("invoiceFileExt", () => {
  it("uses the extension from the file name", () => {
    expect(invoiceFileExt({ name: "reimer.PDF", type: "application/pdf" })).toBe("pdf");
  });
  it("falls back to the mime subtype when the name has no extension", () => {
    expect(invoiceFileExt({ name: "scan", type: "image/jpeg" })).toBe("jpeg");
  });
  it("normalizes heic photos", () => {
    expect(invoiceFileExt({ name: "IMG_0042.HEIC", type: "image/heic" })).toBe("heic");
  });
  it("defaults to pdf when nothing is known", () => {
    expect(invoiceFileExt({ name: "blob", type: "" })).toBe("pdf");
  });
});

describe("invoiceObjectPath", () => {
  it("is <invoiceId>/source.<ext> (one source file per invoice)", () => {
    expect(invoiceObjectPath("inv-7", { name: "bill.pdf", type: "application/pdf" })).toBe(
      "inv-7/source.pdf"
    );
  });
  it("uses the mime for a heic photo with no name extension", () => {
    expect(invoiceObjectPath("inv-9", { name: "snap", type: "image/heic" })).toBe(
      "inv-9/source.heic"
    );
  });
});
