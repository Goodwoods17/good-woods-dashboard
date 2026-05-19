"use client";

import { useState } from "react";
import { AlertOctagon } from "lucide-react";
import { WORK_STATIONS, type WorkStation } from "@features/shop/lib/shopStore";
import { Modal, FieldStack, Field } from "./Modal";

export function AndonModal({
  onClose,
  onRaise,
}: {
  onClose: () => void;
  onRaise: (station: WorkStation | "all", message: string) => void;
}) {
  const [station, setStation] = useState<WorkStation | "all">("all");
  const [message, setMessage] = useState("");

  return (
    <Modal onClose={onClose} title="Raise andon" tone="andon">
      <FieldStack>
        <Field label="Station">
          <select
            value={station}
            onChange={(e) => setStation(e.target.value as WorkStation | "all")}
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2"
          >
            <option value="all">Whole shop</option>
            {WORK_STATIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What's the issue?">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="e.g. Out of #20 hinges — can't continue"
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 resize-none"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-surface text-text-secondary"
          >
            Cancel
          </button>
          <button
            onClick={() => message.trim() && onRaise(station, message.trim())}
            className="px-3 py-1.5 text-sm rounded-md bg-status-andon text-white hover:opacity-90"
          >
            <span className="inline-flex items-center gap-1.5">
              <AlertOctagon className="h-3.5 w-3.5" strokeWidth={2} />
              Raise
            </span>
          </button>
        </div>
      </FieldStack>
    </Modal>
  );
}
