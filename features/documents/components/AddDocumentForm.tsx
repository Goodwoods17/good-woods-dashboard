"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { PillButton } from "@shared/components/ui/PillButton";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KIND_ORDER,
  type DocumentKind,
  type ProjectDocument,
} from "@shared/lib/types";
import { guessLabelFromUrl, parseDriveUrl } from "../lib/driveUrl";

/**
 * Inline form: paste a Drive URL, pick the kind + label + optional
 * version, save. Used inside DocumentsCard (JobDetail) and
 * NewProjectDocumentsBlock (/jobs/new).
 *
 * Pass `existingDocs` to reveal the optional "Supersedes" select (S7);
 * the selected doc's id is forwarded as `supersedesId` in the save payload.
 *
 * Callers handle the actual save:
 *   - JobDetail: writes immediately via useDocuments().createDocument
 *   - /jobs/new: holds pending docs in local state, writes after the
 *     project is created (so the project_id exists).
 */
export function AddDocumentForm({
  defaultKind = "designer",
  existingDocs = [],
  onSave,
  busy,
  compact,
}: {
  defaultKind?: DocumentKind;
  /** Existing docs in this project, used to populate the Supersedes picker (S7). */
  existingDocs?: ProjectDocument[];
  onSave: (doc: {
    kind: DocumentKind;
    label: string;
    driveUrl: string;
    version: string | null;
    supersedesId: string | null;
  }) => void | Promise<void>;
  busy?: boolean;
  compact?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<DocumentKind>(defaultKind);
  const [label, setLabel] = useState("");
  const [version, setVersion] = useState("");
  const [supersedesId, setSupersedesId] = useState<string>("");
  const [labelTouched, setLabelTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto-suggest a label from the URL kind unless the user has typed one.
  useEffect(() => {
    if (!labelTouched && url.trim().length > 0) {
      setLabel(guessLabelFromUrl(url));
    }
  }, [url, labelTouched]);

  const parsed = url.trim() ? parseDriveUrl(url) : null;
  const urlOk = parsed !== null;
  const canSubmit = urlOk && label.trim().length > 0 && !busy;

  function reset() {
    setUrl("");
    setKind(defaultKind);
    setLabel("");
    setVersion("");
    setSupersedesId("");
    setLabelTouched(false);
    setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setErr(null);
    try {
      await onSave({
        kind,
        label: label.trim(),
        driveUrl: url.trim(),
        version: version.trim() || null,
        supersedesId: supersedesId || null,
      });
      reset();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Could not save.");
    }
  }

  return (
    <form onSubmit={submit} className={cn("space-y-2.5", compact && "space-y-2")}>
      <div>
        <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
          Google Drive URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://drive.google.com/file/d/.../view"
          className={cn(
            "w-full text-sm bg-white border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-soft transition-colors duration-fast",
            urlOk
              ? "border-border focus:border-border-strong"
              : url.trim().length > 0
                ? "border-status-blocked focus:border-status-blocked"
                : "border-border focus:border-border-strong"
          )}
        />
        {url.trim().length > 0 && !urlOk && (
          <p className="text-xs text-status-blocked mt-1">Not a recognised Google Drive URL.</p>
        )}
        {parsed && parsed.kind === "folder" && (
          <p className="text-xs text-text-tertiary mt-1">
            Folder detected. Preview won&apos;t render but the link will open in a new tab.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelTouched(true);
            }}
            placeholder="Upper cabinet sections"
            className="w-full text-sm bg-white border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
            Version (optional)
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="R3"
            className="w-full text-sm bg-white border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
          />
        </div>
      </div>

      {/* S7 — Supersedes picker: shown only when there are existing docs to link to. */}
      {existingDocs.length > 0 && (
        <div>
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
            Supersedes (optional)
          </label>
          <select
            value={supersedesId}
            onChange={(e) => setSupersedesId(e.target.value)}
            data-testid="doc-supersedes-select"
            className="w-full text-sm bg-white border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
          >
            <option value="">None — this is an independent document</option>
            {existingDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
                {d.version ? ` (${d.version})` : ""}
                {!d.isCurrent ? " — superseded" : ""}
              </option>
            ))}
          </select>
          {supersedesId && (
            <p className="text-xs text-text-tertiary mt-1">
              The selected document will be marked as superseded when this one is saved.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
          Type
        </label>
        <div className="flex flex-wrap gap-1.5">
          {DOCUMENT_KIND_ORDER.map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-fast",
                kind === k
                  ? "bg-ink-pill text-white"
                  : "bg-surface-muted text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
              )}
            >
              {DOCUMENT_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-xs text-status-blocked">{err}</p>}

      <div className="flex items-center justify-end">
        <PillButton
          type="submit"
          disabled={!canSubmit}
          className="disabled:bg-text-disabled disabled:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? "Saving" : "Add document"}
        </PillButton>
      </div>
    </form>
  );
}
