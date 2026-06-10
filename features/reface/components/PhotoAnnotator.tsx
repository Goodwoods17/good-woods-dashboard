"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ImageOff } from "lucide-react";
import { resolvePhotoUrl } from "../lib/storage";
import {
  ELEMENT_KIND_LABELS,
  ELEMENT_KINDS,
  type ElementBox,
  type ElementKind,
  type RefacePhoto,
} from "../lib/types";
import { KIND_PIN_COLOR, ElementPin } from "./ElementPin";
import { cn } from "@shared/lib/utils";

/** Footprint (fraction of image) given to a freshly tapped pin. */
const NEW_PIN_SIZE = 0.06;

/**
 * The core surface: a photo with absolutely-positioned numbered pins. Tap empty
 * space to drop a new pin of the active kind; tap a pin to select it for editing.
 */
export function PhotoAnnotator({
  photo,
  activeKind,
  onActiveKindChange,
  selectedElementId,
  onSelectElement,
  onAddPin,
}: {
  photo: RefacePhoto;
  activeKind: ElementKind;
  onActiveKindChange: (kind: ElementKind) => void;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onAddPin: (kind: ElementKind, box: ElementBox) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const imgWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    resolvePhotoUrl(photo.storagePath)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [photo.storagePath]);

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const wrap = imgWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const box: ElementBox = {
      x: Math.max(0, Math.min(1 - NEW_PIN_SIZE, x - NEW_PIN_SIZE / 2)),
      y: Math.max(0, Math.min(1 - NEW_PIN_SIZE, y - NEW_PIN_SIZE / 2)),
      w: NEW_PIN_SIZE,
      h: NEW_PIN_SIZE,
    };
    onAddPin(activeKind, box);
  }

  return (
    <div className="space-y-3">
      {/* Active-kind selector — what a tap on the photo will drop. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-label uppercase text-text-tertiary mr-1">Tap to add</span>
        {ELEMENT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onActiveKindChange(kind)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-fast",
              activeKind === kind
                ? "bg-ink-pill text-white"
                : "bg-surface-muted text-text-secondary hover:text-text-primary"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", KIND_PIN_COLOR[kind])} />
            {ELEMENT_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <div
        ref={imgWrapRef}
        onClick={handleImageClick}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-surface-sunken cursor-crosshair select-none"
        style={{
          aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : "4 / 3",
        }}
      >
        {url && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Kitchen"
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        ) : failed ? (
          <div className="absolute inset-0 grid place-items-center text-text-tertiary">
            <div className="flex flex-col items-center gap-2 text-sm">
              <ImageOff className="h-6 w-6" strokeWidth={1.5} />
              Couldn&apos;t load photo
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-text-tertiary">
            <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} />
          </div>
        )}

        {photo.elements.map((el) => (
          <ElementPin
            key={el.id}
            element={el}
            selected={el.id === selectedElementId}
            onClick={() => onSelectElement(el.id)}
          />
        ))}
      </div>
      <p className="text-caption text-text-tertiary">
        Tap the photo to drop a {ELEMENT_KIND_LABELS[activeKind].toLowerCase()} pin · tap a pin to
        edit it
      </p>
    </div>
  );
}
