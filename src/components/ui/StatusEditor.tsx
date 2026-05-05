"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusOption<T extends string> = {
  value: T;
  label: string;
};

export function StatusEditor<T extends string>({
  value,
  options,
  onChange,
  trigger,
}: {
  value: T;
  options: StatusOption<T>[];
  onChange: (next: T) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 group"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {trigger}
        <ChevronDown
          className={cn(
            "h-3 w-3 text-text-tertiary transition-transform duration-fast",
            "opacity-0 group-hover:opacity-100",
            open && "opacity-100 rotate-180"
          )}
          strokeWidth={2}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute top-full left-0 mt-1.5 z-30 min-w-[180px] bg-surface border border-border-strong rounded-md shadow-md overflow-hidden py-1"
        >
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors duration-fast",
                  opt.value === value
                    ? "text-accent bg-accent-soft/40"
                    : "text-text-primary hover:bg-surface-muted"
                )}
              >
                {opt.value === value ? (
                  <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
                ) : (
                  <span className="h-3.5 w-3.5" />
                )}
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
