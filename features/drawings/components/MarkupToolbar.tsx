"use client";

import {
  Hand, MapPin, Pen, Highlighter, Eraser, Shapes, Type, MousePointer2,
  MoveUpRight, Square, Minus, Trash2, Undo2, Redo2,
} from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { ShapeKind } from "@shared/lib/types";
import { PEN_COLORS, HIGHLIGHTER_COLORS } from "../lib/strokes";

export type Tool =
  | "pan" | "pin" | "pen" | "highlighter" | "shape" | "text" | "select" | "eraser";

const TOOLS: { tool: Tool; label: string; Icon: typeof Hand }[] = [
  { tool: "pan", label: "Pan", Icon: Hand },
  { tool: "pin", label: "Add pin", Icon: MapPin },
  { tool: "pen", label: "Pen", Icon: Pen },
  { tool: "highlighter", label: "Highlighter", Icon: Highlighter },
  { tool: "shape", label: "Shapes", Icon: Shapes },
  { tool: "text", label: "Text note", Icon: Type },
  { tool: "select", label: "Select", Icon: MousePointer2 },
  { tool: "eraser", label: "Eraser", Icon: Eraser },
];

const SHAPE_KINDS: { kind: ShapeKind; label: string; Icon: typeof Hand }[] = [
  { kind: "arrow", label: "Arrow", Icon: MoveUpRight },
  { kind: "rect", label: "Rectangle", Icon: Square },
  { kind: "line", label: "Line", Icon: Minus },
];

function IconButton({
  active, label, onClick, children, disabled,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      aria-label={label} title={label}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-40",
        active ? "bg-ink-pill text-white" : "text-text-secondary hover:bg-surface-muted"
      )}>
      {children}
    </button>
  );
}

export function MarkupToolbar({
  activeTool, onTool, canPin,
  penColor, onPenColor, highlighterColor, onHighlighterColor,
  shapeKind, onShapeKind,
  selectionActive, onDeleteSelection,
  canUndo, canRedo, onUndo, onRedo,
}: {
  activeTool: Tool;
  onTool: (t: Tool) => void;
  canPin: boolean;
  penColor: string;
  onPenColor: (c: string) => void;
  highlighterColor: string;
  onHighlighterColor: (c: string) => void;
  shapeKind: ShapeKind;
  onShapeKind: (k: ShapeKind) => void;
  selectionActive: boolean;
  onDeleteSelection: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const tools = canPin ? TOOLS : TOOLS.filter((t) => t.tool !== "pin");
  // Pen/highlighter/shape/text all draw in a color → show the matching palette.
  const swatches =
    activeTool === "highlighter"
      ? { colors: HIGHLIGHTER_COLORS as readonly string[], value: highlighterColor, set: onHighlighterColor }
      : activeTool === "pen" || activeTool === "shape" || activeTool === "text"
      ? { colors: PEN_COLORS as readonly string[], value: penColor, set: onPenColor }
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
        {tools.map(({ tool, label, Icon }) => (
          <IconButton key={tool} active={activeTool === tool} label={label} onClick={() => onTool(tool)}>
            <Icon className="h-4 w-4" />
          </IconButton>
        ))}
      </div>

      {activeTool === "shape" && (
        <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
          {SHAPE_KINDS.map(({ kind, label, Icon }) => (
            <IconButton key={kind} active={shapeKind === kind} label={label} onClick={() => onShapeKind(kind)}>
              <Icon className="h-4 w-4" />
            </IconButton>
          ))}
        </div>
      )}

      {swatches && (
        <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
          {swatches.colors.map((c) => {
            const selected = swatches.value === c;
            return (
              <button key={c} type="button" onClick={() => swatches.set(c)}
                aria-label={`Color ${c}`} aria-pressed={selected} title={c}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft">
                <span
                  className={cn(
                    "h-6 w-6 rounded-full duration-fast",
                    selected ? "ring-2 ring-offset-2 ring-offset-surface ring-ink-pill" : "ring-1 ring-border"
                  )}
                  style={{ background: c }} />
              </button>
            );
          })}
        </div>
      )}

      {selectionActive && (
        <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
          <IconButton label="Delete selected" onClick={onDeleteSelection}>
            <Trash2 className="h-4 w-4 text-status-blocked" />
          </IconButton>
        </div>
      )}

      <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
        <IconButton label="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}
