"use client";

import type { Job } from "./types";

export const TAX_RATE = 0.12; // BC: 5% GST + 7% PST
export const COMPANY = {
  name: "Good Woods",
  tagline: "Custom cabinetry & millwork",
  address: "Victoria, British Columbia",
  email: "andrew@goodwoods.ca",
  gstNumber: "GST 12345 6789 RT0001",
};

export type InvoiceTotals = {
  subtotal: number;
  tax: number;
  total: number;
};

export function computeInvoiceTotals(job: Job): InvoiceTotals {
  const subtotal = job.invoice.lineItems.reduce(
    (s, li) => s + li.qty * li.unitPrice,
    0
  );
  const tax = subtotal * TAX_RATE;
  return { subtotal, tax, total: subtotal + tax };
}

export async function generateInvoicePdf(job: Job): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { InvoiceDocument } = await import("@/components/invoice/InvoiceDocument");

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
