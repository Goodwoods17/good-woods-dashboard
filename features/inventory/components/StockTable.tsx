"use client";

import { Pencil, Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { useIsMobile } from "@shared/lib/useIsMobile";
import { isLow, type StockEntry, type NewStockEntry } from "@features/inventory/lib/inventoryStore";

type Props = {
  stock: StockEntry[];
  onUpdate: (id: string, patch: Partial<NewStockEntry>) => void;
  onEdit: (entry: StockEntry) => void;
  onRemove: (id: string) => void;
};

/** Full stock register: a table on desktop/tablet, stacked cards on phone. */
export function StockRegister(props: Props) {
  const isMobile = useIsMobile();
  if (props.stock.length === 0) return null;
  return isMobile ? <Cards {...props} /> : <DeskTable {...props} />;
}

const NUM =
  "w-16 rounded-md bg-transparent px-2 py-1 text-right text-sm tabular-nums transition-colors duration-fast hover:bg-surface-muted focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft";

function DeskTable({ stock, onUpdate, onEdit, onRemove }: Props) {
  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-resting">
      <div className="px-4 py-3 text-label font-medium uppercase text-text-tertiary">All stock</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-label uppercase text-text-tertiary">
            <th className="px-4 py-1.5 text-left font-medium">Material</th>
            <th className="px-2 py-1.5 text-right font-medium">On hand</th>
            <th className="px-2 py-1.5 text-right font-medium">Reorder</th>
            <th className="px-2 py-1.5 text-left font-medium">Unit</th>
            <th className="px-2 py-1.5 text-right font-medium">Value</th>
            <th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {stock.map((s) => (
            <tr
              key={s.id}
              className="group border-t border-border-faint transition-colors duration-fast hover:bg-surface-muted/30"
            >
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      isLow(s) ? "bg-status-at-risk" : "bg-status-on-track"
                    )}
                  />
                  <span className="truncate text-text-primary">{s.materialName}</span>
                  {s.reorderedAt && (
                    <span className="shrink-0 rounded-full bg-surface-muted px-1.5 font-mono text-micro uppercase tracking-wider text-text-tertiary">
                      on order
                    </span>
                  )}
                </div>
              </td>
              <td className="px-2 py-2 text-right">
                <input
                  type="number"
                  value={s.qtyOnHand}
                  onChange={(e) => onUpdate(s.id, { qtyOnHand: Number(e.target.value) || 0 })}
                  aria-label={`On hand for ${s.materialName}`}
                  className={cn(NUM, isLow(s) && "font-medium text-status-at-risk")}
                />
              </td>
              <td className="px-2 py-2 text-right">
                <input
                  type="number"
                  value={s.reorderPoint}
                  onChange={(e) => onUpdate(s.id, { reorderPoint: Number(e.target.value) || 0 })}
                  aria-label={`Reorder point for ${s.materialName}`}
                  className={cn(NUM, "text-text-secondary")}
                />
              </td>
              <td className="px-2 py-2 text-text-secondary">{s.unit}</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-text-secondary">
                {formatCAD(s.unitValue * s.qtyOnHand)}
              </td>
              <td className="px-2 py-2">
                <div className="flex justify-end gap-0.5 opacity-0 transition-opacity duration-fast group-hover:opacity-100">
                  <IconBtn label="Edit" onClick={() => onEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  </IconBtn>
                  <IconBtn label="Remove" danger onClick={() => onRemove(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </IconBtn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Cards({ stock, onUpdate, onEdit, onRemove }: Props) {
  return (
    <div className="space-y-2">
      <div className="px-1 text-label font-medium uppercase text-text-tertiary">All stock</div>
      {stock.map((s) => (
        <div key={s.id} className="rounded-2xl bg-surface p-3 shadow-resting">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                isLow(s) ? "bg-status-at-risk" : "bg-status-on-track"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">{s.materialName}</p>
              <p className="font-mono text-xs tabular-nums text-text-tertiary">
                {formatCAD(s.unitValue * s.qtyOnHand)} · {s.unit}
                {s.reorderedAt ? " · on order" : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-0.5">
              <IconBtn label="Edit" onClick={() => onEdit(s)}>
                <Pencil className="h-4 w-4" strokeWidth={2} />
              </IconBtn>
              <IconBtn label="Remove" danger onClick={() => onRemove(s.id)}>
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </IconBtn>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="rounded-lg bg-surface-muted/60 px-3 py-2">
              <span className="block text-micro uppercase tracking-wider text-text-tertiary">
                On hand
              </span>
              <input
                type="number"
                value={s.qtyOnHand}
                onChange={(e) => onUpdate(s.id, { qtyOnHand: Number(e.target.value) || 0 })}
                className={cn(
                  "w-full bg-transparent text-lg tabular-nums focus:outline-none",
                  isLow(s) ? "text-status-at-risk" : "text-text-primary"
                )}
              />
            </label>
            <label className="rounded-lg bg-surface-muted/60 px-3 py-2">
              <span className="block text-micro uppercase tracking-wider text-text-tertiary">
                Reorder at
              </span>
              <input
                type="number"
                value={s.reorderPoint}
                onChange={(e) => onUpdate(s.id, { reorderPoint: Number(e.target.value) || 0 })}
                className="w-full bg-transparent text-lg tabular-nums text-text-secondary focus:outline-none"
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-surface-muted",
        danger && "hover:bg-status-blocked-soft hover:text-status-blocked"
      )}
    >
      {children}
    </button>
  );
}
