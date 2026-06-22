"use client";

import { useState, useEffect } from "react";
import { Modal } from "@shared/components/ui/Modal";
import { FieldStack, Field } from "@shared/components/forms/FormField";
import { useWorkCards } from "../lib/workCardsStore";
import { useLabour } from "@features/labour/lib/labourStore";
import { PHASE_ORDER, PHASE_LABELS } from "@features/job-costing/lib/costCodes";

export function AddCardModal({
  open,
  jobId,
  onClose,
}: {
  open: boolean;
  jobId: string;
  onClose: () => void;
}) {
  const { addCard } = useWorkCards();
  const { operations, workers } = useLabour();

  const [description, setDescription] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [operationId, setOperationId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  useEffect(() => {
    if (open) {
      setDescription("");
      setPhaseId("");
      setOperationId("");
      setAssigneeId("");
    }
  }, [open]);

  if (!open) return null;

  const codedOps = operations.filter((o) => o.code != null && o.active);

  function handleOpChange(opId: string) {
    setOperationId(opId);
    if (opId) {
      const op = codedOps.find((o) => o.id === opId);
      if (op?.categoryId) setPhaseId(op.categoryId);
    }
  }

  async function handleSubmit() {
    if (!description.trim() || !phaseId) return;
    await addCard({
      jobId,
      phaseId,
      operationId: operationId || null,
      description: description.trim(),
      targetQuantity: null,
      assigneeId: assigneeId || null,
      status: "todo",
      stuckReason: null,
      source: "manual",
      sort: 999,
    });
    onClose();
  }

  const canSubmit = description.trim().length > 0 && phaseId.length > 0;

  return (
    <Modal onClose={onClose} title="Add card">
      <FieldStack>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What needs doing?"
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 resize-none"
          />
        </Field>

        <Field label="Phase">
          <select
            value={phaseId}
            onChange={(e) => setPhaseId(e.target.value)}
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2"
          >
            <option value="">Select phase…</option>
            {PHASE_ORDER.map((p) => (
              <option key={p} value={p}>
                {PHASE_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cost code (optional)">
          <select
            value={operationId}
            onChange={(e) => handleOpChange(e.target.value)}
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2"
          >
            <option value="">None</option>
            {codedOps.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Assignee (optional)">
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2"
          >
            <option value="">Unassigned</option>
            {workers
              .filter((w) => w.active)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-surface text-text-secondary"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add card
          </button>
        </div>
      </FieldStack>
    </Modal>
  );
}
