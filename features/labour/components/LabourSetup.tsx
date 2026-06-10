"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { CABINET_TYPES, type CabinetTypeId } from "@features/estimator/lib/types";
import { useLabour } from "@features/labour/lib/labourStore";

/**
 * Editors for the three reference lists. Categories and operations are fully
 * addable at runtime so unforeseen steps slot in with no migration; an
 * operation can be tagged to a cabinet type to drive the estimator nudge.
 */
export function LabourSetup() {
  const {
    categories,
    operations,
    workers,
    addCategory,
    updateCategory,
    removeCategory,
    addOperation,
    updateOperation,
    removeOperation,
    addWorker,
    updateWorker,
    removeWorker,
    categoryById,
  } = useLabour();

  const activeCats = categories.filter((c) => c.active);

  return (
    <div className="space-y-4">
      {/* Operations */}
      <Panel title="Operations" hint="The work items time is logged against.">
        <ul className="divide-y divide-border-faint">
          {operations
            .filter((o) => o.active)
            .map((o) => (
              <li key={o.id} className="group flex flex-wrap items-center gap-2 py-2">
                <input
                  value={o.name}
                  onChange={(e) => updateOperation(o.id, { name: e.target.value })}
                  className="min-w-[10rem] flex-1 rounded-md bg-transparent px-2 py-1 text-sm text-text-primary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
                />
                <select
                  value={o.categoryId ?? ""}
                  onChange={(e) => updateOperation(o.id, { categoryId: e.target.value || null })}
                  className="rounded-md bg-transparent px-1 py-1 text-sm text-text-secondary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
                >
                  <option value="">No category</option>
                  {activeCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  value={o.cabinetType ?? ""}
                  onChange={(e) =>
                    updateOperation(o.id, {
                      cabinetType: (e.target.value || null) as CabinetTypeId | null,
                    })
                  }
                  title="Tag to a cabinet type to drive the estimator nudge"
                  className="rounded-md bg-transparent px-1 py-1 text-xs text-text-tertiary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
                >
                  <option value="">— cabinet —</option>
                  {CABINET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <RemoveBtn label={`Remove ${o.name}`} onClick={() => removeOperation(o.id)} />
              </li>
            ))}
        </ul>
        <AddRow
          placeholder="New operation name"
          onAdd={(name) => addOperation(name, activeCats[0]?.id ?? null)}
        />
      </Panel>

      {/* Categories */}
      <Panel title="Categories" hint="Rollup buckets for the bottleneck view.">
        <ul className="divide-y divide-border-faint">
          {activeCats.map((c) => (
            <li key={c.id} className="group flex items-center gap-2 py-2">
              <input
                value={c.label}
                onChange={(e) => updateCategory(c.id, { label: e.target.value })}
                className="flex-1 rounded-md bg-transparent px-2 py-1 text-sm text-text-primary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
              />
              <span className="font-mono text-micro text-text-tertiary">
                {operations.filter((o) => o.active && o.categoryId === c.id).length} ops
              </span>
              <RemoveBtn label={`Remove ${c.label}`} onClick={() => removeCategory(c.id)} />
            </li>
          ))}
        </ul>
        <AddRow placeholder="New category" onAdd={addCategory} />
      </Panel>

      {/* Workers */}
      <Panel title="Workers" hint="Who runs the timers — splits the bottleneck data by person.">
        <ul className="divide-y divide-border-faint">
          {workers
            .filter((w) => w.active)
            .map((w) => (
              <li key={w.id} className="group flex items-center gap-2 py-2">
                <input
                  value={w.name}
                  onChange={(e) => updateWorker(w.id, { name: e.target.value })}
                  className="flex-1 rounded-md bg-transparent px-2 py-1 text-sm text-text-primary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
                />
                <RemoveBtn label={`Remove ${w.name}`} onClick={() => removeWorker(w.id)} />
              </li>
            ))}
        </ul>
        <AddRow placeholder="New worker name" onAdd={addWorker} />
      </Panel>

      <p className="px-1 text-xs text-text-tertiary">
        {categoryById.size} categories · removing keeps history intact (soft-delete).
      </p>
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-resting">
      <div className="mb-2">
        <h3 className="font-serif text-title font-medium text-text-primary">{title}</h3>
        <p className="text-xs text-text-tertiary">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function RemoveBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-tertiary opacity-0 transition-all duration-fast hover:bg-status-blocked-soft hover:text-status-blocked group-hover:opacity-100"
    >
      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");
  const commit = () => {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setValue("");
  };
  return (
    <div className="mt-1 flex items-center gap-2 border-t border-border-faint pt-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        placeholder={placeholder}
        className="flex-1 rounded-md bg-surface-muted/50 px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-soft"
      />
      <button
        type="button"
        onClick={commit}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
          value.trim()
            ? "bg-accent text-white hover:bg-accent-hover"
            : "cursor-not-allowed bg-surface-muted text-text-tertiary"
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add
      </button>
    </div>
  );
}
