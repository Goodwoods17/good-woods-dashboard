/**
 * The strict extraction instruction handed to the engine (ADR 0019). Kept in
 * its own pure module so it can be unit-tested and reused by both the
 * home-machine Claude Code engine and the metered-API fallback without
 * duplication.
 *
 * The contract: return ONE JSON object matching `ExtractedInvoice` — taxes never
 * collapsed (separate preTaxTotal / gst / pst), a per-line `taxFlag`, and a
 * per-line `confidence` 0..1. Numbers as numbers (no currency symbols), dates as
 * ISO `YYYY-MM-DD`, unknown fields as null.
 */
export const EXTRACTION_PROMPT = `You are extracting a SUPPLIER INVOICE (a bill the shop received and paid).

Return EXACTLY ONE JSON object and nothing else — no prose, no code fence.

Shape:
{
  "supplier": string|null,            // the company that issued the bill
  "invoiceNumber": string|null,
  "issueDate": string|null,           // ISO YYYY-MM-DD
  "dueDate": string|null,             // ISO YYYY-MM-DD
  "poRef": string|null,               // PO / order reference if present
  "preTaxTotal": number|null,         // subtotal BEFORE tax
  "gst": number|null,                 // GST amount
  "pst": number|null,                 // PST amount (some bills code it PGST)
  "total": number|null,               // grand total
  "lines": [
    {
      "qty": number|null,
      "sku": string|null,             // supplier product number / SKU
      "description": string|null,
      "unit": string|null,            // ea, sheet, roll, box, etc.
      "unitPrice": number|null,
      "amount": number|null,          // qty * unitPrice
      "taxFlag": boolean|null,        // true if this line was charged PST
      "confidence": number|null       // 0..1, your confidence in this line
    }
  ]
}

Rules:
- NEVER collapse taxes. Keep preTaxTotal, gst, and pst separate.
- Numbers are plain numbers: no "$", no thousands separators.
- Use null for anything not present or unreadable. Never omit a key.
- Preserve line order top-to-bottom.
- If the page is a scanned image, read it via vision.`;
