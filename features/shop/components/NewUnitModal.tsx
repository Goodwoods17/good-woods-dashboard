"use client";

import { useState } from "react";
import { WORK_STATIONS, type WorkStation } from "@features/shop/lib/shopStore";
import { Modal } from "@shared/components/ui/Modal";
import { FieldStack, Field, Input } from "@shared/components/forms/FormField";

export function NewUnitModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (u: {
    jobCode: string;
    description: string;
    station: WorkStation;
  }) => void;
}) {
  const [jobCode, setJobCode] = useState("");
  const [description, setDescription] = useState("");
  const [station, setStation] = useState<WorkStation>("cut");

  return (
    <Modal onClose={onClose} title="New work unit">
      <FieldStack>
        <Field label="Job code">
          <Input value={jobCode} onChange={setJobCode} placeholder="GW-2026-001" />
        </Field>
        <Field label="Description">
          <Input
            value={description}
            onChange={setDescription}
            placeholder="e.g. Suite 305 — upper boxes"
          />
        </Field>
        <Field label="Starting station">
          <select
            value={station}
            onChange={(e) => setStation(e.target.value as WorkStation)}
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2"
          >
            {WORK_STATIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!jobCode.trim() || !description.trim()) return;
              onSubmit({
                jobCode: jobCode.trim(),
                description: description.trim(),
                station,
              });
              onClose();
            }}
            className="px-4 py-1.5 text-sm rounded-full bg-ink-pill text-white hover:bg-accent-active transition-colors duration-fast"
          >
            Add unit
          </button>
        </div>
      </FieldStack>
    </Modal>
  );
}
