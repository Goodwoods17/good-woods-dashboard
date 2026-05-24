"use client";

import { Flame, CalendarRange, LayoutList, LayoutGrid, type LucideIcon } from "lucide-react";
import { cn } from "@shared/lib/utils";

export type JobsView = "hitlist" | "schedule" | "list" | "kanban";

const VIEWS: { key: JobsView; label: string; icon: LucideIcon }[] = [
  { key: "hitlist", label: "Hitlist", icon: Flame },
  { key: "schedule", label: "Schedule", icon: CalendarRange },
  { key: "list", label: "List", icon: LayoutList },
  { key: "kanban", label: "Kanban", icon: LayoutGrid },
];

export function ViewToggle({
  view,
  onChange,
}: {
  view: JobsView;
  onChange: (v: JobsView) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-surface/70 backdrop-blur-md rounded-full p-1 shadow-floating">
      {VIEWS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full transition-colors duration-fast",
            view === key
              ? "bg-ink-pill text-white"
              : "text-text-secondary hover:text-text-primary"
          )}
          aria-pressed={view === key}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );
}
