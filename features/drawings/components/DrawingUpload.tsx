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
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary duration-fast focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
        >
          {DOCUMENT_KIND_ORDER.map((k) => (
            <option key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</option>
          ))}
        </select>
        <input ref={inputRef} type="file" accept={ACCEPTED_UPLOAD_MIME.join(",")}
          onChange={onPick} className="hidden" />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-3 py-1.5 text-xs font-medium hover:bg-accent-active duration-fast",
            "disabled:bg-text-disabled disabled:cursor-not-allowed"
          )}>
          <Upload className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? "Uploading…" : "Upload drawing"}
        </button>
      </div>
      {err && <p className="text-xs text-status-blocked">{err}</p>}
    </div>
  );
}
