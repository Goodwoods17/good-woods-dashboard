"use client";

import { useState } from "react";
import { Modal } from "@shared/components/ui/Modal";
import { FieldStack, Field, Input } from "@shared/components/forms/FormField";
import { useJobs } from "@features/jobs/lib/jobsStore";
import {
  WORK_STATIONS,
  type NewWorkUnit,
  type WorkStation,
  type WorkUnit,
} from "@features/shop/lib/shopStore";

const CONTROL =
  "w-full text-sm bg-surface border border-border rounded-md px-3 py-2 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast";

function isoToDateInput(iso: string): string {
  return iso.slice(0, 10);
}

function dateInputToIso(date: string): string {
  // Anchor at local noon so the calendar day never shifts across time zones.
  return new Date(`${date}T12:00:00`).toISOString();
}

/**
 * Add or edit a work unit. Links to a real job via a dropdown of the actual
 * pipeline (no free-text job codes), and lets the start date be corrected.
 */
export function UnitModal({
  unit,
  onSubmit,
  onDelete,
  onClose,
}: {
  unit?: WorkUnit;
  onSubmit: (values: NewWorkUnit) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { jobs } = useJobs();
  const editing = unit !== undefined;

  const [jobId, setJobId] = useState<string>(unit?.jobId ?? "");
  const [description, setDescription] = useState(unit?.description ?? "");
  const [station, setStation] = useState<WorkStation>(unit?.station ?? "cut");
  const [startedDate, setStartedDate] = useState(
    isoToDateInput(unit?.startedAt ?? new Date().toISOString())
  );
  const [notes, setNotes] = useState(unit?.notes ?? "");

  const sortedJobs = [...jobs].sort((a, b) => a.code.localeCompare(b.code));
  const canSave = description.trim().length > 0;

  function submit() {
    if (!canSave) return;
    onSubmit({
      jobId: jobId || null,
      description: description.trim(),
      station,
      startedAt: dateInputToIso(startedDate),
      notes: notes.trim() ? notes.trim() : null,
    });
    onClose();
  }

  return (
    <Modal title={editing ? "Edit work unit" : "New work unit"} onClose={onClose}>
      <FieldStack>
        <Field label="Linked job">
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={CONTROL}>
            <option value="">Unlinked</option>
            {sortedJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} · {j.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="What is it">
          <Input
            value={description}
            onChange={setDescription}
            placeholder="e.g. Suite 305 upper boxes"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Station">
            <select
              value={station}
              onChange={(e) => setStation(e.target.value as WorkStation)}
              className={CONTROL}
            >
              {WORK_STATIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Started">
            <input
              type="date"
              value={startedDate}
              onChange={(e) => setStartedDate(e.target.value)}
              className={CONTROL}
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional. Anything the floor should know."
            rows={2}
            className={`${CONTROL} resize-none`}
          />
        </Field>

        <div className="flex items-center justify-between gap-2 pt-1">
          {editing && onDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-status-blocked transition-colors duration-fast hover:bg-status-blocked-soft"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary shadow-floating transition-shadow duration-fast hover:shadow-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSave}
              className="rounded-full bg-ink-pill px-4 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent-active disabled:cursor-not-allowed disabled:opacity-40"
            >
              {editing ? "Save" : "Add unit"}
            </button>
          </div>
        </div>
      </FieldStack>
    </Modal>
  );
}
