"use client";

// Cost-code task-template editor (job-costing P2b). Lives in the /labour
// "Templates" tab. A template bundles cost codes (labour operations carrying a
// `code`) with a qty + budgeted minutes, defaulting to the code's historical
// average. Loaded into an estimate later (P3) to seed a job's labour budget.

import { useMemo, useState } from "react";
import { cn } from "@shared/lib/utils";
import { useLabour, formatMinutes, type LabourOperation } from "@features/labour/lib/labourStore";
import { useCostCodeTemplates } from "../lib/costCodeTemplatesStore";

// Historical average minutes for a code, per unit of work:
// driven codes → minutes ÷ unit; flat codes → minutes ÷ session; else the
// hand-set default. Null when there is nothing to go on.
function historicalPerUnitMinutes(
  op: LabourOperation,
  stat: { avgMs: number; avgMinutesPerUnit: number | null; count: number } | undefined
): number | null {
  if (op.driverUnit) return stat?.avgMinutesPerUnit ?? op.defaultMinutes ?? null;
  if (stat && stat.count > 0) return Math.round(stat.avgMs / 60000);
  return op.defaultMinutes ?? null;
}

export function TaskTemplatesEditor() {
  const { operations, operationStats, categoryById } = useLabour();
  const {
    templates,
    itemsByTemplate,
    error,
    addTemplate,
    updateTemplate,
    removeTemplate,
    addItem,
    updateItem,
    removeItem,
  } = useCostCodeTemplates();

  const [newName, setNewName] = useState("");

  // Only operations carrying a cost `code` are pickable into a template.
  const codeOps = useMemo(() => operations.filter((o) => o.active && o.code), [operations]);
  const opById = useMemo(() => new Map(operations.map((o) => [o.id, o])), [operations]);
  const statByOpId = useMemo(
    () => new Map(operationStats.map((s) => [s.operation.id, s])),
    [operationStats]
  );

  const activeTemplates = templates.filter((t) => t.active);

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">
        Task templates bundle cost codes with budgeted minutes so an estimate can drop in a whole
        build at once. Minutes default to each code&rsquo;s tracked average. Distinct from the
        estimator&rsquo;s section templates.
      </p>

      {error && (
        <p className="rounded-lg bg-status-blocked-soft px-3 py-2 text-sm text-status-blocked">
          {error}
        </p>
      )}

      {/* New template */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          addTemplate(name);
          setNewName("");
        }}
        className="flex gap-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New template name (e.g. Full kitchen build)"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-lg bg-ink-pill px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Add template
        </button>
      </form>

      {activeTemplates.length === 0 ? (
        <div className="rounded-2xl bg-surface p-8 text-center shadow-resting">
          <p className="text-sm text-text-secondary">
            No task templates yet. Create one above, then add the cost codes a typical build needs.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeTemplates.map((tpl) => {
            const tplItems = itemsByTemplate.get(tpl.id) ?? [];
            const totalMinutes = tplItems.reduce(
              (sum, it) => sum + (it.budgetedMinutes ?? 0) * (it.qty || 1),
              0
            );
            return (
              <section key={tpl.id} className="rounded-2xl bg-surface p-5 shadow-resting">
                <header className="mb-3 flex items-center justify-between gap-3">
                  <input
                    value={tpl.name}
                    onChange={(e) => updateTemplate(tpl.id, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-md bg-transparent font-serif text-title outline-none hover:bg-surface-muted/50 focus:bg-surface-muted/50"
                  />
                  <span className="shrink-0 font-mono text-xs tabular-nums text-text-tertiary">
                    {formatMinutes(totalMinutes)} total
                  </span>
                  <button
                    onClick={() => removeTemplate(tpl.id)}
                    className="shrink-0 text-xs text-text-tertiary hover:text-status-blocked"
                    aria-label={`Archive ${tpl.name}`}
                  >
                    Archive
                  </button>
                </header>

                {/* Items */}
                <ul className="divide-y divide-border">
                  {tplItems.map((it) => {
                    const op = it.codeId ? opById.get(it.codeId) : undefined;
                    const phase = op?.categoryId ? categoryById.get(op.categoryId) : null;
                    return (
                      <li key={it.id} className="flex items-center gap-3 py-2">
                        <span className="w-20 shrink-0 font-mono text-xs text-text-secondary">
                          {op?.code ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {op?.name ?? "Unknown code"}
                          {phase && (
                            <span className="ml-2 text-xs text-text-tertiary">{phase.label}</span>
                          )}
                        </span>
                        <label className="flex items-center gap-1 text-xs text-text-tertiary">
                          qty
                          <input
                            type="number"
                            min={0}
                            value={it.qty}
                            onChange={(e) =>
                              updateItem(it.id, { qty: Math.max(0, Number(e.target.value)) })
                            }
                            className="w-14 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono text-xs tabular-nums outline-none focus:border-border-strong"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-text-tertiary">
                          min
                          <input
                            type="number"
                            min={0}
                            value={it.budgetedMinutes ?? ""}
                            onChange={(e) =>
                              updateItem(it.id, {
                                budgetedMinutes:
                                  e.target.value === ""
                                    ? null
                                    : Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono text-xs tabular-nums outline-none focus:border-border-strong"
                          />
                        </label>
                        <button
                          onClick={() => removeItem(it.id)}
                          className="shrink-0 text-text-tertiary hover:text-status-blocked"
                          aria-label="Remove code"
                        >
                          &times;
                        </button>
                      </li>
                    );
                  })}
                  {tplItems.length === 0 && (
                    <li className="py-2 text-sm text-text-tertiary">
                      No codes yet. Add one below.
                    </li>
                  )}
                </ul>

                {/* Add code to this template */}
                <AddCodeRow
                  codeOps={codeOps}
                  onAdd={(opId) => {
                    const op = opById.get(opId);
                    const stat = statByOpId.get(opId);
                    const perUnit = op ? historicalPerUnitMinutes(op, stat) : null;
                    addItem({
                      templateId: tpl.id,
                      codeId: opId,
                      budgetedMinutes: perUnit,
                      qty: 1,
                    });
                  }}
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddCodeRow({
  codeOps,
  onAdd,
}: {
  codeOps: LabourOperation[];
  onAdd: (opId: string) => void;
}) {
  const [opId, setOpId] = useState("");
  return (
    <div className="mt-3 flex gap-2">
      <select
        value={opId}
        onChange={(e) => setOpId(e.target.value)}
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
      >
        <option value="">Add a cost code…</option>
        {codeOps.map((o) => (
          <option key={o.id} value={o.id}>
            {o.code} — {o.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          if (!opId) return;
          onAdd(opId);
          setOpId("");
        }}
        disabled={!opId}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}
