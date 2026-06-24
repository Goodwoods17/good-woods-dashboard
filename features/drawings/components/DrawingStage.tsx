"use client";

import { useRef, type ReactNode } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { normalizePoint } from "../lib/geometry";

/**
 * Wraps a rendered drawing (PDF canvas / image) in a pinch/double-tap/drag
 * transform. When `disablePan` is set (any non-pan markup tool active),
 * panning is off and the overlay receives pointer events — a tap becomes a
 * normalized (0–1) `onPlace` (the caller decides whether to act on it, e.g.
 * only in pin mode). `overlay` (pins + ink) renders in the same transformed
 * content box, so markup stays locked to the drawing through zoom + pan.
 */
export function DrawingStage({
  disablePan, onPlace, overlay, children,
}: {
  disablePan: boolean;
  onPlace: (x: number, y: number) => void;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  function handleCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (!disablePan) return;
    const el = contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect(); // post-transform box
    const { x, y } = normalizePoint(
      e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height
    );
    onPlace(x, y);
  }

  return (
    <TransformWrapper
      doubleClick={{ mode: "toggle", step: 0.7 }}
      panning={{ disabled: disablePan }}
      pinch={{ step: 5 }}
      wheel={{ step: 0.2 }}
      minScale={1}
      maxScale={6}
    >
      <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full">
        <div ref={contentRef} className="relative w-full" onClick={handleCapture}>
          {children}
          <div className={disablePan ? "absolute inset-0 cursor-crosshair" : "pointer-events-none absolute inset-0"}>
            {overlay}
          </div>
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
}
