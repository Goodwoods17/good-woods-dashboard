"use client";

import type { Job } from "@shared/lib/types";

export type CompanyInfo = {
  name: string;
  tagline: string;
  address: string;
  email: string;
  gstNumber: string;
};

// Defaults. The live values are overridden at runtime by the workspace
// settings store via setInvoiceIdentity, so editing Company/Tax in
// /settings flows through to invoices, the PDF, and the ICS export
// without each pure function needing the React context.
export const DEFAULT_TAX_RATE = 0.12; // BC: 5% GST + 7% PST
export const DEFAULT_COMPANY: CompanyInfo = {
  name: "Good Woods",
  tagline: "Custom cabinetry & millwork",
  address: "Victoria, British Columbia",
  email: "andrew@goodwoods.ca",
  gstNumber: "GST 12345 6789 RT0001",
};

let liveCompany: CompanyInfo = DEFAULT_COMPANY;
let liveTaxRate: number = DEFAULT_TAX_RATE;

/** Sync the live invoice identity. Called by WorkspaceSettingsProvider. */
export function setInvoiceIdentity(company: CompanyInfo, taxRate: number): void {
  liveCompany = company;
  liveTaxRate = taxRate;
}

export function getCompany(): CompanyInfo {
  return liveCompany;
}

export function getTaxRate(): number {
  return liveTaxRate;
}

export type InvoiceTotals = {
  subtotal: number;
  tax: number;
  total: number;
};

export function computeInvoiceTotals(job: Job): InvoiceTotals {
  const subtotal = job.invoice.lineItems.reduce((s, li) => s + li.qty * li.unitPrice, 0);
  const tax = subtotal * getTaxRate();
  return { subtotal, tax, total: subtotal + tax };
}

export async function generateInvoicePdf(job: Job): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { InvoiceDocument } = await import("@features/jobs/components/invoice/InvoiceDocument");

  const blob = await pdf(InvoiceDocument({ job })).toBlob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${job.invoice.number}_${job.client.replace(/[^a-z0-9]/gi, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the download starts
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
