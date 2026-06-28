/**
 * S13 — Row mapper for public.commitment_ledger.
 * Converts between Postgres snake_case rows and the OwnerReliabilityRecord shape
 * the per-owner reliability roll-up consumes.
 */
import type { OwnerReliabilityRecord } from "./commitmentLedger";

export type CommitmentLedgerRow = {
  owner_kind: OwnerReliabilityRecord["ownerKind"];
  owner_id: string | null;
  owner_name: string;
  committed_date: string;
  actual_date: string | null;
  missed: boolean;
};

export function rowToOwnerReliabilityRecord(row: CommitmentLedgerRow): OwnerReliabilityRecord {
  return {
    ownerKind: row.owner_kind,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    committedDate: row.committed_date,
    actualDate: row.actual_date,
    missed: row.missed,
  };
}

export function ownerReliabilityRecordToRow(rec: OwnerReliabilityRecord): CommitmentLedgerRow {
  return {
    owner_kind: rec.ownerKind,
    owner_id: rec.ownerId ?? null,
    owner_name: rec.ownerName,
    committed_date: rec.committedDate,
    actual_date: rec.actualDate ?? null,
    missed: rec.missed,
  };
}
