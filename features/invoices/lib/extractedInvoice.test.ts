import { describe, it, expect } from "vitest";
import { parseExtractedInvoice } from "./extractedInvoice";

// The strict-JSON contract is the riskiest assumption of the tracer (ADR 0019):
// the home-machine engine returns text, we must parse it into a trusted shape
// before any DB write. These tests pin that contract.

const cleanReimerLike = JSON.stringify({
  supplier: "Reimer Hardwoods",
  invoiceNumber: "R-10293",
  issueDate: "2026-05-12",
  dueDate: "2026-06-11",
  poRef: "PO-7781",
  preTaxTotal: 1000,
  gst: 50,
  pst: 70,
  total: 1120,
  lines: [
    {
      qty: 4,
      sku: "MAPLE-34",
      description: "Hard maple 3/4 sheet",
      unit: "sheet",
      unitPrice: 200,
      amount: 800,
      taxFlag: true,
      confidence: 0.98,
    },
    {
      qty: 2,
      sku: "EDGE-MAPLE",
      description: "Maple edgeband",
      unit: "roll",
      unitPrice: 100,
      amount: 200,
      taxFlag: true,
      confidence: 0.91,
    },
  ],
});

describe("parseExtractedInvoice", () => {
  it("parses a clean digital-PDF extraction into the strict shape", () => {
    const result = parseExtractedInvoice(cleanReimerLike);
    expect(result.supplier).toBe("Reimer Hardwoods");
    expect(result.invoiceNumber).toBe("R-10293");
    expect(result.preTaxTotal).toBe(1000);
    expect(result.gst).toBe(50);
    expect(result.pst).toBe(70);
    expect(result.total).toBe(1120);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].sku).toBe("MAPLE-34");
    expect(result.lines[0].taxFlag).toBe(true);
    expect(result.lines[1].amount).toBe(200);
  });

  it("accepts a raw object as well as a JSON string", () => {
    const obj = JSON.parse(cleanReimerLike);
    expect(parseExtractedInvoice(obj).supplier).toBe("Reimer Hardwoods");
  });

  it("strips a ```json code fence the model may wrap the JSON in", () => {
    const fenced = "```json\n" + cleanReimerLike + "\n```";
    expect(parseExtractedInvoice(fenced).invoiceNumber).toBe("R-10293");
  });

  it("coerces missing/absent header fields to null (never undefined)", () => {
    const sparse = parseExtractedInvoice({ lines: [] });
    expect(sparse.supplier).toBeNull();
    expect(sparse.preTaxTotal).toBeNull();
    expect(sparse.total).toBeNull();
    expect(sparse.lines).toEqual([]);
  });

  it('coerces numeric strings (e.g. "1,120.00") to numbers', () => {
    const result = parseExtractedInvoice({
      total: "1,120.00",
      gst: "$50.00",
      lines: [{ amount: "800", qty: "4" }],
    });
    expect(result.total).toBe(1120);
    expect(result.gst).toBe(50);
    expect(result.lines[0].amount).toBe(800);
    expect(result.lines[0].qty).toBe(4);
  });

  it("defaults missing per-line fields to null and keeps line order", () => {
    const result = parseExtractedInvoice({
      lines: [{ description: "Doors only" }, { description: "Hinges" }],
    });
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].description).toBe("Doors only");
    expect(result.lines[0].sku).toBeNull();
    expect(result.lines[0].amount).toBeNull();
    expect(result.lines[1].description).toBe("Hinges");
  });

  it("throws on non-JSON garbage", () => {
    expect(() => parseExtractedInvoice("not json at all")).toThrow();
  });

  it("throws when `lines` is missing entirely", () => {
    expect(() => parseExtractedInvoice({ supplier: "X" })).toThrow(/lines/i);
  });

  it("throws when `lines` is not an array", () => {
    expect(() => parseExtractedInvoice({ lines: "nope" })).toThrow(/lines/i);
  });
});
