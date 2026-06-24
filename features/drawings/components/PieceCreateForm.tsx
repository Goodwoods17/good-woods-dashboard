"use client";

import { useState } from "react";
import type { PieceKind } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";

const KIND_LABELS: Record<PieceKind, string> = {
  cabinet: "Cabinet", end_panel: "End panel", scribe: "Scribe",
  toe_kick: "Toe kick", filler: "Filler",
};
const KINDS = Object.keys(KIND_LABELS) as PieceKind[];

export function PieceCreateForm({
  onCancel, onCreate,
}: {
  onCancel: () => void;
  onCreate: (d: { kind: PieceKind; label: string; code?: string; subtype?: string }) => void;
}) {
  const [kind, setKind] = useState<PieceKind>("cabinet");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [subtype, setSubtype] = useState("");
  const canSave = label.trim().length > 0;

  const field = "min-h-[44px] w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-soft";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        onCreate({
          kind, label: label.trim(),
          code: code.trim() || undefined,
          subtype: kind === "cabinet" && subtype.trim() ? subtype.trim() : undefined,
        });
      }}
      className="space-y-2 rounded-lg border border-border bg-surface p-3 shadow-resting"
    >
      <select value={kind} onChange={(e) => setKind(e.target.value as PieceKind)} className={field}>
        {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
      </select>
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. 3 Drawer)" className={field} />
      <input value={code} onChange={(e) => setCode(e.target.value)}
        placeholder="Code (optional, e.g. R1C7)" className={field} />
      {kind === "cabinet" && (
        <input value={subtype} onChange={(e) => setSubtype(e.target.value)}
          placeholder="Subtype (optional: base / wall / tall / island)" className={field} />
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="min-h-[44px] flex-1 rounded-full border border-border bg-surface text-sm text-text-secondary duration-fast hover:bg-surface-muted">
          Cancel
        </button>
        <button type="submit" disabled={!canSave}
          className={cn(
            "min-h-[44px] flex-1 rounded-full bg-ink-pill text-sm font-medium text-white duration-fast hover:bg-accent-active",
            "disabled:cursor-not-allowed disabled:bg-text-disabled"
          )}>
          Add piece
        </button>
      </div>
    </form>
  );
}
