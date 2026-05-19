"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function RegenerateButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/briefing/regenerate", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-status-blocked">{error}</span>}
      <button
        onClick={regenerate}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface text-text-primary px-3 py-1.5 text-sm font-medium hover:bg-surface-muted transition-colors duration-fast disabled:opacity-50"
      >
        <RefreshCw
          className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
          strokeWidth={2}
        />
        {busy ? "Generating…" : "Regenerate"}
      </button>
    </div>
  );
}
