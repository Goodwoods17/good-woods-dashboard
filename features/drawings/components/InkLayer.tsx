"use client";

import { useRef, useState, useEffect } from "react";
import type { Annotation, AnnotationType, StrokeData } from "@shared/lib/types";
import { strokePathData, PEN_SIZE, HIGHLIGHTER_SIZE } from "../lib/strokes";
import { normalizePoint } from "../lib/geometry";

type Tool = "pan" | "pin" | "pen" | "highlighter" | "eraser";

/**
 * SVG overlay that renders ink/highlight annotations as filled `<path>`s and,
 * when a draw tool is active, captures a live stroke (normalized 0–1 points)
 * and commits it on pointer-up. Eraser mode makes paths tappable to delete.
 * Denormalizes by the layer's own layout size (constant under CSS-transform
 * zoom), so strokes stay crisp without recompute on zoom.
 */
export function InkLayer({
  annotations, activeTool, penColor, highlighterColor, onCommit, onErase,
}: {
  annotations: Annotation[];
  activeTool: Tool;
  penColor: string;
  highlighterColor: string;
  onCommit: (s: { type: AnnotationType; color: string; size: number; data: StrokeData }) => void;
  onErase: (a: Annotation) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [live, setLive] = useState<[number, number, number][] | null>(null);
  const drawing = activeTool === "pen" || activeTool === "highlighter";

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  function pt(e: React.PointerEvent): [number, number, number] {
    const r = ref.current!.getBoundingClientRect();
    const { x, y } = normalizePoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    return [x, y, e.pressure || 0.5];
  }

  function onDown(e: React.PointerEvent) {
    if (!drawing) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setLive([pt(e)]);
  }
  function onMove(e: React.PointerEvent) {
    if (!drawing || !live) return;
    setLive((cur) => (cur ? [...cur, pt(e)] : cur));
  }
  function onUp() {
    if (!drawing || !live) return;
    if (live.length > 1) {
      const type: AnnotationType = activeTool === "highlighter" ? "highlight" : "ink";
      onCommit({
        type,
        color: type === "highlight" ? highlighterColor : penColor,
        size: type === "highlight" ? HIGHLIGHTER_SIZE : PEN_SIZE,
        data: { points: live },
      });
    }
    setLive(null);
  }

  return (
    <svg ref={ref}
      className={drawing ? "absolute inset-0 h-full w-full touch-none" : "absolute inset-0 h-full w-full"}
      style={{ pointerEvents: activeTool === "pan" || activeTool === "pin" ? "none" : "auto" }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      {annotations.filter((a) => a.type === "ink" || a.type === "highlight").map((a) => (
        <path key={a.id}
          d={strokePathData((a.data as StrokeData).points, size.w, size.h, a.type, a.strokeWidth ?? (a.type === "highlight" ? HIGHLIGHTER_SIZE : PEN_SIZE))}
          fill={a.color} fillOpacity={a.type === "highlight" ? 0.35 : 1}
          style={{ pointerEvents: activeTool === "eraser" ? "auto" : "none", cursor: activeTool === "eraser" ? "pointer" : "default" }}
          onPointerDown={activeTool === "eraser" ? (e) => { e.stopPropagation(); onErase(a); } : undefined} />
      ))}
      {live && live.length > 1 && (
        <path
          d={strokePathData(live, size.w, size.h, activeTool === "highlighter" ? "highlight" : "ink",
            activeTool === "highlighter" ? HIGHLIGHTER_SIZE : PEN_SIZE)}
          fill={activeTool === "highlighter" ? highlighterColor : penColor}
          fillOpacity={activeTool === "highlighter" ? 0.35 : 1} style={{ pointerEvents: "none" }} />
      )}
    </svg>
  );
}
