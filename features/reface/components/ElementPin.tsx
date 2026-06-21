"use client";

import { cn } from "@shared/lib/utils";
import type { ElementKind, RefaceElement } from "../lib/types";

/** Pin fill per kind, so doors/drawers/panels/kicks read apart at a glance. */
export const KIND_PIN_COLOR: Record<ElementKind, string> = {
  door: "bg-accent",
  drawer: "bg-status-on-track",
  end_panel: "bg-status-paused",
  toe_kick: "bg-status-at-risk",
};

/**
 * One numbered marker on the photo, placed at the center of the element's
 * normalized box. AI guesses render dashed + dimmed until confirmed.
 */
export function ElementPin({
  element,
  selected,
  onClick,
}: {
  element: RefaceElement;
  selected: boolean;
  onClick: () => void;
}) {
  if (!element.box) return null;
  const cx = (element.box.x + element.box.w / 2) * 100;
  const cy = (element.box.y + element.box.h / 2) * 100;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ left: `${cx}%`, top: `${cy}%` }}
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center",
        "h-7 min-w-7 px-1.5 rounded-full text-xs font-semibold text-white shadow-floating",
        "transition-transform duration-fast hover:scale-110",
        KIND_PIN_COLOR[element.kind],
        element.aiGuess && "border-2 border-dashed border-white/90 opacity-90",
        selected ? "ring-2 ring-white scale-110 z-10" : "ring-1 ring-white/70"
      )}
      title={`${element.label}${element.location ? ` — ${element.location}` : ""}`}
      aria-label={`${element.label}${element.aiGuess ? " (unconfirmed)" : ""}`}
    >
      {element.label}
    </button>
  );
}
