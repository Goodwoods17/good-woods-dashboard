"use client";

import { Hand, MapPin, Pen, Highlighter, Eraser, Undo2, Redo2 } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { PEN_COLORS, HIGHLIGHTER_COLORS } from "../lib/strokes";

export type Tool = "pan" | "pin" | "pen" | "highlighter" | "eraser";

const TOOLS: { tool: Tool; label: string; Icon: typeof Hand }[] = [
  { tool: "pan", label: "Pan", Icon: Hand },
  { tool: "pin", label: "Add pin", Icon: MapPin },
  { tool: "pen", label: "Pen", Icon: Pen },
  { tool: "highlighter", label: "Highlighter", Icon: Highlighter },
  { tool: "eraser", label: "Eraser", Icon: Eraser },
];

function ToolButton({
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
  canUndo, canRedo, onUndo, onRedo,
}: {
  activeTool: Tool;
  onTool: (t: Tool) => void;
  canPin: boolean;
  penColor: string;
  onPenColor: (c: string) => void;
  highlighterColor: string;
  onHighlighterColor: (c: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const tools = canPin ? TOOLS : TOOLS.filter((t) => t.tool !== "pin");
  const swatches =
    activeTool === "pen"
      ? { colors: PEN_COLORS as readonly string[], value: penColor, set: onPenColor }
      : activeTool === "highlighter"
      ? { colors: HIGHLIGHTER_COLORS as readonly string[], value: highlighterColor, set: onHighlighterColor }
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
        {tools.map(({ tool, label, Icon }) => (
          <ToolButton key={tool} active={activeTool === tool} label={label} onClick={() => onTool(tool)}>
            <Icon className="h-4 w-4" />
          </ToolButton>
        ))}
      </div>

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

      <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
        <ToolButton label="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </ToolButton>
      </div>
    </div>
  );
}
