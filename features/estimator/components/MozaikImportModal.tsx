"use client";

// Mozaik CSV import review (ADR 0012 Slice 2). Drop/select a "Job Costing"
// export → parse → show what was read (per-room cabinets, cost-code quantities,
// material BOM, warnings) → confirm fills the draft estimate. Reads quantities
// only; the app re-prices (ADR 0012).

import { useState, useCallback, useMemo } from "react";
import { UploadCloud, X, AlertTriangle, Check } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { formatCAD } from "@shared/lib/format";
import {
  parseMozaikCsv,
  mozaikToEstimateDraft,
  type MozaikDraft,
  type MozaikImport,
} from "../lib/mozaikImport";
import {
  matchBomToCatalog,
  type BomMatch,
  type CatalogLite,
} from "../lib/bomCatalogMatch";
import { CABINET_TYPES, CABINET_TYPE_LABELS } from "../lib/types";

export function MozaikImportModal({
  open,
  catalog,
  onClose,
  onConfirm,
}: {
  open: boolean;
  catalog: CatalogLite[];
  onClose: () => void;
  onConfirm: (draft: MozaikDraft, matches: BomMatch[]) => void;
}) {
  const [parsed, setParsed] = useState<MozaikImport | null>(null);
  const [draft, setDraft] = useState<MozaikDraft | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const matches = useMemo(
    () => (draft ? matchBomToCatalog(draft.bom, catalog) : []),
    [draft, catalog],
  );

  const ingest = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const p = parseMozaikCsv(text);
      if (p.rooms.length === 0) {
        setError("No rooms found — is this a Mozaik pricing-run export?");
        setParsed(null);
        setDraft(null);
        return;
      }
      setParsed(p);
      setDraft(mozaikToEstimateDraft(p));
    } catch {
      setError("Couldn't read that file as CSV.");
      setParsed(null);
      setDraft(null);
    }
  }, []);

  function reset() {
    setParsed(null);
    setDraft(null);
    setFileName("");
    setError(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-floating">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Import Mozaik CSV</h2>
            <p className="text-caption text-text-tertiary">
              Quantities only — the app re-prices with your catalog + labour rates.
            </p>
          </div>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-text-tertiary hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!draft ? (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) ingest(f);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors duration-fast",
                dragOver ? "border-accent bg-accent-soft" : "border-border hover:border-text-tertiary",
              )}
            >
              <UploadCloud className="h-8 w-8 text-text-tertiary" strokeWidth={1.5} />
              <span className="text-sm text-text-secondary">
                Drop the export here, or <span className="text-accent">browse</span>
              </span>
              <span className="text-caption text-text-tertiary">
                Mozaik → Pricing tab → Job Costing template → Export → CSV
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) ingest(f);
                }}
              />
            </label>
          ) : (
            <ReviewBody draft={draft} parsed={parsed!} fileName={fileName} matches={matches} />
          )}

          {error && (
            <div className="rounded-md bg-status-blocked-soft text-status-blocked px-3 py-2 text-sm">
              {error}
            </div>
          )}
        </div>

        {draft && (
          <div className="flex items-center justify-between gap-3 p-5 border-t border-border sticky bottom-0 bg-surface">
            <button
              onClick={reset}
              className="text-sm text-text-tertiary hover:text-text-primary"
            >
              Choose a different file
            </button>
            <button
              onClick={() => {
                onConfirm(draft, matches);
                reset();
                onClose();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active"
            >
              Fill the estimate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewBody({
  draft,
  parsed,
  fileName,
  matches,
}: {
  draft: MozaikDraft;
  parsed: MozaikImport;
  fileName: string;
  matches: BomMatch[];
}) {
  const matchByName = new Map(matches.map((m) => [m.line.name + "__" + m.line.unit, m]));
  const matchedCount = matches.filter((m) => m.match).length;
  return (
    <div className="space-y-4">
      <p className="text-caption text-text-tertiary">
        Parsed <span className="text-text-secondary font-medium">{fileName}</span> —{" "}
        {parsed.rooms.length} room(s).
      </p>

      {draft.warnings.length > 0 && (
        <div className="rounded-md bg-status-at-risk-soft text-status-at-risk px-3 py-2 text-caption space-y-1">
          {draft.warnings.map((w, i) => (
            <div key={i} className="flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Per-room cabinet breakdown */}
      <div>
        <h3 className="text-caption uppercase tracking-[0.04em] text-text-tertiary mb-1">
          Cabinets by room
        </h3>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-text-tertiary text-caption">
              <tr>
                <th className="text-left font-medium px-3 py-1.5">Room</th>
                {CABINET_TYPES.map((t) => (
                  <th key={t} className="text-right font-medium px-3 py-1.5">
                    {CABINET_TYPE_LABELS[t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rooms.map((r) => (
                <tr key={r.name} className="border-t border-border">
                  <td className="px-3 py-1.5 text-text-secondary">{r.name}</td>
                  {CABINET_TYPES.map((t) => (
                    <td key={t} className="px-3 py-1.5 text-right tabular-nums text-text-primary">
                      {r.cabinets[t].count || "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-border bg-surface-muted font-medium">
                <td className="px-3 py-1.5">Job total</td>
                {CABINET_TYPES.map((t) => (
                  <td key={t} className="px-3 py-1.5 text-right tabular-nums">
                    {draft.cabinetSummary[t].count || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost-code quantities filled */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Finishing → FIN-SPRAY" value={`${draft.totals.finishedAreaSqft} sqft`} />
        <Stat label="Sheets → CUT-SHEET" value={`${draft.totals.sheets}`} />
      </div>

      {/* BOM */}
      <div>
        <h3 className="text-caption uppercase tracking-[0.04em] text-text-tertiary mb-1">
          Material BOM ({draft.bom.length}) — {matchedCount} matched to catalog,{" "}
          {draft.bom.length - matchedCount} to price by hand
        </h3>
        <div className="border border-border rounded-md max-h-44 overflow-y-auto divide-y divide-border">
          {draft.bom.map((b, i) => {
            const m = matchByName.get(b.name + "__" + b.unit);
            const matched = m?.match ?? null;
            return (
              <div key={i} className="flex items-center justify-between px-3 py-1 text-sm gap-3">
                <span className="text-text-secondary truncate">{b.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {matched ? (
                    <span className="inline-flex items-center gap-1 text-caption text-status-on-track">
                      <Check className="h-3 w-3" strokeWidth={2} />
                      {formatCAD(matched.unitPrice)}
                      {m!.confidence === "fuzzy" && (
                        <span className="text-text-tertiary">?</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-caption text-status-at-risk">no match</span>
                  )}
                  <span className="tabular-nums text-text-tertiary w-16 text-right">
                    {b.qty} {b.unit}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-caption text-text-tertiary mt-1">
          Matched lines import with the catalog price; a{" "}
          <span className="text-text-tertiary">?</span> is a fuzzy name match to
          confirm. Unmatched lines come in at $0 to price or add to the catalog.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-caption text-text-tertiary">{label}</div>
      <div className="text-sm font-medium text-text-primary tabular-nums">{value}</div>
    </div>
  );
}
