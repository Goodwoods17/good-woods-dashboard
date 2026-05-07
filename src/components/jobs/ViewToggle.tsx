"use client";

import { LayoutList, LayoutGrid } from "lucide-react";
import { cn } from "@shared/lib/utils";

export type JobsView = "list" | "kanban";

export function ViewToggle({
  view,
  onChange,
}: {
  view: JobsView;
  onChange: (v: JobsView) => void;
}) {
  return (
    <div className="inline-flex items-center bg-surface border border-border rounded-md p-0.5">
      <Btn
        active={view === "list"}
        onClick={() => onChange("list")}
        icon={<LayoutList className="h-3.5 w-3.5" strokeWidth={1.75} />}
        label="List"
      />
      <Btn
        active={view === "kanban"}
        onClick={() => onChange("kanban")}
        icon={<LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />}
        label="Kanban"
      />
    </div>
  );
}

function Btn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors duration-fast",
        active
          ? "bg-accent-soft text-accent"
          : "text-text-secondary hover:text-text-primary"
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}
