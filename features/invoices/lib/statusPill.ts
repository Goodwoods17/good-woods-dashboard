import type { PillTone } from "@shared/components/ui/Pill";
import type { InvoiceStatus } from "./types";

/** Human label for each invoice status. */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: "Pending",
  needs_review: "Needs review",
  reviewed: "Reviewed",
  posted: "Posted",
  error: "Error",
};

/** Pill tone per status (reuses the shared Pill tone vocabulary / tokens). */
export function invoiceStatusTone(status: InvoiceStatus): PillTone {
  switch (status) {
    case "pending":
      return { bg: "bg-surface-muted", text: "text-text-secondary", dot: "bg-text-tertiary" };
    case "needs_review":
      return { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" };
    case "reviewed":
      return { bg: "bg-accent-soft", text: "text-accent", dot: "bg-accent" };
    case "posted":
      return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" };
    case "error":
      return { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" };
  }
}
