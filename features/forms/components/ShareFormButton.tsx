"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import type { FormInstance } from "@shared/lib/types";
import { useFormInstances } from "../lib/formInstancesStore";

/**
 * Bare owner-side affordance to mint a no-login share link for a form instance
 * (Forms P2 · Slice 1). The full share UI (recipient picker, per-field lock
 * controls, QR, branding) lands in Slice 2 — this is the plumbing's entry point:
 * one click → a token link the owner can copy and send.
 */
export function ShareFormButton({ instance }: { instance: FormInstance }) {
  const { createShareLink } = useFormInstances();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function mint() {
    setBusy(true);
    try {
      const link = await createShareLink({ instanceId: instance.id });
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setUrl(`${origin}/f/${link.token}`);
    } catch {
      /* error surfaces via the store */
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — the field is selectable as a fallback */
    }
  }

  if (url) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-muted/50 p-2">
        <input
          readOnly
          value={url}
          aria-label="Share link"
          data-testid="share-link-url"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent px-1 text-xs text-text-secondary focus:outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-status-on-track" strokeWidth={2.5} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={mint}
      disabled={busy}
      data-testid="create-share-link"
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
    >
      <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
      {busy ? "Creating link…" : "Share link"}
    </button>
  );
}
