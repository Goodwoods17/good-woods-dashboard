"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { visibleAttrs, setAttr, removeAttr } from "@features/catalog/lib/attributes";
import type { CatalogKind } from "@features/catalog/lib/catalogStore";

/**
 * Module-scoped so React identity is stable across re-renders — nesting a
 * stateful component definition inside the parent causes stale-identity
 * remounts on every render.
 */
function Row({
  attrKey,
  attrValue,
  attributes,
  onChange,
}: {
  attrKey: string;
  attrValue: string;
  attributes: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [local, setLocal] = useState(attrValue);

  const commit = (v: string) => {
    onChange(setAttr(attributes, attrKey, v));
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 truncate font-mono text-xs text-text-secondary">
        {attrKey}
      </span>
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft"
      />
      <button
        type="button"
        aria-label={`Remove ${attrKey}`}
        onClick={() => onChange(removeAttr(attributes, attrKey))}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-tertiary transition-colors duration-fast hover:text-status-blocked"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

export function AttributesEditor({
  attributes,
  kind,
  onChange,
}: {
  attributes: Record<string, unknown>;
  kind: CatalogKind;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [addKey, setAddKey] = useState("");
  const [addValue, setAddValue] = useState("");

  const rows = visibleAttrs(attributes, kind);

  const handleAdd = () => {
    const k = addKey.trim();
    if (!k) return;
    onChange(setAttr(attributes, k, addValue));
    setAddKey("");
    setAddValue("");
  };

  return (
    <div className="space-y-2">
      <p className="text-label uppercase text-text-tertiary">Attributes</p>

      {rows.length === 0 && (
        <p className="text-xs text-text-tertiary">No attributes yet</p>
      )}

      {rows.map(([key, value]) => (
        <Row
          key={key}
          attrKey={key}
          attrValue={value}
          attributes={attributes}
          onChange={onChange}
        />
      ))}

      {/* Add row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={addKey}
          onChange={(e) => setAddKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="attribute"
          className="w-32 shrink-0 rounded-md bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        <input
          type="text"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="value"
          className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="h-8 shrink-0 rounded-md px-3 text-sm text-text-secondary transition-colors duration-fast hover:text-accent"
        >
          Add
        </button>
      </div>
    </div>
  );
}
