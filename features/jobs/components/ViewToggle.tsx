"use client";

import {
  Flame,
  CalendarRange,
  LayoutList,
  LayoutGrid,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@shared/lib/utils";

export type JobsView = "hitlist" | "schedule" | "list" | "kanban" | "fever";

const ALL_VIEW_META: { key: JobsView; label: string; icon: LucideIcon }[] = [
  { key: "hitlist", label: "Hitlist", icon: Flame },
  { key: "schedule", label: "Schedule", icon: CalendarRange },
  { key: "list", label: "List", icon: LayoutList },
  { key: "kanban", label: "Kanban", icon: LayoutGrid },
  { key: "fever", label: "Fever board", icon: Thermometer },
];

/** Standard views (no fever board) — shown unless caller opts into scheduling views. */
const DEFAULT_VIEWS: JobsView[] = ["hitlist", "schedule", "list", "kanban"];

export function ViewToggle({
  view,
  onChange,
  views = DEFAULT_VIEWS,
}: {
  view: JobsView;
  onChange: (v: JobsView) => void;
  /** Which views to show. Defaults to the standard 4 (no fever board). */
  views?: JobsView[];
}) {
  const visibleMeta = ALL_VIEW_META.filter((m) => views.includes(m.key));
  return (
    <div className="inline-flex items-center gap-0.5 bg-white/60 backdrop-blur-md rounded-full p-1 shadow-floating">
      {visibleMeta.map(({ key, label, icon: Icon }) => (
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
