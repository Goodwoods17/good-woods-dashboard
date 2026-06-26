import { describe, it, expect } from "vitest";
import { isAcceptedInvoiceFile, ACCEPTED_INVOICE_MIME } from "./invoicesData";

describe("isAcceptedInvoiceFile", () => {
  it("accepts the four documented mime types (ADR 0019)", () => {
    for (const type of ACCEPTED_INVOICE_MIME) {
      expect(isAcceptedInvoiceFile({ type, name: "x" })).toBe(true);
    }
  });

  it("accepts a HEIC photo with an empty mime via its extension", () => {
    expect(isAcceptedInvoiceFile({ type: "", name: "IMG_0042.HEIC" })).toBe(true);
  });

  it("accepts a jpg/jpeg by extension when the mime is missing", () => {
    expect(isAcceptedInvoiceFile({ type: "", name: "bill.jpeg" })).toBe(true);
    expect(isAcceptedInvoiceFile({ type: "", name: "bill.JPG" })).toBe(true);
  });

  it("rejects unsupported types", () => {
    expect(isAcceptedInvoiceFile({ type: "text/csv", name: "data.csv" })).toBe(false);
    expect(isAcceptedInvoiceFile({ type: "", name: "notes.txt" })).toBe(false);
  });
});
