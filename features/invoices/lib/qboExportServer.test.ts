/**
 * QBO-H6 (#189) — the export route's server delegate.
 *
 * The whole point of this slice is that the JSON export resolves vendor/account/
 * tax through the central `quickbooks_links` table (ADR 0021) IDENTICALLY to the
 * push path — the slice-8 stub bypassed it. These tests stub the data-access
 * seams and prove:
 *   • the central vendor link WINS over the embedded qbo_vendor_id,
 *   • the account maps flow into the built Bill,
 *   • with no QBO connection it falls back to the embedded labels (still works),
 *   • not_found / unconfigured degrade cleanly (no throw).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRow, InvoiceLineRow } from "./invoiceRowMaps";

const mocks = vi.hoisted(() => ({
  getServiceRoleClient: vi.fn(),
  getFreshAccessToken: vi.fn(),
  getQuickbooksLink: vi.fn(),
  loadMappingLookups: vi.fn(),
}));

vi.mock("@shared/lib/serviceClient", () => ({
  getServiceRoleClient: mocks.getServiceRoleClient,
}));
vi.mock("./qboConnectionServer", () => ({
  getFreshAccessToken: mocks.getFreshAccessToken,
}));
vi.mock("./quickbooksLinksServer", () => ({
  getQuickbooksLink: mocks.getQuickbooksLink,
}));
vi.mock("./qboAccountMappingServer", () => ({
  loadMappingLookups: mocks.loadMappingLookups,
}));

import { buildInvoiceQboExport } from "./qboExportServer";

function invoiceRow(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: "00000000-0000-4000-8000-000000000189",
    status: "reviewed",
    storage_path: "h6/dummy.pdf",
    mime: "application/pdf",
    original_filename: "h6.pdf",
    supplier: "Reimer Hardwoods",
    invoice_number: "H6-001",
    issue_date: "2026-06-01",
    due_date: "2026-07-01",
    po_ref: "PO-9",
    pre_tax_total: 500,
    gst: 25,
    pst: 35,
    total: 560,
    extracted_json: null,
    error_message: null,
    supplier_id: "supplier-uuid-1",
    pages: null,
    qbo_vendor_id: "EMBEDDED-VENDOR",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function lineRow(overrides: Partial<InvoiceLineRow> = {}): InvoiceLineRow {
  return {
    id: "00000000-0000-4000-8000-0000000001a1",
    invoice_id: "00000000-0000-4000-8000-000000000189",
    line_no: 1,
    qty: 2,
    sku: "MAPLE-34",
    description: "Hard maple sheet",
    unit: "sheet",
    unit_price: 250,
    amount: 500,
    tax_flag: true,
    confidence: 0.95,
    job_id: null,
    qbo_account: "5000-Materials",
    line_kind: null,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

/** A minimal supabase-js stand-in that serves the invoice + lines reads. */
function fakeSb(invRow: InvoiceRow | null, lineRows: InvoiceLineRow[]) {
  return {
    from(table: string) {
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: invRow }) }),
          }),
        };
      }
      // invoice_lines
      return {
        select: () => ({
          eq: () => ({ order: async () => ({ data: lineRows }) }),
        }),
      };
    },
  };
}

const CONNECTED = {
  ok: true as const,
  accessToken: "tok",
  realmId: "REALM1",
  environment: "sandbox" as const,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildInvoiceQboExport — central-link resolution (QBO-H6)", () => {
  it("the central quickbooks_links vendor WINS over the embedded qbo_vendor_id", async () => {
    mocks.getServiceRoleClient.mockReturnValue(fakeSb(invoiceRow(), [lineRow()]));
    mocks.getFreshAccessToken.mockResolvedValue(CONNECTED);
    mocks.getQuickbooksLink.mockResolvedValue({ qboId: "CENTRAL-VENDOR" });
    mocks.loadMappingLookups.mockResolvedValue({
      accountByLocal: { "5000-Materials": "QBO-ACCT-99" },
      taxByLocal: { GST: "TC-1", PST: "TC-2", GST_PST: "TC-3" },
      taxRateByLocal: {},
    });

    const result = await buildInvoiceQboExport("00000000-0000-4000-8000-000000000189");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Central vendor wins on the v3 Bill (the legacy flat export was removed).
    expect(result.bill.VendorRef?.value).toBe("CENTRAL-VENDOR");
    // Account map flows into the built bill line (not the raw local label).
    expect(result.bill.Line[0].AccountBasedExpenseLineDetail.AccountRef?.value).toBe("QBO-ACCT-99");
    // Resolution was scoped to the connected realm + the supplier_id.
    expect(mocks.getQuickbooksLink).toHaveBeenCalledWith({
      realmId: "REALM1",
      localType: "vendor",
      localId: "supplier-uuid-1",
    });
    expect(mocks.loadMappingLookups).toHaveBeenCalledWith("REALM1");
  });

  it("falls back to the embedded vendor + raw labels when QBO isn't connected", async () => {
    mocks.getServiceRoleClient.mockReturnValue(fakeSb(invoiceRow(), [lineRow()]));
    mocks.getFreshAccessToken.mockResolvedValue({ ok: false, reason: "not_connected" });

    const result = await buildInvoiceQboExport("00000000-0000-4000-8000-000000000189");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.bill.VendorRef?.value).toBe("EMBEDDED-VENDOR");
    // No maps → the raw local account label is carried through.
    expect(result.bill.Line[0].AccountBasedExpenseLineDetail.AccountRef?.value).toBe(
      "5000-Materials"
    );
    // No connection → never touched the central link tables.
    expect(mocks.getQuickbooksLink).not.toHaveBeenCalled();
    expect(mocks.loadMappingLookups).not.toHaveBeenCalled();
  });

  it("returns not_found when the invoice id doesn't exist", async () => {
    mocks.getServiceRoleClient.mockReturnValue(fakeSb(null, []));
    mocks.getFreshAccessToken.mockResolvedValue(CONNECTED);

    const result = await buildInvoiceQboExport("missing");
    expect(result.status).toBe("not_found");
  });

  it("returns unconfigured when the service-role client is unavailable", async () => {
    mocks.getServiceRoleClient.mockReturnValue(null);

    const result = await buildInvoiceQboExport("00000000-0000-4000-8000-000000000189");
    expect(result.status).toBe("unconfigured");
  });
});
