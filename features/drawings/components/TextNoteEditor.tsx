"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/utils";

/**
 * Small floating editor for a text note's words. Placement of the note on the
 * drawing is already decided (the tap point); this only collects/edits the
 * text. Enter saves, Escape cancels, autofocus on open.
 */
export function TextNoteEditor({
  initialValue, onSave, onCancel,
}: {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center bg-black/10 p-6"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="mt-12 w-80 max-w-full rounded-2xl border border-border bg-surface p-4 shadow-floating">
        <label htmlFor="text-note" className="mb-1.5 block text-micro uppercase tracking-wider text-text-tertiary">
          Text note
        </label>
        <input id="text-note" ref={inputRef} type="text" value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onSave(value); }
            else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          }}
          placeholder="e.g. scribe to wall ¼″"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft" />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="inline-flex min-h-[44px] items-center rounded-full px-3 text-sm text-text-secondary duration-fast hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(value)}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-full bg-ink-pill px-4 text-sm font-medium text-white duration-fast hover:bg-accent-active focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            )}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
