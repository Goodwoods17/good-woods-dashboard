"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { Pill } from "@shared/components/ui/Pill";
import { formatError } from "@shared/lib/formatError";
import { hasSupabase } from "@shared/lib/supabase";
import { useJobProgress } from "../lib/jobProgressStore";
import { JOB_ITEM_STATUS_LABELS, jobItemStatusTone } from "../lib/statusPill";

/**
 * Slice-1 tracer field view for one job: render its trackable `job_items`, tap a
 * row to cycle its status (optimistic + persisted + live via Realtime). A single
 * "Add tracer item" action seeds a step so the cycle is demonstrable end-to-end
 * (templates that materialise full phase steps land in slice 2).
 */
export function JobStatusTab({ jobId }: { jobId: string }) {
  const { items, loading, cycleItem, addItem } = useJobProgress(jobId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCycle = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        await cycleItem(id);
      } catch (e) {
        setError(formatError(e));
      } finally {
        setBusyId(null);
      }
    },
    [cycleItem]
  );

  const onAdd = useCallback(async () => {
    setAdding(true);
    setError(null);
    try {
      await addItem("Tracer step", "assembly");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setAdding(false);
    }
  }, [addItem]);

  return (
    <section className="px-8 pb-10" data-testid="job-status-tab">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-text-secondary">Trackable items</h2>
        <button
          type="button"
          onClick={onAdd}
          disabled={adding || !hasSupabase()}
          data-testid="add-tracer-item"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary shadow-resting transition-colors duration-fast hover:bg-surface-muted disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {adding ? "Adding…" : "Add tracer item"}
        </button>
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-tertiary" data-testid="job-status-empty">
          No trackable items yet. Add one to start cycling its status.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onCycle(item.id)}
                disabled={busyId === item.id}
                data-testid="job-status-item"
                data-status={item.status}
                aria-label={`${item.label} — ${JOB_ITEM_STATUS_LABELS[item.status]}, tap to advance`}
                className="flex w-full items-center justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3 text-left shadow-resting transition-colors duration-fast hover:bg-surface-muted disabled:opacity-60"
              >
                <span className="min-w-0 truncate text-sm text-text-primary">{item.label}</span>
                <Pill
                  tone={jobItemStatusTone(item.status)}
                  label={JOB_ITEM_STATUS_LABELS[item.status]}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
