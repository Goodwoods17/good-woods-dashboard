/**
 * S12 — Row mapper for public.scheduling_make_ready_items.
 * Converts between Postgres snake_case rows and the make-ready domain shapes.
 *
 * Reads only need the saved per-job state (`template_item_id` / `checked` /
 * `overridden`); writes upsert the full row (label / source / auto_signal /
 * sort_order travel with it so the row is self-describing).
 */
import type { AutoSignal, MakeReadyItem } from "./makeReady";
import type { MilestoneStage } from "@shared/lib/types";

/** Full persisted row. */
export type SchedulingMakeReadyRow = {
  job_id: string;
  phase: MilestoneStage;
  template_item_id: string;
  label: string;
  source: string;
  auto_signal: AutoSignal | null;
  checked: boolean;
  overridden: boolean;
  sort_order: number;
};

/** The subset read back to merge onto the standard items. */
export type SchedulingMakeReadyReadRow = Pick<
  SchedulingMakeReadyRow,
  "template_item_id" | "checked" | "overridden"
>;

/** Saved per-job state, keyed by the template item id. */
export type SavedMakeReadyState = Pick<MakeReadyItem, "id" | "checked" | "overridden">;

export function rowToSavedMakeReadyState(row: SchedulingMakeReadyReadRow): SavedMakeReadyState {
  return {
    id: row.template_item_id,
    checked: row.checked,
    overridden: row.overridden,
  };
}

/** Build the full upsert row for a (merged) make-ready item on a job. */
export function makeReadyItemToRow(jobId: string, item: MakeReadyItem): SchedulingMakeReadyRow {
  return {
    job_id: jobId,
    phase: item.phase,
    template_item_id: item.id,
    label: item.label,
    source: "template",
    auto_signal: item.autoSignal ?? null,
    checked: item.checked,
    overridden: item.overridden,
    sort_order: item.sortOrder,
  };
}
