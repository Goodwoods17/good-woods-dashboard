"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@shared/lib/utils";

export function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}

export type FieldDef<T> = {
  key: keyof T;
  type: "text" | "number";
  align?: "right";
  fmt?: (v: unknown) => string;
};

export function CrudRow<T extends { id: string }>({
  row,
  fields,
  onChange,
  onRemove,
}: {
  row: T;
  fields: FieldDef<T>[];
  onChange: (patch: Partial<T>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="border-b border-border last:border-0 group hover:bg-surface-muted/30 transition-colors duration-fast">
      {fields.map((f) => (
        <td
          key={String(f.key)}
          className={cn(
            "px-2 py-1.5",
            f.align === "right" ? "text-right tabular-nums" : ""
          )}
        >
          <input
            type={f.type}
            value={String(row[f.key] ?? "")}
            onChange={(e) => {
              const raw = e.target.value;
              const v = f.type === "number" ? parseFloat(raw) || 0 : raw;
              onChange({ [f.key]: v } as Partial<T>);
            }}
            className={cn(
              "w-full bg-transparent border-0 px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary rounded",
              "focus:outline-none focus:bg-surface-muted",
              f.align === "right" && "text-right tabular-nums"
            )}
          />
        </td>
      ))}
      <td className="px-2 py-1.5">
        <button
          onClick={onRemove}
          className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
          aria-label="Remove row"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </td>
    </tr>
  );
}
