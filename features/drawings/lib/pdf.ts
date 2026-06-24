"use client";
/** Thin pdf.js wrapper. Browser-only (worker + canvas). */
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";

// Next 14 (webpack) resolves this asset URL at build time.
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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
