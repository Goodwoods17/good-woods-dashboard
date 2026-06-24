"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useAuth } from "@shared/lib/authStore";
import { useDocuments } from "@features/documents/lib/documentsStore";
import {
  DOCUMENT_KIND_ORDER,
  DOCUMENT_KIND_LABELS,
  type DocumentKind,
  type ProjectDocument,
} from "@shared/lib/types";
import { validateUploadFile, ACCEPTED_UPLOAD_MIME } from "../lib/upload";
import { uploadDrawing } from "../lib/storage";

function newId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `doc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function DrawingUpload({ jobId }: { jobId: string }) {
  const { createDocument } = useDocuments();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>("shop");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const check = validateUploadFile(file);
    if (!check.ok) { setErr(check.reason); return; }
    setErr(null);
    setBusy(true);
    const id = newId();
    try {
      const { storagePath } = await uploadDrawing(jobId, id, file);
      const doc: ProjectDocument = {
        id, projectId: jobId, kind, label: file.name,
        driveUrl: null, version: null, isCurrent: true, notes: null,
        uploadedBy: user?.email ?? null, createdAt: new Date().toISOString(),
        source: "upload", storagePath, mime: file.type,
        pageCount: file.type === "application/pdf" ? null : 1,
      };
      await createDocument(doc);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="drawing-kind">Drawing type</label>
        <select
          id="drawing-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as DocumentKind)}
          disabled={busy}
          className="min-h-[44px] rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text-primary duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-50"
        >
          {DOCUMENT_KIND_ORDER.map((k) => (
            <option key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</option>
          ))}
        </select>
        <input ref={inputRef} type="file" accept={ACCEPTED_UPLOAD_MIME.join(",")}
          onChange={onPick} className="hidden" />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className={cn(
            "inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-ink-pill px-4 py-2 text-sm font-medium text-white duration-fast hover:bg-accent-active focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
            "disabled:cursor-not-allowed disabled:bg-text-disabled"
          )}>
          <Upload className="h-4 w-4" strokeWidth={2} />
          {busy ? "Uploading…" : "Upload drawing"}
        </button>
      </div>
      {err && <p className="text-xs text-status-blocked">{err}</p>}
    </div>
  );
}
