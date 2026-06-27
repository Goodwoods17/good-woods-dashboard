"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, X } from "lucide-react";
import type { Job, ScheduleShareLink } from "@shared/lib/types";
import { getSupabase, hasSupabase, SCHEDULE_SHARE_LINKS_TABLE } from "@shared/lib/supabase";
import { generateCapabilityToken } from "@shared/lib/utils";
import {
  rowToScheduleShareLink,
  scheduleShareLinkToRow,
  type ScheduleShareLinkRow,
} from "../lib/scheduleShareLinksRowMap";

/**
 * Owner-only panel in the Schedule tab (S18, issue #106) to mint / copy / revoke
 * the read-only client schedule portal link. The client opens `/s/<token>` with
 * no login — they see the milestone stepper, % done, next step, soft ranges, and
 * the one firm install day. The committed-date snapshot is frozen at mint time so
 * the client view flips to "Date updated" only when the install date moves.
 *
 * Creation runs as the authenticated owner (RLS authenticated_all) — same write
 * path the rest of the app uses; the public READ uses the service role.
 */
export function ClientPortalPanel({ job }: { job: Job }) {
  const [links, setLinks] = useState<ScheduleShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const supabaseReady = hasSupabase();

  const load = useCallback(async () => {
    if (!supabaseReady) return;
    const sb = getSupabase();
    const { data } = await sb
      .from(SCHEDULE_SHARE_LINKS_TABLE)
      .select("*")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false });
    setLinks(((data as ScheduleShareLinkRow[] | null) ?? []).map(rowToScheduleShareLink));
  }, [job.id, supabaseReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    if (!supabaseReady || busy) return;
    setBusy(true);
    const link: ScheduleShareLink = {
      id: crypto.randomUUID(),
      jobId: job.id,
      token: generateCapabilityToken(),
      recipientName: null,
      committedDateSnapshot: job.installDate,
      viewedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
      createdBy: null,
    };
    const sb = getSupabase();
    const { error } = await sb
      .from(SCHEDULE_SHARE_LINKS_TABLE)
      .insert(scheduleShareLinkToRow(link));
    if (!error) setLinks((prev) => [link, ...prev]);
    setBusy(false);
  }, [busy, job.id, job.installDate, supabaseReady]);

  const revoke = useCallback(
    async (id: string) => {
      if (!supabaseReady) return;
      const now = new Date().toISOString();
      const sb = getSupabase();
      await sb.from(SCHEDULE_SHARE_LINKS_TABLE).update({ revoked_at: now }).eq("id", id);
      setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, revokedAt: now } : l)));
    },
    [supabaseReady]
  );

  const copy = useCallback(async (link: ScheduleShareLink) => {
    const url = `${window.location.origin}/s/${link.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — no-op; the URL is still visible.
    }
  }, []);

  const active = links.filter((l) => l.revokedAt === null);

  return (
    <section data-testid="client-portal-panel" className="bg-surface rounded-xl shadow-resting p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
          Client schedule link
        </h3>
        <button
          type="button"
          data-testid="client-portal-create"
          onClick={create}
          disabled={!supabaseReady || busy}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          Create client link
        </button>
      </div>

      <p className="mt-2 text-xs text-text-tertiary">
        A read-only, no-login view of this job&apos;s schedule — milestones, next step, and the firm
        install day. Buffer and internal targets stay private.
      </p>

      {active.length === 0 ? (
        <p className="mt-4 text-sm text-text-tertiary" data-testid="client-portal-empty">
          No client link yet.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {active.map((link) => (
            <li
              key={link.id}
              data-testid="client-portal-link-row"
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
            >
              <code
                className="flex-1 truncate text-xs text-text-secondary"
                data-testid="client-portal-url"
              >
                /s/{link.token}
              </code>
              <button
                type="button"
                data-testid="client-portal-copy"
                onClick={() => copy(link)}
                aria-label="Copy client schedule link"
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
              >
                {copiedId === link.id ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </button>
              <button
                type="button"
                data-testid="client-portal-revoke"
                onClick={() => revoke(link.id)}
                aria-label="Revoke client schedule link"
                className="inline-flex items-center rounded-full px-2 py-1 text-xs text-text-tertiary hover:text-status-blocked"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
