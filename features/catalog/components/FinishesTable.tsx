"use client";

import { Plus, Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { useIsMobile } from "@shared/lib/useIsMobile";
import { useCatalog, type Finish } from "@features/catalog/lib/catalogStore";
import { AutoText, NumCell, StaleChip } from "./cells";

export function FinishesTable() {
  const { finishes, addFinish, updateFinish, removeFinish } = useCatalog();
  const isMobile = useIsMobile();

  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-resting">
      <header className="px-4 pb-2 pt-3.5">
        <h3 className="font-serif text-title font-medium text-text-primary">Finishes</h3>
        <p className="mt-0.5 text-xs text-text-tertiary">
          Spray finishes by square foot. Also available in the Finishing section of Materials for
          the estimator.
        </p>
      </header>

      {finishes.length > 0 &&
        (isMobile ? (
          <div className="space-y-2 px-3 pb-2">
            {finishes.map((f) => (
              <div key={f.id} className="rounded-xl bg-surface-muted/40 p-2.5">
                <div className="flex items-start gap-2">
                  <AutoText
                    value={f.name}
                    onChange={(v) => updateFinish(f.id, { name: v })}
                    placeholder="Finish name"
                    className="font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => removeFinish(f.id)}
                    aria-label="Remove finish"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-tertiary hover:bg-status-blocked-soft hover:text-status-blocked"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="rounded-lg bg-surface px-2.5 py-1.5">
                    <span className="block text-micro uppercase tracking-wider text-text-tertiary">
                      Coats
                    </span>
                    <NumCell
                      value={f.coats}
                      step="1"
                      onChange={(v) => updateFinish(f.id, { coats: v })}
                      className="text-left"
                    />
                  </label>
                  <label className="rounded-lg bg-surface px-2.5 py-1.5">
                    <span className="block text-micro uppercase tracking-wider text-text-tertiary">
                      $ / sqft
                    </span>
                    <NumCell
                      value={f.unitPrice}
                      onChange={(v) => updateFinish(f.id, { unitPrice: v })}
                      fmt={(v) => formatCAD(v)}
                      className="text-left"
                    />
                  </label>
                </div>
                <div className="mt-2">
                  <AutoText
                    value={f.notes ?? ""}
                    onChange={(v) => updateFinish(f.id, { notes: v })}
                    placeholder="Optional notes"
                    className="text-text-secondary"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left align-bottom text-label uppercase text-text-tertiary">
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="px-3 py-1.5 text-right font-medium">Coats</th>
                <th className="px-3 py-1.5 text-right font-medium">$ / sqft</th>
                <th className="px-3 py-1.5 font-medium">Notes</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {finishes.map((f) => (
                <FinishRow
                  key={f.id}
                  finish={f}
                  onChange={(p) => updateFinish(f.id, p)}
                  onRemove={() => removeFinish(f.id)}
                />
              ))}
            </tbody>
          </table>
        ))}

      <button
        type="button"
        onClick={() => addFinish({ name: "", coats: 2, unitPrice: 0 })}
        className="flex w-full items-center gap-2 border-t border-border-faint px-4 py-2.5 text-xs text-text-tertiary transition-colors duration-fast hover:bg-accent-soft/30 hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add finish
      </button>
    </section>
  );
}

function FinishRow({
  finish,
  onChange,
  onRemove,
}: {
  finish: Finish;
  onChange: (patch: Partial<Finish>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="group border-t border-border-faint align-top even:bg-surface-muted/20 hover:bg-surface-muted/40">
      <td className="max-w-[18rem] px-3 py-1.5">
        <AutoText
          value={finish.name}
          onChange={(v) => onChange({ name: v })}
          placeholder="Finish name"
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <NumCell value={finish.coats} step="1" onChange={(v) => onChange({ coats: v })} />
      </td>
      <td className="px-3 py-1.5 text-right">
        <NumCell
          value={finish.unitPrice}
          onChange={(v) => onChange({ unitPrice: v })}
          fmt={(v) => formatCAD(v)}
        />
        <div className="pr-2 text-right">
          <StaleChip iso={finish.priceUpdatedAt} />
        </div>
      </td>
      <td className="max-w-[16rem] px-3 py-1.5">
        <AutoText
          value={finish.notes ?? ""}
          onChange={(v) => onChange({ notes: v })}
          placeholder="Optional"
          className="text-text-secondary"
        />
      </td>
      <td className="px-2 py-1.5 align-middle">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${finish.name || "finish"}`}
          className="grid h-8 w-8 place-items-center rounded-md text-text-tertiary opacity-0 transition-all duration-fast hover:bg-status-blocked-soft hover:text-status-blocked group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </td>
    </tr>
  );
}
