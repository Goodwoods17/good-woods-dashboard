"use client";

import { useRef, type ReactNode } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { normalizePoint } from "../lib/geometry";

/**
 * Wraps a rendered drawing (PDF canvas / image) in a pinch/double-tap/drag
 * transform. In `addingPin` mode a tap on the content becomes a normalized
 * (0–1) `onPlace`. `overlay` (pins) renders in the same transformed content
 * box, so pins stay locked to the drawing through zoom + pan.
 */
export function DrawingStage({
  addingPin, onPlace, overlay, children,
}: {
  addingPin: boolean;
  onPlace: (x: number, y: number) => void;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  function handleCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (!addingPin) return;
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
      panning={{ disabled: addingPin }}
      pinch={{ step: 5 }}
      wheel={{ step: 0.2 }}
      minScale={1}
      maxScale={6}
    >
      <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full">
        <div ref={contentRef} className="relative w-full" onClick={handleCapture}>
          {children}
          <div className={addingPin ? "absolute inset-0 cursor-crosshair" : "pointer-events-none absolute inset-0"}>
            {overlay}
          </div>
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
}
