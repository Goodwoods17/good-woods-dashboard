"use client";

import { useRef, useState, useEffect } from "react";
import type {
  Annotation, AnnotationType, StrokeData, ShapeData, TextData, ShapeKind,
} from "@shared/lib/types";
import { strokePathData, PEN_SIZE, HIGHLIGHTER_SIZE } from "../lib/strokes";
import { arrowHead, normRect, shapeBounds, textBounds, hitTestShape, boxContains } from "../lib/shapes";
import { normalizePoint } from "../lib/geometry";
import type { Tool } from "./MarkupToolbar";

const SHAPE_WIDTH = 3;
const ARROW_HEAD = 16;
const HIT_TOL = 8;
const HANDLE = 11; // px square handle
const TEXT_HALO = "#FBFAF7";
const SELECT_STROKE = "#547DAB";

type Handle = { id: number; x: number; y: number }; // pixel positions
type Drag =
  | { mode: "move"; before: Annotation; startX: number; startY: number }
  | { mode: "resize"; before: Annotation; handle: number; startX: number; startY: number };

function isStroke(a: Annotation): a is Annotation & { data: StrokeData } {
  return a.type === "ink" || a.type === "highlight";
}
function isShape(a: Annotation): a is Annotation & { data: ShapeData } {
  return a.type === "shape";
}
function isText(a: Annotation): a is Annotation & { data: TextData } {
  return a.type === "text";
}

/** Translate a shape/text annotation by a normalized delta. */
function translate(a: Annotation, dnx: number, dny: number): Annotation {
  if (isShape(a)) {
    const d = a.data;
    return { ...a, data: { ...d, x1: d.x1 + dnx, y1: d.y1 + dny, x2: d.x2 + dnx, y2: d.y2 + dny } };
  }
  if (isText(a)) {
    return { ...a, data: { ...a.data, x: a.data.x + dnx, y: a.data.y + dny } };
  }
  return a;
}

/** Handle pixel positions for a selected shape/text. */
function handlesFor(a: Annotation, w: number, h: number): Handle[] {
  if (isShape(a)) {
    const d = a.data;
    if (d.shape === "rect") {
      return [
        { id: 0, x: d.x1 * w, y: d.y1 * h },
        { id: 1, x: d.x2 * w, y: d.y1 * h },
        { id: 2, x: d.x1 * w, y: d.y2 * h },
        { id: 3, x: d.x2 * w, y: d.y2 * h },
      ];
    }
    return [
      { id: 0, x: d.x1 * w, y: d.y1 * h },
      { id: 1, x: d.x2 * w, y: d.y2 * h },
    ];
  }
  if (isText(a)) {
    const b = textBounds(a.data, w, h);
    return [{ id: 0, x: b.x + b.w, y: b.y + b.h }];
  }
  return [];
}

/** Apply a resize-handle drag (pointer at normalized nx,ny) to a shape/text. */
function resize(a: Annotation, handle: number, nx: number, ny: number, height: number): Annotation {
  if (isShape(a)) {
    const d = { ...a.data };
    if (d.shape === "rect") {
      if (handle === 0) { d.x1 = nx; d.y1 = ny; }
      else if (handle === 1) { d.x2 = nx; d.y1 = ny; }
      else if (handle === 2) { d.x1 = nx; d.y2 = ny; }
      else { d.x2 = nx; d.y2 = ny; }
    } else {
      if (handle === 0) { d.x1 = nx; d.y1 = ny; } else { d.x2 = nx; d.y2 = ny; }
    }
    return { ...a, data: d };
  }
  if (isText(a)) {
    const newFontPx = Math.max(8, ny * height - a.data.y * height);
    return { ...a, data: { ...a.data, fontSize: newFontPx / height } };
  }
  return a;
}

/**
 * SVG overlay rendering every annotation type and driving every markup tool:
 * ink/highlight draw, shape drag, text place/edit, select→move/resize, tap-erase.
 * Normalized 0–1 coords; denormalized by the layer's own (zoom-constant) layout
 * size. Selection/move/resize edits a local preview, committing once per gesture.
 */
