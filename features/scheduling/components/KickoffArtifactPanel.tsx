"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardCopy, ExternalLink } from "lucide-react";
import type { Job } from "@shared/lib/types";
import { formatDate } from "@shared/lib/format";
import { getSupabase, hasSupabase, SCHEDULE_SHARE_LINKS_TABLE } from "@shared/lib/supabase";
import { buildKickoffArtifact, type KickoffArtifact } from "../lib/kickoffArtifact";
import type { ScheduleShareLinkRow } from "../lib/scheduleShareLinksRowMap";
import { rowToScheduleShareLink } from "../lib/scheduleShareLinksRowMap";

/**
 * S20 — Kickoff expectation-setting artifact panel (issue #108).
 *
 * Renders the auto-generated "here's your schedule + how/when we'll update you"
 * document in the Schedule tab. The owner can copy the full text to paste into
 * an email at project kickoff. No new schema — built entirely from existing job
 * data and the optional S18 client portal share link.
 *
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (the parent ScheduleTab gates it).
 */
export function KickoffArtifactPanel({ job }: { job: Job }) {
  const [copied, setCopied] = useState(false);
  // The first active share-link URL (if any) is woven into the update protocol.
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  const supabaseReady = hasSupabase();

  // Load the first active share link to build the portal URL for the artifact.
  useEffect(() => {
    if (!supabaseReady) return;
    const sb = getSupabase();
    void (async () => {
      const { data } = await sb
        .from(SCHEDULE_SHARE_LINKS_TABLE)
        .select("token, revoked_at")
        .eq("job_id", job.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const link = rowToScheduleShareLink(data[0] as ScheduleShareLinkRow);
        // Build the URL from the current origin so it works in any env.
        if (typeof window !== "undefined") {
          setPortalUrl(`${window.location.origin}/s/${link.token}`);
        }
      }
    })();
  }, [job.id, supabaseReady]);

  const artifact: KickoffArtifact = buildKickoffArtifact({
    jobName: job.name,
    clientName: job.client ?? null,
    installDate: job.installDate,
    phaseTargetDates: job.phaseTargetDates,
    portalUrl,
  });

  const handleCopy = useCallback(async () => {
    const text = `Subject: ${artifact.subject}\n\n${artifact.fullText}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — no-op.
    }
  }, [artifact]);

  return (
    <section
      data-testid="kickoff-artifact-panel"
      className="bg-surface rounded-xl shadow-resting p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
            Kickoff message
          </h3>
          <p className="mt-1 text-xs text-text-tertiary max-w-prose">
            Send this to the client at project start — sets expectations on schedule and how
            you&apos;ll communicate updates.
          </p>
        </div>
        <button
          type="button"
          data-testid="kickoff-artifact-copy"
          onClick={handleCopy}
          aria-label="Copy kickoff message to clipboard"
          className="inline-flex flex-none items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
              Copied
            </>
          ) : (
            <>
              <ClipboardCopy className="h-3.5 w-3.5" strokeWidth={1.75} />
              Copy
            </>
          )}
        </button>
      </div>

      {/* ── Subject ────────────────────────────────────────────────────────── */}
      <div className="mt-5">
        <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">Subject</p>
        <p
          className="text-sm font-medium text-text-primary"
          data-testid="kickoff-artifact-subject"
        >
          {artifact.subject}
        </p>
      </div>

      {/* ── Body preview ───────────────────────────────────────────────────── */}
      <div
        className="mt-5 rounded-lg border border-border bg-surface-muted p-4 text-sm text-text-secondary space-y-3"
        data-testid="kickoff-artifact-body"
      >
        <p className="text-text-primary font-medium">Hi {job.client ?? ""},</p>
        <p>Here&apos;s a snapshot of your {job.name} schedule as we kick off.</p>

        {/* Phase timeline */}
        <div>
          <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-2">
            Phase timeline
          </p>
          <ol className="space-y-1.5" data-testid="kickoff-phase-list">
            {artifact.phaseLines.map((p) => (
              <li
                key={p.phase}
                className="flex items-baseline gap-2"
                data-testid={`kickoff-phase-${p.phase}`}
              >
                <span className="text-text-primary font-medium min-w-[160px]">{p.label}</span>
                <span className="text-text-secondary">
                  {p.phase === "install" ? (
                    <>
                      <span className="font-semibold text-text-primary">
                        {formatDate(p.window)}
                      </span>
                      <span className="ml-1 text-xs text-text-tertiary">(firm)</span>
                    </>
                  ) : (
                    p.window
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Update protocol */}
        <div>
          <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-2">
            How we&apos;ll keep you informed
          </p>
          <ul className="space-y-1" data-testid="kickoff-update-protocol">
            {artifact.updateProtocol.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-status-on-track flex-none">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Portal link (when a share link exists) */}
        {artifact.portalLine !== null ? (
          <div data-testid="kickoff-portal-line">
            {portalUrl ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-status-on-track hover:underline text-xs"
              >
                <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                View live schedule
              </a>
            ) : null}
          </div>
        ) : null}

        <p className="text-text-tertiary text-xs">
          Questions? Reply to this email and we&apos;ll help.
        </p>
      </div>
    </section>
  );
}
