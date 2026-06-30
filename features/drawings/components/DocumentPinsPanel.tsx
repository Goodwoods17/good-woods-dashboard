"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MapPin, PencilRuler } from "lucide-react";
import { usePiecePins, usePinsForDocument } from "../lib/piecePinsStore";
import { usePieces } from "../lib/piecesStore";
import { PIN_ROLE_LABELS } from "../lib/multiPinLogic";
import type { PinRole } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";

/**
 * S9 cross-link reverse panel. Shown on the document detail pane (DocumentsCard)
 * for uploaded drawings — lists every piece that has a pin on this document, with
 * a jump-to-drawing link and role label.
 *
 * Reads from the global PiecePinsProvider + PiecesProvider (both mounted at layout
 * level), so no additional data fetching is needed here.
 */
export function DocumentPinsPanel({
  documentId,
  projectId,
}: {
  documentId: string;
  projectId: string;
}) {
  const pinsForDoc = usePinsForDocument(documentId);
  const { pieces } = usePieces();

  const rows = useMemo(() => {
    if (pinsForDoc.length === 0) return [];
    const byId = new Map(pieces.map((p) => [p.id, p]));
    // Deduplicate: one row per piece (a piece may have multiple pins on this doc
    // across pages). Show the primary pin first when there is one.
    const seen = new Set<string>();
    const sorted = [...pinsForDoc].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary)
    );
    return sorted.flatMap((pin) => {
      if (seen.has(pin.jobPieceId)) return [];
      seen.add(pin.jobPieceId);
      const piece = byId.get(pin.jobPieceId);
      if (!piece) return [];
      return [{ piece, pin }];
    });
  }, [pinsForDoc, pieces]);

  if (rows.length === 0) return null;

  const count = rows.length;

  return (
    <div
      data-testid="doc-pins-panel"
      className="border-t border-[rgba(26,25,22,0.05)] px-6 py-4"
    >
      <div className="flex items-center gap-1.5 mb-3">
        <MapPin className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
        <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary font-semibold">
          Referenced by {count} {count === 1 ? "cabinet" : "cabinets"}
        </span>
      </div>

      <ul className="space-y-1">
        {rows.map(({ piece, pin }) => (
          <li
            key={piece.id}
            data-testid="doc-pin-ref"
            data-piece-id={piece.id}
            className="flex items-center gap-2"
          >
            <span className="min-w-0 flex-1 text-xs text-text-primary truncate">
              {piece.code ? `${piece.code} · ` : ""}
              {piece.label}
              {pin.role && (
                <span className="ml-1 text-text-tertiary">
                  ({PIN_ROLE_LABELS[pin.role as PinRole]})
                </span>
              )}
            </span>
            <Link
              href={`/jobs/${projectId}/drawings`}
              data-testid="jump-to-drawing"
              className={cn(
                "shrink-0 inline-flex items-center gap-1 rounded-full",
                "px-2 py-0.5 text-[10px] font-medium",
                "bg-surface-muted text-text-secondary duration-fast",
                "hover:bg-accent-soft/20 hover:text-accent",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              )}
              aria-label={`Open ${piece.code ?? piece.label} in Drawings workspace`}
            >
              <PencilRuler className="h-3 w-3" strokeWidth={1.75} />
              Drawing
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
