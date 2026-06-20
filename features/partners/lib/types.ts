/**
 * Domain types for the Partners feature: subtrades (external labour we hire),
 * the trade discipline registry, and the job_trades trade-lines that connect
 * them to projects. See features/partners/CLAUDE.md and ADR 0007.
 *
 * Suppliers reuse the catalog's CatalogSupplier type (enriched in
 * features/catalog/lib/catalogRowMap.ts), not a type here.
 */

/**
 * A discipline a subtrade can practise. Registry-driven (Settings-managed), so
 * `key` is an open string, not a fixed union: a new trade is a row, not a code
 * change. `color` is a --trade-* palette slug (DESIGN.md §2); `icon` a Lucide key.
 */
export type Trade = {
  id: string;
  key: string;
  label: string;
  color: string; // --trade-<color> palette slug (see DESIGN.md)
  icon: string; // Lucide icon key
  isSuggestedDefault: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * An external company/person hired to perform work on a job. Paid for labour.
 * `tradeId` is its PRIMARY discipline (for the profile pill/colour); the trade
 * actually performed on a given job lives on the JobTrade line. Contact info is
 * embedded (no CRM link in v1). `typicalRateNote` is free text, not money.
 */
export type Subtrade = {
  id: string;
  name: string;
  tradeId: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  typicalRateNote: string | null;
  notes: string | null;
  active: boolean; // soft-delete
  createdAt: string;
  updatedAt: string;
};

export type JobTradeStatus = "needed" | "booked" | "done";

/**
 * A trade-line on a project: a trade the job needs, optionally filled by a
 * subtrade (`subtradeId === null` means "needed, not yet assigned" / TBD).
 * `cost` is captured but never summed in v1 (no financial rollups).
 */
export type JobTrade = {
  id: string;
  jobId: string;
  tradeId: string;
  subtradeId: string | null;
  status: JobTradeStatus;
  cost: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
