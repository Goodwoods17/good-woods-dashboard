"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Plus, Trash2, Upload, X } from "lucide-react";
import { formatError } from "@shared/lib/formatError";
import { captureMultiPageInvoice, MAX_CAMERA_PAGES } from "../lib/cameraCapture";
import { hasSupabase } from "@shared/lib/supabase";

interface CameraCaptureProps {
  /** Called after all pages are uploaded and the pending invoice row is created. */
  onCaptured: () => void;
}

/**
 * PWA camera capture UI for snapping multi-page invoices.
 *
 * On mobile the hidden file input with `capture="environment"` opens the
 * rear camera directly; on desktop it falls back to a file picker. Each
 * tap adds one page (up to MAX_CAMERA_PAGES). "Upload invoice" bundles all
 * captured pages into a single `pending` invoice via `captureMultiPageInvoice`.
 */
export function CameraCapture({ onCaptured }: CameraCaptureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pages, setPages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs when the panel is closed or component unmounts to
  // avoid browser-side memory leaks.
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
    // Intentional: cleanup only on unmount, not on every previews change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCamera = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset so the same file can be re-snapped if retaken.
      e.target.value = "";

      const previewUrl = URL.createObjectURL(file);
      setPages((prev) => [...prev, file]);
      setPreviews((prev) => [...prev, previewUrl]);
      setError(null);
    },
    []
  );

  const removePage = useCallback(
    (index: number) => {
      URL.revokeObjectURL(previews[index]);
      setPages((prev) => prev.filter((_, i) => i !== index));
      setPreviews((prev) => prev.filter((_, i) => i !== index));
    },
    [previews]
  );

  const onUpload = useCallback(async () => {
    if (pages.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      await captureMultiPageInvoice(pages);
      // Clean up previews before resetting state.
      previews.forEach((url) => URL.revokeObjectURL(url));
      setPages([]);
      setPreviews([]);
      setIsOpen(false);
      onCaptured();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setUploading(false);
    }
  }, [pages, previews, onCaptured]);

  const onClose = useCallback(() => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPages([]);
    setPreviews([]);
    setError(null);
    setIsOpen(false);
  }, [previews]);

  if (!isOpen) {
    return (
      <button
        type="button"
        data-testid="camera-capture-btn"
        disabled={!hasSupabase()}
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-muted disabled:opacity-60"
        aria-label="Snap invoice with camera"
      >
        <Camera className="h-4 w-4" />
        Snap invoice
      </button>
    );
  }

  return (
    <div
      data-testid="camera-capture-panel"
      className="rounded-lg border border-border bg-surface shadow-resting"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Snap invoice</span>
          {pages.length > 0 && (
            <span className="rounded-full bg-ink-pill px-2 py-0.5 text-xs font-medium text-white">
              {pages.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera capture"
          className="rounded p-1 text-text-tertiary transition-colors duration-fast hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {/* Page previews */}
        {previews.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((url, i) => (
              <div
                key={url}
                data-testid="camera-page-preview"
                className="group relative overflow-hidden rounded-md border border-border bg-surface-muted"
                style={{ aspectRatio: "3/4" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Page ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/50 to-transparent p-1 opacity-0 transition-opacity duration-fast group-hover:opacity-100">
                  <span className="text-xs font-medium text-white">p.{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removePage(i)}
                    aria-label={`Remove page ${i + 1}`}
                    className="rounded bg-white/20 p-0.5 text-white hover:bg-white/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Hidden file input — `capture="environment"` opens the rear camera on mobile */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Camera page input"
            data-testid="camera-page-input"
            className="hidden"
            disabled={pages.length >= MAX_CAMERA_PAGES || uploading}
            onChange={onFileSelected}
          />

          {pages.length < MAX_CAMERA_PAGES ? (
            <button
              type="button"
              onClick={openCamera}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-muted disabled:opacity-60"
            >
              {pages.length === 0 ? (
                <>
                  <Camera className="h-4 w-4" />
                  Take photo
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add page
                </>
              )}
            </button>
          ) : (
            <span className="text-xs text-text-tertiary">
              Maximum {MAX_CAMERA_PAGES} pages reached.
            </span>
          )}

          {pages.length > 0 && (
            <button
              type="button"
              data-testid="camera-upload-btn"
              disabled={uploading}
              onClick={() => void onUpload()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink-pill px-4 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {uploading
                ? "Uploading…"
                : pages.length === 1
                  ? "Upload invoice"
                  : `Upload ${pages.length}-page invoice`}
            </button>
          )}
        </div>

        {pages.length === 0 && (
          <p className="mt-2 text-xs text-text-tertiary">
            Tap &ldquo;Take photo&rdquo; to snap each page. Up to {MAX_CAMERA_PAGES} pages per
            invoice.
          </p>
        )}
      </div>
    </div>
  );
}
