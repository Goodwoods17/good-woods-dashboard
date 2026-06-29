"use client";

import { useEffect } from "react";
import { FileText, Phone, Mail, History, ExternalLink } from "lucide-react";
import { DOCUMENT_KIND_LABELS } from "@shared/lib/types";
import type { DocumentPortalBundle } from "../lib/documentShareServer";

/**
 * The public, no-login document VIEW portal (S2, ADR 0022). Mobile-first and
 * chrome-free: a recipient opens it in <60s with no account. Purely
 * presentational — it renders ONLY the client-safe set the server assembled
 * (current, client-safe-kind, uploaded docs with short-lived signed URLs). The
 * internal kinds, Drive links, and superseded revisions never reach this
 * component. On mount it fires a best-effort furthest-page beacon (analytics).
 */
export function DocumentPortalView({
  token,
  bundle,
}: {
  token: string;
  bundle: DocumentPortalBundle;
}) {
  const { jobName, recipientName, documents, superseded, contact } = bundle;

  // Best-effort engagement beacon: record that the viewer reached the last doc.
  useEffect(() => {
    if (documents.length === 0) return;
    const page = documents.length;
    const body = JSON.stringify({ page });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          `/api/documents/portal/${encodeURIComponent(token)}/seen`,
          new Blob([body], { type: "application/json" })
        );
      } else {
        void fetch(`/api/documents/portal/${encodeURIComponent(token)}/seen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    } catch {
      /* analytics only — never block the view */
    }
  }, [token, documents.length]);

  return (
    <main className="min-h-screen bg-background px-4 py-8" data-testid="document-portal-view">
      <div className="mx-auto w-full max-w-2xl">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.12em] text-text-tertiary">
            Good Woods · Project documents
          </p>
          <h1 className="mt-2 font-serif text-2xl text-text-primary" data-testid="portal-job-name">
            {jobName}
          </h1>
          {recipientName ? (
            <p className="mt-1 text-sm text-text-secondary">Prepared for {recipientName}</p>
          ) : null}
        </header>

        {superseded.superseded ? (
          <div
            data-testid="portal-superseded-banner"
            className="mt-6 flex items-start gap-2 rounded-xl border border-status-blocked-soft bg-status-blocked-soft/40 px-4 py-3 text-sm text-status-blocked"
          >
            <History className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>
              The originally shared document was superseded
              {superseded.currentVersion ? ` — current is ${superseded.currentVersion}` : ""}. You
              are seeing the latest documents below.
            </span>
          </div>
        ) : null}

        <section className="mt-6 space-y-3">
          {documents.length === 0 ? (
            <div
              data-testid="portal-empty"
              className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-text-secondary shadow-resting"
            >
              No documents are shared right now. Please check back, or contact us below.
            </div>
          ) : (
            documents.map(({ doc, url }) => (
              <article
                key={doc.id}
                data-testid="portal-doc"
                data-doc-kind={doc.kind}
                className="rounded-2xl border border-border bg-surface p-4 shadow-resting"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-surface-sunken px-1.5 py-0 text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
                        {DOCUMENT_KIND_LABELS[doc.kind]}
                      </span>
                      {doc.version ? (
                        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-tertiary">
                          {doc.version}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-1 truncate text-sm font-medium text-text-primary">
                      {doc.label}
                    </h2>
                  </div>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="portal-doc-open"
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-pill px-3 py-1.5 text-xs font-medium text-white duration-fast hover:bg-accent-active"
                    >
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Open
                    </a>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-muted px-3 py-1.5 text-xs text-text-tertiary">
                      <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Unavailable
                    </span>
                  )}
                </div>
              </article>
            ))
          )}
        </section>

        {contact ? (
          <section
            data-testid="portal-contact"
            className="mt-8 rounded-2xl border border-border bg-surface p-5 text-center shadow-resting"
          >
            <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
              Questions? Who to call
            </p>
            <p className="mt-1 text-sm font-medium text-text-primary">{contact.name}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {contact.phone ? (
                <a
                  href={`tel:${contact.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-secondary duration-fast hover:text-text-primary"
                >
                  <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {contact.phone}
                </a>
              ) : null}
              {contact.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-secondary duration-fast hover:text-text-primary"
                >
                  <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {contact.email}
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <p className="mt-6 text-center text-[11px] text-text-tertiary">
          Shared securely by Good Woods. Links expire and can be revoked at any time.
        </p>
      </div>
    </main>
  );
}
