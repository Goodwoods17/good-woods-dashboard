"use client";
/** Thin pdf.js wrapper. Browser-only (worker + canvas). */
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";

// Served as a static asset from /public (copied by scripts/copy-pdf-worker.mjs
// on predev/prebuild). We intentionally do NOT bundle the worker via webpack
// (`new URL(..., import.meta.url)`) — Terser fails to minify the worker .mjs.
GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 4;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  return getDocument({ url }).promise;
}

export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<void> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: clampScale(scale) });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
}
