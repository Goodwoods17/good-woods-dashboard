"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, Lock, RotateCcw } from "lucide-react";
import type { FormInstance } from "@shared/lib/types";
import { useAuth } from "@shared/lib/authStore";
import { useFormInstances } from "../lib/formInstancesStore";
import { incompleteRequiredFields, isInstanceComplete } from "../lib/completion";
import { generateSignoffPdf } from "../lib/signoff";

/**
 * The lock + signoff footer for a form instance (issue #35).
 *
 * - in_progress/draft → a "Complete & lock" button, gated on every required
 *   field passing its registry check (disabled with a hint until then).
 * - complete → a locked banner + "Download signoff PDF" (generates, downloads,
 *   uploads, records `signoff_path`) + an owner "Reopen" action that reverts
 *   the lock and voids the prior PDF.
 */
export function FormCompletionBar({
  instance,
  jobContext,
}: {
  instance: FormInstance;
  jobContext?: { code: string; name: string } | null;
}) {
  const {
    fieldsForInstance,
    completeInstance,
    reopenInstance,
    setSignoffPath,
    shareLinksForInstance,
  } = useFormInstances();
  const { user } = useAuth();
  const fields = fieldsForInstance(instance.id);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const complete = instance.status === "complete";
  const ready = useMemo(() => isInstanceComplete(fields), [fields]);
  const blocking = useMemo(() => incompleteRequiredFields(fields), [fields]);

  async function onComplete() {
    setBusy(true);
    setLocalError(null);
    try {
      const completedBy = user?.email ?? user?.id ?? "owner";
      await completeInstance(instance.id, completedBy);
      // Generate + store the signoff straight away so the locked form has a PDF.
      await downloadAndStore({ ...instance, status: "complete", completedBy });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not complete the form.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadAndStore(forInstance: FormInstance) {
    // The signature audit pair (IP/UA) is logged server-side when a client
    // submits via /f/<token>; surface the most recent one on the signoff PDF.
    const audited = shareLinksForInstance(forInstance.id)
      .filter((l) => l.submitIp || l.submitUserAgent)
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))[0];
    const signatureAudit = audited
      ? { ip: audited.submitIp, userAgent: audited.submitUserAgent }
      : null;
    const { storagePath } = await generateSignoffPdf(
      forInstance,
      fieldsForInstance(forInstance.id),
      jobContext,
      signatureAudit
    );
    await setSignoffPath(forInstance.id, storagePath);
  }

  async function onDownload() {
    setBusy(true);
    setLocalError(null);
    try {
      await downloadAndStore(instance);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not generate the signoff PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function onReopen() {
    if (!confirm("Reopen this form? The signoff PDF will be voided and it becomes editable again."))
      return;
    setBusy(true);
    setLocalError(null);
    try {
      await reopenInstance(instance.id);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not reopen the form.");
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <div
        data-testid="form-completed-bar"
        className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft/30 px-3 py-2.5"
      >
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Lock className="h-4 w-4 text-accent" strokeWidth={2} />
          <span>
            Completed
            {instance.completedBy ? ` by ${instance.completedBy}` : ""} — locked
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={busy}
            data-testid="download-signoff"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill px-3 py-1 text-xs font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            {busy ? "Working…" : "Download signoff PDF"}
          </button>
          <button
            type="button"
            onClick={onReopen}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            Reopen
          </button>
        </div>
        {localError && <p className="w-full text-xs text-status-blocked">{localError}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-tertiary">
          {ready
            ? "All required fields are filled."
            : `${blocking.length} required field${blocking.length === 1 ? "" : "s"} still to fill.`}
        </p>
        <button
          type="button"
          onClick={onComplete}
          disabled={busy || !ready}
          data-testid="complete-form"
          title={ready ? undefined : "Fill all required fields to complete."}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill px-3 py-1.5 text-xs font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
          {busy ? "Completing…" : "Complete & lock"}
        </button>
      </div>
      {!ready && blocking.length > 0 && (
        <ul className="mt-1.5 text-xs text-text-tertiary list-disc pl-4">
          {blocking.slice(0, 4).map((f) => (
            <li key={f.id}>{f.label}</li>
          ))}
          {blocking.length > 4 && <li>+{blocking.length - 4} more</li>}
        </ul>
      )}
      {localError && <p className="mt-1.5 text-xs text-status-blocked">{localError}</p>}
    </div>
  );
}
