"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import type { ProjectDocument } from "@shared/lib/types";
import { resolveDocumentUrl } from "../lib/storage";
import { isPdf } from "../lib/upload";
import { loadPdf, renderPdfPage, clampScale } from "../lib/pdf";

export function DrawingDoc({ doc }: { doc: ProjectDocument }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (doc.source === "link") {
          if (!cancelled) setUrl(doc.driveUrl ?? null);
          return;
        }
        if (doc.storagePath) {
          const signed = await resolveDocumentUrl(doc.storagePath);
          if (!cancelled) setUrl(signed);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load drawing.");
      }
    })();
    return () => { cancelled = true; };
  }, [doc.source, doc.driveUrl, doc.storagePath]);

  if (err) return <p className="text-sm text-status-blocked">{err}</p>;
  if (!url) return <p className="text-sm text-text-tertiary">Loading…</p>;

  if (doc.source === "link") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover duration-fast">
        <ExternalLink className="h-4 w-4" strokeWidth={1.75} /> Open linked document
      </a>
    );
  }

  if (isPdf(doc.mime)) return <PdfCanvas url={url} />;
  return <img src={url} alt={doc.label} className="max-w-full rounded-lg shadow-resting" />;
}

function PdfCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdf = await loadPdf(url);
        if (cancelled) return;
        setPages(pdf.numPages);
        const canvas = canvasRef.current;
        if (canvas) await renderPdfPage(pdf, Math.min(page, pdf.numPages), canvas, scale);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not render PDF.");
      }
    })();
    return () => { cancelled = true; };
  }, [url, page, scale]);

  if (err) return <p className="text-sm text-status-blocked">{err}</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
          className="rounded-md p-1 hover:bg-surface-muted disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular-nums">{page} / {pages}</span>
        <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}
          className="rounded-md p-1 hover:bg-surface-muted disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="mx-2 h-4 w-px bg-border" />
        <button onClick={() => setScale((s) => clampScale(s - 0.25))}
          className="rounded-md p-1 hover:bg-surface-muted" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button onClick={() => setScale((s) => clampScale(s + 0.25))}
          className="rounded-md p-1 hover:bg-surface-muted" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <div className="overflow-auto rounded-lg border border-border bg-surface-muted p-2">
        <canvas ref={canvasRef} className="mx-auto" />
      </div>
    </div>
  );
}
