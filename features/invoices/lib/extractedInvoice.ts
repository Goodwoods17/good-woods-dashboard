import type { ExtractedInvoice, ExtractedInvoiceLine } from "./types";

/**
 * Validate + normalize the extraction engine's output into the strict
 * `ExtractedInvoice` shape (ADR 0019). This is the trust boundary: the
 * home-machine engine returns free text; nothing reaches Supabase until it
 * passes through here. Pure + fully unit-tested.
 *
 * Accepts a JSON string (optionally wrapped in a ```json code fence the model
 * may add) or an already-parsed object. Header fields coerce to null when
 * absent; numeric strings like "1,120.00" / "$50" coerce to numbers; `lines`
 * must be present and an array (the one hard structural requirement).
 */
export function parseExtractedInvoice(input: unknown): ExtractedInvoice {
  const obj = typeof input === "string" ? JSON.parse(stripCodeFence(input)) : input;

  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("Extracted invoice must be a JSON object");
  }
  const record = obj as Record<string, unknown>;

  if (!("lines" in record)) {
    throw new Error("Extracted invoice is missing `lines`");
  }
  if (!Array.isArray(record.lines)) {
    throw new Error("Extracted invoice `lines` must be an array");
  }

  return {
    supplier: toStringOrNull(record.supplier),
    invoiceNumber: toStringOrNull(record.invoiceNumber),
    issueDate: toStringOrNull(record.issueDate),
    dueDate: toStringOrNull(record.dueDate),
    poRef: toStringOrNull(record.poRef),
    preTaxTotal: toNumberOrNull(record.preTaxTotal),
    gst: toNumberOrNull(record.gst),
    pst: toNumberOrNull(record.pst),
    total: toNumberOrNull(record.total),
    lines: record.lines.map(parseLine),
  };
}

function parseLine(raw: unknown): ExtractedInvoiceLine {
  const line = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    qty: toNumberOrNull(line.qty),
    sku: toStringOrNull(line.sku),
    description: toStringOrNull(line.description),
    unit: toStringOrNull(line.unit),
    unitPrice: toNumberOrNull(line.unitPrice),
    amount: toNumberOrNull(line.amount),
    taxFlag: toBoolOrNull(line.taxFlag),
    confidence: toNumberOrNull(line.confidence),
  };
}

/** Remove a leading/trailing ```json … ``` fence if the model wrapped the JSON. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return String(v);
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    // Strip currency symbols, thousands separators, and stray whitespace.
    const cleaned = v.replace(/[$,\s]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toBoolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["true", "yes", "y", "1", "pgst", "pst", "gst+pst"].includes(t)) return true;
    if (["false", "no", "n", "0", ""].includes(t)) return false;
  }
  if (typeof v === "number") return v !== 0;
  return null;
}
