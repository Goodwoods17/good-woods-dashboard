import { describe, it, expect } from "vitest";
import {
  makeReadyItemToRow,
  rowToSavedMakeReadyState,
  type SchedulingMakeReadyRow,
} from "./schedulingMakeReadyRowMap";
import type { MakeReadyItem } from "./makeReady";
import {
  ownerReliabilityRecordToRow,
  rowToOwnerReliabilityRecord,
  type CommitmentLedgerRow,
} from "./commitmentLedgerRowMap";
import type { OwnerReliabilityRecord } from "./commitmentLedger";
import {
  commitmentRevisionToRow,
  rowToCommitmentRevision,
  type CommitmentRevisionRow,
} from "./commitmentRevisionsRowMap";
import {
  priorityBumpRecordToRow,
  rowToPriorityBumpRecord,
  type PriorityBumpRow,
} from "./priorityBumpRowMap";
import type { PriorityBumpRecord } from "./priorityBump";
import { applyPhaseCapacityRows } from "./phaseCapacityRowMap";

// ─── scheduling_make_ready_items ──────────────────────────────────────────────

describe("schedulingMakeReadyRowMap", () => {
  const item: MakeReadyItem = {
    id: "cnc-mr-03",
    label: "Toolpath / CNC file ready",
    phase: "cnc",
    autoSignal: "design_signoff",
    sortOrder: 2,
    checked: true,
    overridden: false,
  };

  it("builds a self-describing upsert row from a merged item", () => {
    const row = makeReadyItemToRow("job-1", item);
    expect(row).toEqual<SchedulingMakeReadyRow>({
      job_id: "job-1",
      phase: "cnc",
      template_item_id: "cnc-mr-03",
      label: "Toolpath / CNC file ready",
      source: "template",
      auto_signal: "design_signoff",
      checked: true,
      overridden: false,
      sort_order: 2,
    });
  });

  it("nulls a missing auto-signal", () => {
    const manual: MakeReadyItem = { ...item, autoSignal: undefined };
    expect(makeReadyItemToRow("job-1", manual).auto_signal).toBeNull();
  });

  it("reads the saved-state subset back out", () => {
    const row = makeReadyItemToRow("job-1", item);
    expect(rowToSavedMakeReadyState(row)).toEqual({
      id: "cnc-mr-03",
      checked: true,
      overridden: false,
    });
  });
});

// ─── commitment_ledger ────────────────────────────────────────────────────────

describe("commitmentLedgerRowMap", () => {
  const row: CommitmentLedgerRow = {
    owner_kind: "subtrade",
    owner_id: "sub-1",
    owner_name: "Toolpath Inc.",
    committed_date: "2026-07-01",
    actual_date: "2026-07-03",
    missed: true,
  };

  it("maps a row to an OwnerReliabilityRecord", () => {
    const rec = rowToOwnerReliabilityRecord(row);
    expect(rec.ownerKind).toBe("subtrade");
    expect(rec.ownerName).toBe("Toolpath Inc.");
    expect(rec.committedDate).toBe("2026-07-01");
    expect(rec.missed).toBe(true);
  });

  it("round-trips row → record → row", () => {
    expect(ownerReliabilityRecordToRow(rowToOwnerReliabilityRecord(row))).toEqual(row);
  });

  it("defaults absent nullables to null", () => {
    const rec: OwnerReliabilityRecord = {
      ownerKind: "shop",
      ownerId: null,
      ownerName: "Good Woods",
      committedDate: "2026-08-01",
      actualDate: null,
      missed: false,
    };
    const r = ownerReliabilityRecordToRow(rec);
    expect(r.owner_id).toBeNull();
    expect(r.actual_date).toBeNull();
  });
});

// ─── commitment_revisions ─────────────────────────────────────────────────────

describe("commitmentRevisionsRowMap", () => {
  const row: CommitmentRevisionRow = {
    id: "rev-1",
    job_id: "job-1",
    kind: "change_order",
    reason_code: "scope_change",
    old_committed_date: "2026-07-01",
    new_committed_date: "2026-07-15",
    old_buffer_days: 3,
    new_buffer_days: 5,
    dings_reliability: false,
    note: "Added an island",
    revised_by: "owner@goodwoods.app",
    revised_at: "2026-06-27T12:00:00.000Z",
  };

  it("maps a row to a CommitmentRevision", () => {
    const rev = rowToCommitmentRevision(row);
    expect(rev.jobId).toBe("job-1");
    expect(rev.reasonCode).toBe("scope_change");
    expect(rev.oldBufferDays).toBe(3);
    expect(rev.dingsReliability).toBe(false);
  });

  it("round-trips row → revision → row", () => {
    expect(commitmentRevisionToRow(rowToCommitmentRevision(row))).toEqual(row);
  });
});

// ─── priority_bumps ───────────────────────────────────────────────────────────

describe("priorityBumpRowMap", () => {
  const record: PriorityBumpRecord = {
    id: "bump-1",
    priorityJobId: "job-vip",
    bumpedJobId: "job-pushed",
    bumpDays: 4,
    reason: "VIP ships before Christmas",
    oldCommittedDate: "2026-12-01",
    newCommittedDate: "2026-12-07",
    bumpedBy: "owner@goodwoods.app",
    bumpedAt: "2026-06-27T12:00:00.000Z",
  };

  it("builds the insert row (no bumped_at — DB-defaulted)", () => {
    const row = priorityBumpRecordToRow(record);
    expect(row).toEqual<PriorityBumpRow>({
      id: "bump-1",
      priority_job_id: "job-vip",
      bumped_job_id: "job-pushed",
      bump_days: 4,
      reason: "VIP ships before Christmas",
      old_committed_date: "2026-12-01",
      new_committed_date: "2026-12-07",
      bumped_by: "owner@goodwoods.app",
    });
    expect("bumped_at" in row).toBe(false);
  });

  it("round-trips record → row → record (minus DB-defaulted bumpedAt)", () => {
    const { bumpedAt: _bumpedAt, ...expected } = record;
    void _bumpedAt;
    expect(rowToPriorityBumpRecord(priorityBumpRecordToRow(record))).toEqual(expected);
  });
});

// ─── scheduling_phase_capacity ────────────────────────────────────────────────

describe("phaseCapacityRowMap", () => {
  it("merges rows onto the defaults and coerces numeric strings", () => {
    const merged = applyPhaseCapacityRows([
      { phase: "design", weekly_capacity_hours: "20" },
      { phase: "assembly", weekly_capacity_hours: 60 },
    ]);
    expect(merged.design).toBe(20);
    expect(merged.assembly).toBe(60);
    // An untouched phase keeps its default.
    expect(merged.install).toBe(40);
  });

  it("ignores unknown phases", () => {
    const merged = applyPhaseCapacityRows([{ phase: "not_a_phase", weekly_capacity_hours: 999 }]);
    expect(Object.values(merged)).not.toContain(999);
  });
});
