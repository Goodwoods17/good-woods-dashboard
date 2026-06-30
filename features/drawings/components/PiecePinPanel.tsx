"use client";

import { useCallback, useState } from "react";
import { MapPin, Star, Trash2, ChevronDown } from "lucide-react";
import type { JobPiecePin, PinRole, ProjectDocument } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { usePiecePins, usePinsForPiece } from "../lib/piecePinsStore";
import {
  isPinnedOnDocument,
  buildSetPrimaryPatches,
  PIN_ROLE_LABELS,
  PIN_ROLES,
} from "../lib/multiPinLogic";

/**
 * S9: per-selected-piece pin management panel. Shows all pins for the piece
 * (primary first) with role selector, set-primary, and delete. Also shows
 * an "Add pin on this drawing" trigger when the piece has no pin yet on the
 * active document.
 *
 * Mounted by DrawingsView in the checklist sidebar when a piece is selected.
 */
export function PiecePinPanel({
  pieceId,
  activeDocId,
  activeDocIsLink,
  docsById,
  onRequestAddPin,
}: {
  pieceId: string;
  activeDocId: string;
  /** "link" docs disable the overlay entirely — no pin can be placed. */
  activeDocIsLink: boolean;
  docsById: Map<string, ProjectDocument>;
  /** Called when the user wants to drop a new pin on the current drawing. */
  onRequestAddPin: () => void;
}) {
  const { pins, updatePin, deletePin } = usePiecePins();
  const piecePins = usePinsForPiece(pieceId);
  const alreadyPinned = isPinnedOnDocument(pins, pieceId, activeDocId);
  const canAddPin = !activeDocIsLink && !alreadyPinned;

  const handleSetPrimary = useCallback(
    async (pin: JobPiecePin) => {
      const patches = buildSetPrimaryPatches(pins, pin.id);
      await Promise.all(patches.map(({ id, patch }) => updatePin(id, patch)));
    },
    [pins, updatePin]
  );

  const handleDelete = useCallback(
    async (pin: JobPiecePin) => {
      await deletePin(pin.id);
    },
    [deletePin]
  );

  const handleRoleChange = useCallback(
    async (pin: JobPiecePin, role: PinRole | null) => {
      await updatePin(pin.id, { role });
    },
    [updatePin]
  );

  if (piecePins.length === 0 && !canAddPin) return null;

  return (
    <div data-testid="piece-pin-panel" className="border-t border-border px-3 pt-3 pb-4">
      <h4 className="mb-2 text-micro font-semibold uppercase tracking-wider text-text-tertiary flex items-center gap-1">
        <MapPin className="h-3 w-3" />
        Pins ({piecePins.length})
      </h4>

      {piecePins.length > 0 && (
        <div className="space-y-1 mb-2">
          {piecePins.map((pin) => (
            <PinRow
              key={pin.id}
              pin={pin}
              doc={docsById.get(pin.documentId)}
              isSolePin={piecePins.length === 1}
              onSetPrimary={() => handleSetPrimary(pin)}
              onDelete={() => handleDelete(pin)}
              onRoleChange={(role) => handleRoleChange(pin, role)}
            />
          ))}
        </div>
      )}

      {canAddPin && (
        <button
          type="button"
          data-testid="add-pin-to-drawing"
          onClick={onRequestAddPin}
          className={cn(
            "w-full flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium duration-fast",
            "border border-dashed border-border text-text-secondary",
            "hover:border-accent-soft hover:text-accent hover:bg-accent-soft/10",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          )}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          Pin on this drawing
        </button>
      )}
    </div>
  );
}

function PinRow({
  pin,
  doc,
  isSolePin,
  onSetPrimary,
  onDelete,
  onRoleChange,
}: {
  pin: JobPiecePin;
  doc: ProjectDocument | undefined;
  isSolePin: boolean;
  onSetPrimary: () => void;
  onDelete: () => void;
  onRoleChange: (role: PinRole | null) => void;
}) {
  const [showRole, setShowRole] = useState(false);
  const [busy, setBusy] = useState(false);

  async function wrap(fn: () => unknown) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const docLabel = doc?.label ?? "Unknown drawing";
  const pageLabel = pin.page != null && pin.page > 0 ? ` · p${pin.page}` : "";
  const roleLabel = pin.role ? PIN_ROLE_LABELS[pin.role] : null;

  return (
    <div
      data-testid="pin-row"
      data-pin-id={pin.id}
      data-is-primary={pin.isPrimary}
      className={cn(
        "rounded-md border duration-fast text-xs",
        pin.isPrimary
          ? "border-accent-soft/40 bg-accent-soft/10"
          : "border-border bg-surface"
      )}
    >
      {/* Header row: doc + page + primary badge + actions */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-text-primary font-medium">
          {docLabel}{pageLabel}
        </span>

        {/* Primary badge */}
        {pin.isPrimary && (
          <span
            data-testid="primary-badge"
            className="shrink-0 rounded-full bg-accent-soft/40 text-accent px-1.5 py-0 text-[10px] uppercase tracking-[0.06em] font-medium"
          >
            Primary
          </span>
        )}

        {/* Role picker toggle */}
        <button
          type="button"
          onClick={() => setShowRole((v) => !v)}
          aria-label={showRole ? "Close role picker" : "Set drawing role"}
          title={roleLabel ?? "Set role"}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded duration-fast",
            "text-text-tertiary hover:text-text-secondary hover:bg-surface-muted",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          )}
        >
          <ChevronDown className={cn("h-3.5 w-3.5", showRole && "rotate-180")} />
        </button>

        {/* Set primary (only on secondary pins) */}
        {!pin.isPrimary && (
          <button
            type="button"
            onClick={() => void wrap(onSetPrimary)}
            disabled={busy}
            aria-label="Set as primary pin"
            title="Set as primary"
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded duration-fast",
              "text-text-tertiary hover:text-accent hover:bg-accent-soft/10",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              "disabled:opacity-40"
            )}
          >
            <Star className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Delete (only on non-primary or when it's a secondary pin) */}
        {!pin.isPrimary && (
          <button
            type="button"
            onClick={() => void wrap(onDelete)}
            disabled={busy || isSolePin}
            aria-label={`Remove pin on ${docLabel}`}
            title="Remove this pin"
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded duration-fast",
              "text-text-tertiary hover:text-status-blocked hover:bg-status-blocked-soft",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              "disabled:opacity-40"
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Role pill + sub-label */}
      {roleLabel && !showRole && (
        <div className="px-2 pb-1.5 -mt-0.5">
          <span className="inline-flex rounded-full bg-surface-muted text-text-tertiary px-1.5 py-0 text-[10px] uppercase tracking-[0.06em] font-medium">
            {roleLabel}
          </span>
        </div>
      )}

      {/* Role selector */}
      {showRole && (
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          <button
            type="button"
            onClick={() => { void wrap(() => onRoleChange(null)); setShowRole(false); }}
            disabled={busy}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium duration-fast",
              pin.role == null ? "bg-ink-pill text-white" : "bg-surface-muted text-text-secondary hover:bg-surface"
            )}
          >
            None
          </button>
          {PIN_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { void wrap(() => onRoleChange(r)); setShowRole(false); }}
              disabled={busy}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium duration-fast",
                pin.role === r ? "bg-ink-pill text-white" : "bg-surface-muted text-text-secondary hover:bg-surface"
              )}
            >
              {PIN_ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
