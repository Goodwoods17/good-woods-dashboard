/**
 * Unit tests for QBO S7 push gating — written first (TDD, red→green).
 *
 * Pure functions only: no Supabase, no React, no QBO API calls. These cover the
 * three things the slice's done-when hinges on that DON'T need a live sandbox:
 *   • block-until-mapped (refuse if vendor / account / tax unresolved),
 *   • idempotent refuse (already-pushed wins over everything),
 *   • the "View in QuickBooks" deep link + request-body stripping.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateBillPush,
  qboBillDeepLink,
  stripInternalFields,
  toQboBillRequestBody,
  type LineGateInput,
} from "./qboBillPush";
import { buildQboBill } from "./qboExport";
import type { MappingLookups } from "./qboAccountMapping";
import type { Invoice, InvoiceLine } from "./types";

const fullMaps: MappingLookups = {
  accountByLocal: { "5000-Materials": "33", "5100-Subcontractors": "44" },
  taxByLocal: { GST: "4", PST: "5", GST_PST: "6" },
};

const mappedLines: LineGateInput[] = [
  { account: "5000-Materials", taxKey: "GST_PST" },
  { account: "5100-Subcontractors", taxKey: "GST" },
];

describe("evaluateBillPush — block-until-mapped gate", () => {
  it("is pushable when posted, vendor + all accounts + all taxes mapped, not already pushed", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: "99",
      lines: mappedLines,
      maps: fullMaps,
    });
    expect(gate.pushable).toBe(true);
    expect(gate.block).toBeNull();
    expect(gate.unmappedAccounts).toEqual([]);
    expect(gate.unmappedTaxes).toEqual([]);
    expect(gate.vendorMapped).toBe(true);
  });

  it("refuses a non-posted invoice", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "reviewed",
      alreadyPushed: false,
      vendorRef: "99",
      lines: mappedLines,
      maps: fullMaps,
    });
    expect(gate.pushable).toBe(false);
    expect(gate.block).toBe("not_posted");
  });

  it("refuses when the vendor is unresolved", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: null,
      lines: mappedLines,
      maps: fullMaps,
    });
    expect(gate.pushable).toBe(false);
    expect(gate.block).toBe("vendor_unmapped");
    expect(gate.vendorMapped).toBe(false);
  });

  it("refuses + lists the unmapped account keys when a line account has no QBO link", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: "99",
      lines: [
        { account: "5000-Materials", taxKey: "GST" },
        { account: "9999-Unmapped", taxKey: "GST" },
      ],
      maps: fullMaps,
    });
    expect(gate.pushable).toBe(false);
    expect(gate.block).toBe("accounts_unmapped");
    expect(gate.unmappedAccounts).toContain("9999-Unmapped");
  });

  it("treats a null line account as unmapped (every bill line needs an AccountRef)", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: "99",
      lines: [{ account: null, taxKey: "GST" }],
      maps: fullMaps,
    });
    expect(gate.pushable).toBe(false);
    expect(gate.block).toBe("accounts_unmapped");
    expect(gate.unmappedAccounts.length).toBeGreaterThan(0);
  });

  it("refuses + lists the unmapped tax keys when a taxable line's tax has no QBO link", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: "99",
      lines: mappedLines,
      maps: { accountByLocal: fullMaps.accountByLocal, taxByLocal: { GST: "4" } },
    });
    expect(gate.pushable).toBe(false);
    expect(gate.block).toBe("taxes_unmapped");
    expect(gate.unmappedTaxes).toContain("GST_PST");
  });

  it("ignores non-taxable lines for the tax gate (null tax key never blocks)", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: false,
      vendorRef: "99",
      lines: [{ account: "5000-Materials", taxKey: null }],
      maps: { accountByLocal: fullMaps.accountByLocal, taxByLocal: {} },
    });
    expect(gate.pushable).toBe(true);
    expect(gate.block).toBeNull();
  });

  it("already-pushed wins over everything (idempotent refuse, even if fully mapped)", () => {
    const gate = evaluateBillPush({
      invoiceStatus: "posted",
      alreadyPushed: true,
      vendorRef: "99",
      lines: mappedLines,
      maps: fullMaps,
    });
    expect(gate.pushable).toBe(false);
    expect(gate.block).toBe("already_pushed");
  });
});

describe("qboBillDeepLink", () => {
  it("builds a sandbox bill deep link", () => {
    expect(qboBillDeepLink("sandbox", "145")).toBe(
      "https://app.sandbox.qbo.intuit.com/app/bill?txnId=145"
    );
  });
  it("builds a production bill deep link", () => {
    expect(qboBillDeepLink("production", "145")).toBe(
      "https://app.qbo.intuit.com/app/bill?txnId=145"
    );
  });
  it("url-encodes the bill id", () => {
    expect(qboBillDeepLink("sandbox", "a b")).toContain("txnId=a%20b");
  });
});

describe("stripInternalFields / toQboBillRequestBody", () => {
  it("recursively removes underscore-prefixed bookkeeping keys", () => {
    const input = {
      VendorRef: { value: "99" },
      _internal: "secret",
      Line: [{ Amount: 10, _kind: "material", _pstShare: 1.23 }],
      TxnTaxDetail: { TaxLine: [{ Amount: 5, _component: "GST" }] },
    };
    const out = stripInternalFields(input) as typeof input;
    expect(out).not.toHaveProperty("_internal");
    expect(out.Line[0]).not.toHaveProperty("_kind");
    expect(out.Line[0]).not.toHaveProperty("_pstShare");
    expect(out.Line[0].Amount).toBe(10);
    expect(out.TxnTaxDetail.TaxLine[0]).not.toHaveProperty("_component");
    expect(out.TxnTaxDetail.TaxLine[0].Amount).toBe(5);
  });

  it("a real built bill carries NO underscore keys after stripping", () => {
    const invoice: Pick<
      Invoice,
      | "id"
      | "status"
      | "qboVendorId"
      | "supplier"
      | "invoiceNumber"
      | "issueDate"
      | "dueDate"
      | "poRef"
      | "preTaxTotal"
      | "gst"
      | "pst"
      | "total"
    > = {
      id: "inv-1",
      status: "posted",
      qboVendorId: "99",
      supplier: "Reimer",
      invoiceNumber: "B-1",
      issueDate: "2026-01-01",
      dueDate: null,
      poRef: null,
      preTaxTotal: 100,
      gst: 5,
      pst: 7,
      total: 112,
    };
    const lines: Pick<
      InvoiceLine,
      "id" | "lineNo" | "description" | "amount" | "taxFlag" | "qboAccount" | "lineKind" | "jobId"
    >[] = [
      {
        id: "l1",
        lineNo: 0,
        description: "Maple",
        amount: 100,
        taxFlag: true,
        qboAccount: "5000-Materials",
        lineKind: "material",
        jobId: "job-1",
      },
    ];
    const { bill } = buildQboBill(invoice, lines, { maps: fullMaps });
    const body = toQboBillRequestBody(bill);
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/"_/);
    // Core QBO fields survive.
    expect(json).toContain("VendorRef");
    expect(json).toContain("GlobalTaxCalculation");
    expect(json).toContain("TxnTaxDetail");
  });
});
