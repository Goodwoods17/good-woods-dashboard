"use client";

/**
 * Store seam for document VIEW share links on the generalized `share_tokens`
 * registry (S2, ADR 0022). Single owner of the authenticated Supabase I/O for
 * the `DocumentShareSection` mint / list / revoke UI. The public read path is
 * service-role (documentShareServer); this owner path is the logged-in browser
 * client under RLS `authenticated_all`. Document-view rows anchor on ONE
 * `document_id` (the curated set is derived from that doc's job on the portal).
 */
import { useCallback, useEffect, useState } from "react";
import { getSupabase, hasSupabase, SHARE_TOKENS_TABLE } from "@shared/lib/supabase";
import type { ShareToken } from "@shared/lib/types";
import { generateCapabilityToken } from "@shared/lib/capabilityToken";
import {
  rowToShareToken,
  shareTokenToRow,
  type ShareTokenRow,
} from "@shared/lib/shareTokensRowMap";

/** All document-view links anchored on a set of the job's docs, newest first. */
async function loadLinks(documentIds: string[]): Promise<ShareToken[]> {
  if (!hasSupabase() || documentIds.length === 0) return [];
  const { data } = await getSupabase()
    .from(SHARE_TOKENS_TABLE)
    .select("*")
    .eq("capability_type", "document_view")
    .in("document_id", documentIds)
    .order("created_at", { ascending: false });
  return ((data as ShareTokenRow[] | null) ?? []).map(rowToShareToken);
}

export type UseDocumentShareLinks = {
  links: ShareToken[];
  busy: boolean;
  create: (anchorDocumentId: string, recipientName: string | null) => Promise<void>;
  revoke: (id: string) => Promise<void>;
};

/**
 * Owner mint/list/revoke for one job's document-view links. `documentIds` is the
 * set of the job's documents (any of them can be the anchor); listing matches any
 * link whose anchor is one of them so a revoked-then-deleted doc still shows.
 */
export function useDocumentShareLinks(documentIds: string[]): UseDocumentShareLinks {
  const [links, setLinks] = useState<ShareToken[]>([]);
  const [busy, setBusy] = useState(false);
  const supabaseReady = hasSupabase();
  const idKey = documentIds.join(",");

  const refresh = useCallback(async () => {
    if (!supabaseReady) return;
    setLinks(await loadLinks(documentIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseReady, idKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (anchorDocumentId: string, recipientName: string | null) => {
      if (!supabaseReady || busy) return;
      setBusy(true);
      try {
        const link: ShareToken = {
          id: crypto.randomUUID(),
          capabilityType: "document_view",
          formInstanceId: null,
          jobId: null,
          documentId: anchorDocumentId,
          token: generateCapabilityToken(),
          recipientName: recipientName?.trim() ? recipientName.trim() : null,
          viewedAt: null,
          revokedAt: null,
          expiresAt: null,
          viewCount: 0,
          ip: null,
          ua: null,
          createdAt: new Date().toISOString(),
          createdBy: null,
          state: {},
        };
        const { error } = await getSupabase()
          .from(SHARE_TOKENS_TABLE)
          .insert(shareTokenToRow(link));
        if (!error) setLinks((prev) => [link, ...prev]);
      } finally {
        setBusy(false);
      }
    },
    [busy, supabaseReady]
  );

  const revoke = useCallback(
    async (id: string) => {
      if (!supabaseReady) return;
      const now = new Date().toISOString();
      await getSupabase().from(SHARE_TOKENS_TABLE).update({ revoked_at: now }).eq("id", id);
      setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, revokedAt: now } : l)));
    },
    [supabaseReady]
  );

  return { links, busy, create, revoke };
}