export function MarkupLayer({
  annotations, activeTool, penColor, highlighterColor, shapeKind,
  selectedId, onSelect, onCommit, onCommitShape, onErase, onUpdate, onRequestText, onEditText,
}: {
  annotations: Annotation[];
  activeTool: Tool;
  penColor: string;
  highlighterColor: string;
  shapeKind: ShapeKind;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (s: { type: AnnotationType; color: string; size: number; data: StrokeData }) => void;
  onCommitShape: (s: { color: string; size: number; data: ShapeData }) => void;
  onErase: (a: Annotation) => void;
  onUpdate: (before: Annotation, after: Annotation) => void;
  onRequestText: (x: number, y: number) => void;
  onEditText: (a: Annotation) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [live, setLive] = useState<[number, number, number][] | null>(null);
  const [shapeDraft, setShapeDraft] = useState<ShapeData | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<Annotation | null>(null);

  const inking = activeTool === "pen" || activeTool === "highlighter";
  const interactive = activeTool !== "pan" && activeTool !== "pin";

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  function np(e: React.PointerEvent): { x: number; y: number } {
    const r = ref.current!.getBoundingClientRect();
    return normalizePoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  }
  function px(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (activeTool !== "select") return;
    const p = px(e);
    const hit = [...annotations].reverse().find(
      (a) => isText(a) && boxContains(textBounds(a.data, size.w, size.h), p.x, p.y, HIT_TOL)
    );
    if (hit) onEditText(hit);
  }

  function startHandleDrag(e: React.PointerEvent, a: Annotation, handle: number) {
    e.stopPropagation();
    ref.current?.setPointerCapture?.(e.pointerId);
    const p = np(e);
    setDrag({ mode: "resize", before: a, handle, startX: p.x, startY: p.y });
    setPreview(a);
  }

  function onDown(e: React.PointerEvent) {
    if (activeTool === "pen" || activeTool === "highlighter") {
      ref.current?.setPointerCapture?.(e.pointerId);
      const p = np(e); setLive([[p.x, p.y, e.pressure || 0.5]]);
      return;
    }
    if (activeTool === "shape") {
      ref.current?.setPointerCapture?.(e.pointerId);
      const p = np(e); setShapeDraft({ shape: shapeKind, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    if (activeTool === "text") {
      const p = np(e); onRequestText(p.x, p.y);
      return;
    }
    if (activeTool === "eraser") {
      // ink/highlight self-erase per-element; this catches thin shapes + text.
      const p = px(e);
      const hit = [...annotations].reverse().find(
        (a) =>
          (isShape(a) && hitTestShape(a.data, p.x, p.y, size.w, size.h, HIT_TOL)) ||
          (isText(a) && boxContains(textBounds(a.data, size.w, size.h), p.x, p.y, HIT_TOL))
      );
      if (hit) onErase(hit);
      return;
    }
    if (activeTool === "select") {
      const p = px(e);
      // topmost shape/text under the pointer
      const hit = [...annotations].reverse().find((a) =>
        (isShape(a) && hitTestShape(a.data, p.x, p.y, size.w, size.h, HIT_TOL)) ||
        (isText(a) && boxContains(textBounds(a.data, size.w, size.h), p.x, p.y, HIT_TOL))
      );
      if (!hit) { onSelect(null); return; }
      onSelect(hit.id);
      ref.current?.setPointerCapture?.(e.pointerId);
      const n = np(e);
      setDrag({ mode: "move", before: hit, startX: n.x, startY: n.y });
      setPreview(hit);
    }
  }

  function onMove(e: React.PointerEvent) {
    if (live) { const p = np(e); setLive((c) => (c ? [...c, [p.x, p.y, e.pressure || 0.5]] : c)); return; }
    if (shapeDraft) { const p = np(e); setShapeDraft((s) => (s ? { ...s, x2: p.x, y2: p.y } : s)); return; }
    if (drag) {
      const n = np(e);
      if (drag.mode === "move") {
        setPreview(translate(drag.before, n.x - drag.startX, n.y - drag.startY));
      } else {
        setPreview(resize(drag.before, drag.handle, n.x, n.y, size.h));
      }
    }
  }

  function onUp() {
    if (live) {
      if (live.length > 1) {
        const type: AnnotationType = activeTool === "highlighter" ? "highlight" : "ink";
        onCommit({
          type,
          color: type === "highlight" ? highlighterColor : penColor,
          size: type === "highlight" ? HIGHLIGHTER_SIZE : PEN_SIZE,
          data: { points: live },
        });
      }
      setLive(null); return;
    }
    if (shapeDraft) {
      const moved = Math.abs(shapeDraft.x2 - shapeDraft.x1) > 0.005 || Math.abs(shapeDraft.y2 - shapeDraft.y1) > 0.005;
      if (moved) onCommitShape({ color: penColor, size: SHAPE_WIDTH, data: shapeDraft });
      setShapeDraft(null); return;
    }
    if (drag && preview) {
      const changed = JSON.stringify(drag.before.data) !== JSON.stringify(preview.data);
      if (changed) onUpdate(drag.before, preview);
      setDrag(null); setPreview(null);
    }
  }

  function renderAnnotation(a: Annotation) {
    // Ink/highlight are filled → easy to tap-erase per-element. Shapes/text are
    // thin/small → erased via the SVG's tolerant hit-test in onDown instead.
    const inkErase = activeTool === "eraser"
      ? {
          style: { pointerEvents: "auto" as const, cursor: "pointer" },
          onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); onErase(a); },
        }
      : { style: { pointerEvents: "none" as const } };
    const passive = { style: { pointerEvents: "none" as const } };

    if (isStroke(a)) {
      return (
        <path key={a.id}
          d={strokePathData(a.data.points, size.w, size.h, a.type, a.strokeWidth ?? (a.type === "highlight" ? HIGHLIGHTER_SIZE : PEN_SIZE))}
          fill={a.color} fillOpacity={a.type === "highlight" ? 0.35 : 1} {...inkErase} />
      );
    }
    if (isShape(a)) {
      const d = a.data;
      const sw = a.strokeWidth ?? SHAPE_WIDTH;
      if (d.shape === "rect") {
        const r = normRect(d);
        return (
          <rect key={a.id} x={r.x * size.w} y={r.y * size.h} width={r.w * size.w} height={r.h * size.h}
            fill="transparent" stroke={a.color} strokeWidth={sw} {...passive} />
        );
      }
      const x1 = d.x1 * size.w, y1 = d.y1 * size.h, x2 = d.x2 * size.w, y2 = d.y2 * size.h;
      return (
        <g key={a.id} {...passive}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={a.color} strokeWidth={sw} strokeLinecap="round" />
          {d.shape === "arrow" && (
            <polygon points={arrowHead(d.x1, d.y1, d.x2, d.y2, ARROW_HEAD, size.w, size.h).map((p) => p.join(",")).join(" ")}
              fill={a.color} />
          )}
        </g>
      );
    }
    if (!isText(a)) return null;
    const t = a.data;
    return (
      <text key={a.id} x={t.x * size.w} y={t.y * size.h} dominantBaseline="hanging"
        fontSize={t.fontSize * size.h} fill={a.color}
        style={{ paintOrder: "stroke", stroke: TEXT_HALO, strokeWidth: 3, fontWeight: 600, pointerEvents: "none" }}>
        {t.text}
      </text>
    );
  }

  const selected = selectedId ? (preview?.id === selectedId ? preview : annotations.find((a) => a.id === selectedId)) : null;
  const showSelection = activeTool === "select" && selected && (isShape(selected) || isText(selected));

  // Render dragged annotation from preview, others from store.
  const renderList = annotations.map((a) => (preview && a.id === preview.id ? preview : a));

  return (
    <svg ref={ref}
      className={interactive ? "absolute inset-0 h-full w-full touch-none" : "absolute inset-0 h-full w-full"}
      style={{ pointerEvents: interactive ? "auto" : "none", cursor: activeTool === "select" ? "default" : undefined }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      onDoubleClick={onDoubleClick}>
      {renderList.map(renderAnnotation)}

      {/* live ink */}
      {live && live.length > 1 && (
        <path d={strokePathData(live, size.w, size.h, activeTool === "highlighter" ? "highlight" : "ink",
            activeTool === "highlighter" ? HIGHLIGHTER_SIZE : PEN_SIZE)}
          fill={activeTool === "highlighter" ? highlighterColor : penColor}
          fillOpacity={activeTool === "highlighter" ? 0.35 : 1} style={{ pointerEvents: "none" }} />
      )}

      {/* live shape draft */}
      {shapeDraft && renderAnnotation({
        id: "__draft__", documentId: "", projectId: "", page: 0, type: "shape",
        data: shapeDraft, color: penColor, strokeWidth: SHAPE_WIDTH, createdAt: "", updatedAt: "",
      } as Annotation)}

      {/* selection box + handles */}
      {showSelection && selected && (() => {
        const b = isShape(selected) ? shapeBounds(selected.data, size.w, size.h) : textBounds(selected.data, size.w, size.h);
        return (
          <g pointerEvents="none">
            <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8}
              fill="none" stroke={SELECT_STROKE} strokeWidth={1} strokeDasharray="4 3" />
            {handlesFor(selected, size.w, size.h).map((hd) => (
              <rect key={hd.id} x={hd.x - HANDLE / 2} y={hd.y - HANDLE / 2} width={HANDLE} height={HANDLE}
                fill="#fff" stroke={SELECT_STROKE} strokeWidth={1.5} rx={2}
                style={{ pointerEvents: "auto", cursor: "nwse-resize" }}
                onPointerDown={(e) => startHandleDrag(e, selected, hd.id)} />
            ))}
          </g>
        );
      })()}
    </svg>
  );
}
