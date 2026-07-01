"use client";

import { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import type { DocumentRequestBundle } from "../lib/documentRequestServer";
import { buildRequestChecklist } from "../lib/documentRequestChecklist";
import { MAX_UPLOAD_BYTES } from "../lib/uploadQuota";
import type { DocumentRequestSubmission } from "@shared/lib/types";
import { PortalBrand } from "@shared/components/layout/PortalBrand";
import { PortalContactCard } from "@shared/components/layout/PortalContactCard";

/**
 * The public, no-login designer UPLOAD portal (S11, ADR 0022 · milestone #12).
 * A token holder drops requested files straight into the job — no account.
 * Presentational + a thin upload action: it shows the "Request these files"
 * checklist with outstanding-items status colours, POSTs each file to the
 * token-scoped write route (every security gate lives server-side), and renders
 * a confirmation receipt (filename + submission id) per accepted upload. The
 * checklist re-derives client-side from the running submission list so the status
 * colours update live without a reload.
 */

/** Max upload size in MB, derived from the shared byte ceiling for display. */
const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

const STATUS_STYLES: Record<
  "none" | "partial" | "complete",
  { dot: string; label: string; text: string }
> = {
  none: { dot: "bg-text-tertiary", label: "Nothing uploaded yet", text: "text-text-secondary" },
  partial: {
    dot: "bg-status-at-risk",
    label: "Some files still needed",
    text: "text-status-at-risk",
  },
  complete: {
    dot: "bg-status-on-track",
    label: "All requested files received",
    text: "text-status-on-track",
  },
};

export function DocumentRequestPortalView({
  token,
  bundle,
}: {
  token: string;
  bundle: DocumentRequestBundle;
}) {
  const { jobName, recipientName, requestedFiles, contact } = bundle;

  const [submissions, setSubmissions] = useState<DocumentRequestSubmission[]>(bundle.submissions);
  const [requestIndex, setRequestIndex] = useState<number | null>(
    requestedFiles.length > 0 ? 0 : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{ filename: string; submissionId: string } | null>(
    null
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const checklist = buildRequestChecklist(
    requestedFiles,
    submissions.map((s) => ({ requestIndex: s.requestIndex }))
  );
  const status = STATUS_STYLES[checklist.status];

  async function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    // Client-side size pre-check: reject oversized files before the network
    // round-trip. The server still enforces MAX_UPLOAD_BYTES authoritatively.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is too large — the maximum is ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (requestIndex !== null) form.append("requestIndex", String(requestIndex));
      const res = await fetch(`/api/documents/portal/${encodeURIComponent(token)}/upload`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        submissionId?: string;
        documentId?: string;
        filename?: string;
      };
      if (!res.ok || !data.ok || !data.submissionId) {
        setError(data.error ?? "Upload failed. Please try again.");
        return;
      }
      setSubmissions((prev) => [
        ...prev,
        {
          id: data.submissionId!,
          documentId: data.documentId ?? "",
          filename: data.filename ?? file.name,
          mime: "",
          bytes: file.size,
          requestIndex,
          createdAt: new Date().toISOString(),
        },
      ]);
      setLastReceipt({ filename: data.filename ?? file.name, submissionId: data.submissionId });
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setError("Upload failed. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background" data-testid="document-request-portal-view">
      <PortalBrand pageType="file-request" />
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <header className="text-center">
          <h1 className="font-serif text-2xl text-text-primary" data-testid="portal-job-name">
            {jobName}
          </h1>
          {recipientName ? (
            <p className="mt-1 text-sm text-text-secondary">Requested from {recipientName}</p>
          ) : null}
        </header>

        {/* Outstanding-items status banner (gray / yellow / green). */}
        <div
          data-testid="request-status"
          data-status={checklist.status}
          className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3"
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} aria-hidden />
          <span className={`text-sm font-medium ${status.text}`}>{status.label}</span>
        </div>

        {/* The "Request these files" checklist. */}
        {requestedFiles.length > 0 ? (
          <section className="mt-6" data-testid="request-checklist">
            <h2 className="text-sm font-semibold text-text-primary">Please send</h2>
            <ul className="mt-2 space-y-2">
              {checklist.items.map((item) => (
                <li
                  key={item.index}
                  data-testid="request-checklist-item"
                  data-satisfied={item.satisfied ? "true" : "false"}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  {item.satisfied ? (
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-status-on-track"
                      strokeWidth={1.75}
                    />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.75} />
                  )}
                  <span
                    className={
                      item.satisfied ? "text-text-secondary line-through" : "text-text-primary"
                    }
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Upload form. */}
        <section
          className="mt-6 rounded-2xl border border-border bg-surface p-4"
          data-testid="request-upload-form"
        >
          {requestedFiles.length > 0 ? (
            <label className="block text-sm">
              <span className="text-text-secondary">This file is for</span>
              <select
                data-testid="request-upload-target"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
                value={requestIndex ?? ""}
                onChange={(e) =>
                  setRequestIndex(e.target.value === "" ? null : Number(e.target.value))
                }
              >
                {requestedFiles.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
                <option value="">Something else</option>
              </select>
            </label>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            data-testid="request-file-input"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="mt-3 block w-full text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-ink-pill file:px-3 file:py-2 file:text-sm file:text-white"
          />

          <button
            type="button"
            data-testid="request-upload-btn"
            disabled={busy}
            onClick={onUpload}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink-pill px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            <UploadCloud className="h-4 w-4" strokeWidth={1.75} />
            {busy ? "Uploading…" : "Upload file"}
          </button>

          {error ? (
            <p data-testid="request-upload-error" className="mt-2 text-sm text-status-blocked">
              {error}
            </p>
          ) : null}

          <p className="mt-3 flex items-center gap-1.5 text-xs text-text-tertiary">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
            PDF, PNG, JPEG or WEBP · max {MAX_UPLOAD_MB} MB. Files go straight to the Good Woods
            shop.
          </p>
        </section>

        {/* Confirmation receipt for the most recent upload. */}
        {lastReceipt ? (
          <div
            data-testid="request-upload-receipt"
            className="mt-4 flex items-start gap-2 rounded-xl border border-status-on-track-soft bg-status-on-track-soft/40 px-4 py-3 text-sm text-status-on-track"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>
              Received <strong>{lastReceipt.filename}</strong>. Your confirmation number is{" "}
              <span data-testid="request-receipt-id" className="font-mono">
                {lastReceipt.submissionId}
              </span>
              .
            </span>
          </div>
        ) : null}

        {/* What has already been received (running receipt). */}
        {submissions.length > 0 ? (
          <section className="mt-6" data-testid="request-received-list">
            <h2 className="text-sm font-semibold text-text-primary">Received so far</h2>
            <ul className="mt-2 space-y-1.5">
              {submissions.map((s) => (
                <li
                  key={s.id}
                  data-testid="request-received-item"
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  <span className="truncate text-text-primary">{s.filename}</span>
                  <span className="shrink-0 font-mono text-xs text-text-tertiary">
                    {s.id.slice(0, 8)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Who-to-call card (server-derived, never client-supplied). */}
        {contact ? <PortalContactCard contact={contact} /> : null}
      </div>
    </main>
  );
}
