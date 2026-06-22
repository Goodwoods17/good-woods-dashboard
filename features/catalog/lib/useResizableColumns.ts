"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ColumnDef = {
  key: string;
  label: string;
  width: number; // default width in px
  min: number;
  align?: "right" | "center";
  grow?: boolean; // absorbs slack; never gets a resize handle of its own use
};

type Widths = Record<string, number>;

/**
 * Drag-to-resize column widths, persisted to localStorage so a width set once
 * sticks across visits and is shared by every section table on the page (resize
 * "Notes" once, every section's Notes column follows). Pairs with
 * `table-fixed`: the widths are authoritative and text wraps within them.
 */
export function useResizableColumns(storageKey: string, columns: ColumnDef[]) {
  const defaults = useMemo(() => {
    const out: Widths = {};
    for (const c of columns) out[c.key] = c.width;
    return out;
  }, [columns]);

  const minOf = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of columns) out[c.key] = c.min;
    return out;
  }, [columns]);

  const [widths, setWidths] = useState<Widths>(defaults);

  // Only persist once the user has actually dragged a handle. Saving on mount
  // would pin everyone to whatever defaults shipped first, so later default
  // tweaks could never reach people who never customized.
  const touched = useRef(false);

  // Hydrate persisted widths over the defaults (new columns keep their default).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Widths;
      setWidths((prev) => ({ ...prev, ...saved }));
    } catch {
      /* ignore malformed cache */
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !touched.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [storageKey, widths]);

  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const onResizeStart = useCallback(
    (key: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      touched.current = true;
      const startW = widths[key] ?? defaults[key];
      drag.current = { key, startX: e.clientX, startW };
      const min = minOf[key] ?? 48;

      const move = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const next = Math.max(min, d.startW + (ev.clientX - d.startX));
        setWidths((w) => (w[key] === next ? w : { ...w, [key]: next }));
      };
      const up = () => {
        drag.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [widths, defaults, minOf]
  );

  const reset = useCallback(() => setWidths(defaults), [defaults]);

  return { widths, onResizeStart, reset };
}
