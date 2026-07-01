"use client";

/**
 * S18/S20 — Store seam for schedule share links (public.schedule_share_links).
 *
 * Single owner of the Supabase I/O for the client schedule portal links, shared
 * by ClientPortalPanel (mint / list / revoke) and KickoffArtifactPanel (resolve
 * the first active link's public URL). Both components stay render-of-state.
 */
import { useCallback, useEffect, useState } from "react";
import { getSupabase, hasSupabase, SHARE_TOKENS_TABLE } from "@shared/lib/supabase";
import type { Job, ScheduleShareLink } from "@shared/lib/types";
import { generateCapabilityToken } from "@shared/lib/capabilityToken";
import {
  scheduleShareLinkToShareTokenRow,
  shareTokenRowToScheduleShareLink,
} from "./scheduleShareTokenMap";
import type { ShareTokenRow } from "@shared/lib/shareTokensRowMap";

// ─── Data access ──────────────────────────────────────────────────────────────
//
// S5a (milestone #12, ADR 0022): reads + writes both ride the generalized
// `share_tokens` registry (capability_type=schedule). The legacy
// `schedule_share_links` mirror was retired in #269 once the S5b Forms retrofit
// proved the mechanics (verify passed: zero rows).

/** All schedule share links for a job, newest first (read from share_tokens). */
export async function loadScheduleShareLinks(jobId: string): Promise<ScheduleShareLink[]> {
  if (!hasSupabase()) return [];
  const { data } = await getSupabase()
    .from(SHARE_TOKENS_TABLE)
    .select("*")
    .eq("job_id", jobId)
    .eq("capability_type", "schedule")
    .order("created_at", { ascending: false });
  return ((data as ShareTokenRow[] | null) ?? []).map(shareTokenRowToScheduleShareLink);
}

/** The first active (non-revoked) share link for a job, or null (read from share_tokens). */
export async function loadActiveScheduleShareLink(
  jobId: string
): Promise<ScheduleShareLink | null> {
  if (!hasSupabase()) return null;
  const { data } = await getSupabase()
    .from(SHARE_TOKENS_TABLE)
    .select("*")
    .eq("job_id", jobId)
    .eq("capability_type", "schedule")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const rows = (data as ShareTokenRow[] | null) ?? [];
  return rows.length > 0 ? shareTokenRowToScheduleShareLink(rows[0]) : null;
}

/**
 * Write a new share link to share_tokens (the read path). Returns true only when
 * that write — the one the portal reads — succeeds.
 */
export async function insertScheduleShareLink(link: ScheduleShareLink): Promise<boolean> {
  if (!hasSupabase()) return false;
  const sb = getSupabase();
  const { error } = await sb
    .from(SHARE_TOKENS_TABLE)
    .insert(scheduleShareLinkToShareTokenRow(link));
  return !error;
}

/** Stamp `revoked_at` on a share link in share_tokens. */
export async function revokeScheduleShareLink(id: string, revokedAt: string): Promise<void> {
  if (!hasSupabase()) return;
  const sb = getSupabase();
  await sb
    .from(SHARE_TOKENS_TABLE)
    .update({ revoked_at: revokedAt })
    .eq("id", id)
    .eq("capability_type", "schedule");
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export type UseScheduleShareLinks = {
  links: ScheduleShareLink[];
  busy: boolean;
  create: () => Promise<void>;
  revoke: (id: string) => Promise<void>;
};

/** Owner mint/list/revoke for one job (ClientPortalPanel). */
export function useScheduleShareLinks(job: Job): UseScheduleShareLinks {
  const [links, setLinks] = useState<ScheduleShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const supabaseReady = hasSupabase();

  const load = useCallback(async () => {
    if (!supabaseReady) return;
    setLinks(await loadScheduleShareLinks(job.id));
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
    const ok = await insertScheduleShareLink(link);
    if (ok) setLinks((prev) => [link, ...prev]);
    setBusy(false);
  }, [busy, job.id, job.installDate, supabaseReady]);

  const revoke = useCallback(
    async (id: string) => {
      if (!supabaseReady) return;
      const now = new Date().toISOString();
      await revokeScheduleShareLink(id, now);
      setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, revokedAt: now } : l)));
    },
    [supabaseReady]
  );

  return { links, busy, create, revoke };
}

/**
 * Resolve the first active share link's public URL for a job (KickoffArtifactPanel).
 * Returns null when offline, when no active link exists, or before mount.
 */
export function useActivePortalUrl(jobId: string): string | null {
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const supabaseReady = hasSupabase();

  useEffect(() => {
    if (!supabaseReady) return;
    let cancelled = false;
    void (async () => {
      const link = await loadActiveScheduleShareLink(jobId);
      if (cancelled || !link) return;
      if (typeof window !== "undefined") {
        setPortalUrl(`${window.location.origin}/s/${link.token}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, supabaseReady]);

  return portalUrl;
}
