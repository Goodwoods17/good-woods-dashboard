import {
  JOBS_TABLE,
  SCHEDULING_GOOGLE_CONNECTIONS_TABLE,
  SCHEDULING_GOOGLE_EVENTS_TABLE,
} from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import type { Job, MilestoneStage } from "@shared/lib/types";
import {
  buildJobCalendarEvents,
  diffCalendarSync,
  type ExistingSyncRow,
  type GoogleCalendarEvent,
} from "./googlePush";
import { encryptToken, decryptToken } from "./googleTokenCrypto";
import { googleOAuthConfigured, readGoogleOAuthEnv, refreshAccessToken } from "./googleOAuth";

/**
 * Server-only data access + sync executor for the one-way Google push (S23).
 * SERVICE-ROLE only — imported exclusively by the /api/scheduling/google/*
 * route handlers (runtime=nodejs). The refresh token is decrypted in memory
 * only at push time and never returned to any caller.
 *
 * Every entry point degrades gracefully: a missing service client, missing
 * OAuth creds, or no connection yields a typed "unconfigured" / "not_connected"
 * result rather than throwing — so CI / preview / unconfigured prod stay green.
 */

const CAL_API = "https://www.googleapis.com/calendar/v3/calendars";

type ConnectionRow = {
  id: string;
  google_account_email: string | null;
  calendar_id: string;
  encrypted_refresh_token: string;
  scope: string | null;
};

type EventRow = {
  sync_key: string;
  google_event_id: string;
  synced_date: string;
};

export type GoogleConnectionStatus = {
  /** OAuth client id/secret + token-encryption key all present. */
  configured: boolean;
  /** A connection row exists (the owner has consented). */
  connected: boolean;
  /** Display-only account email when connected. */
  accountEmail: string | null;
};

/** Status for the UI panel — never throws, never leaks the token. */
export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const configured = googleOAuthConfigured();
  const sb = getServiceRoleClient();
  if (!sb) return { configured, connected: false, accountEmail: null };

  const { data } = await sb
    .from(SCHEDULING_GOOGLE_CONNECTIONS_TABLE)
    .select("google_account_email")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    configured,
    connected: Boolean(data),
    accountEmail: (data?.google_account_email as string | null) ?? null,
  };
}

/** Persist (or replace) the single owner connection with an ENCRYPTED token. */
export async function saveGoogleConnection(params: {
  refreshToken: string;
  scope: string | null;
  accountEmail: string | null;
  connectedBy: string | null;
}): Promise<{ ok: true } | { ok: false; reason: "unconfigured" }> {
  const encKey = process.env.GOOGLE_TOKEN_ENC_KEY;
  const sb = getServiceRoleClient();
  if (!sb || !encKey?.trim()) return { ok: false, reason: "unconfigured" };

  const encrypted = encryptToken(params.refreshToken, encKey);

  // Single-shop model: clear any prior connection, then insert the fresh one.
  await sb.from(SCHEDULING_GOOGLE_CONNECTIONS_TABLE).delete().neq("id", "");
  await sb.from(SCHEDULING_GOOGLE_CONNECTIONS_TABLE).insert({
    connected_by: params.connectedBy,
    google_account_email: params.accountEmail,
    encrypted_refresh_token: encrypted,
    scope: params.scope,
  });
  return { ok: true };
}

/** Disconnect: drop the connection + all event mappings (best-effort). */
export async function disconnectGoogle(): Promise<{ ok: boolean }> {
  const sb = getServiceRoleClient();
  if (!sb) return { ok: false };
  await sb.from(SCHEDULING_GOOGLE_CONNECTIONS_TABLE).delete().neq("id", "");
  return { ok: true };
}

async function loadConnection(): Promise<ConnectionRow | null> {
  const sb = getServiceRoleClient();
  if (!sb) return null;
  const { data } = await sb
    .from(SCHEDULING_GOOGLE_CONNECTIONS_TABLE)
    .select("id, google_account_email, calendar_id, encrypted_refresh_token, scope")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

async function loadJobForPush(jobId: string): Promise<Job | null> {
  const sb = getServiceRoleClient();
  if (!sb) return null;
  const { data } = await sb
    .from(JOBS_TABLE)
    .select("id, name, current_milestone, install_date, phase_target_dates")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    name: string | null;
    current_milestone: MilestoneStage;
    install_date: string | null;
    phase_target_dates: Partial<Record<MilestoneStage, string>> | null;
  };
  return {
    id: row.id,
    name: row.name ?? "",
    currentMilestone: row.current_milestone,
    installDate: row.install_date ?? "",
    phaseTargetDates: row.phase_target_dates,
  } as unknown as Job;
}

async function loadEventMap(jobId: string): Promise<ExistingSyncRow[]> {
  const sb = getServiceRoleClient();
  if (!sb) return [];
  const { data } = await sb
    .from(SCHEDULING_GOOGLE_EVENTS_TABLE)
    .select("sync_key, google_event_id, synced_date")
    .eq("job_id", jobId);
  return ((data as EventRow[] | null) ?? []).map((r) => ({
    syncKey: r.sync_key,
    googleEventId: r.google_event_id,
    syncedDate: r.synced_date,
  }));
}

/** Google Calendar all-day event body for a desired event. */
function eventBody(ev: GoogleCalendarEvent) {
  const endExclusive = new Date(`${ev.date}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    summary: ev.summary,
    description: ev.description,
    start: { date: ev.date },
    end: { date: endExclusive.toISOString().slice(0, 10) },
    transparency: "transparent",
    source: { title: "Good Woods schedule", url: "https://goodwoods.app" },
  };
}

type PushResult =
  | {
      ok: true;
      created: number;
      updated: number;
      deleted: number;
    }
  | { ok: false; reason: "unconfigured" | "not_connected" | "job_not_found" | "push_failed" };

/**
 * Execute the one-way push for one job: diff desired vs. stored, then create /
 * patch / delete against the Google Calendar REST API and persist the event map.
 *
 * Idempotent: a second call with no schedule change does nothing. A PATCH that
 * 404s (event deleted in Google) is retried as a create — the recovery the pure
 * diff intentionally defers to here.
 */
export async function pushJobSchedule(jobId: string): Promise<PushResult> {
  if (!googleOAuthConfigured()) return { ok: false, reason: "unconfigured" };

  const sb = getServiceRoleClient();
  const encKey = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!sb || !encKey?.trim()) return { ok: false, reason: "unconfigured" };

  const connection = await loadConnection();
  if (!connection) return { ok: false, reason: "not_connected" };

  const job = await loadJobForPush(jobId);
  if (!job) return { ok: false, reason: "job_not_found" };

  let refreshToken: string;
  try {
    refreshToken = decryptToken(connection.encrypted_refresh_token, encKey);
  } catch {
    return { ok: false, reason: "unconfigured" };
  }

  const env = readGoogleOAuthEnv();
  let accessToken: string;
  try {
    const tokens = await refreshAccessToken({ refreshToken, env });
    accessToken = tokens.access_token;
  } catch {
    return { ok: false, reason: "push_failed" };
  }

  const calId = encodeURIComponent(connection.calendar_id || "primary");
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const desired = buildJobCalendarEvents(job);
  const existing = await loadEventMap(jobId);
  const plan = diffCalendarSync(desired, existing);

  let created = 0;
  let updated = 0;
  let deleted = 0;

  try {
    // Creates.
    for (const ev of plan.toCreate) {
      const res = await fetch(`${CAL_API}/${calId}/events`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(eventBody(ev)),
      });
      if (!res.ok) throw new Error(`create ${res.status}`);
      const json = (await res.json()) as { id: string };
      await sb.from(SCHEDULING_GOOGLE_EVENTS_TABLE).upsert(
        {
          job_id: jobId,
          sync_key: ev.syncKey,
          google_event_id: json.id,
          synced_date: ev.date,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sync_key" }
      );
      created += 1;
    }

    // Updates (patch in place; recover a Google-side delete by recreating).
    for (const { event: ev, googleEventId } of plan.toUpdate) {
      const res = await fetch(`${CAL_API}/${calId}/events/${googleEventId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(eventBody(ev)),
      });
      if (res.status === 404 || res.status === 410) {
        // Deleted in Google — recreate.
        const recreate = await fetch(`${CAL_API}/${calId}/events`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(eventBody(ev)),
        });
        if (!recreate.ok) throw new Error(`recreate ${recreate.status}`);
        const json = (await recreate.json()) as { id: string };
        await sb
          .from(SCHEDULING_GOOGLE_EVENTS_TABLE)
          .update({
            google_event_id: json.id,
            synced_date: ev.date,
            updated_at: new Date().toISOString(),
          })
          .eq("sync_key", ev.syncKey);
      } else if (res.ok) {
        await sb
          .from(SCHEDULING_GOOGLE_EVENTS_TABLE)
          .update({ synced_date: ev.date, updated_at: new Date().toISOString() })
          .eq("sync_key", ev.syncKey);
      } else {
        throw new Error(`patch ${res.status}`);
      }
      updated += 1;
    }

    // Deletes (a removed target → remove its Google event + mapping).
    for (const { syncKey, googleEventId } of plan.toDelete) {
      const res = await fetch(`${CAL_API}/${calId}/events/${googleEventId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      // 404/410 = already gone in Google; treat as success.
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        throw new Error(`delete ${res.status}`);
      }
      await sb.from(SCHEDULING_GOOGLE_EVENTS_TABLE).delete().eq("sync_key", syncKey);
      deleted += 1;
    }
  } catch (e) {
    console.error("[scheduling/google] push failed:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "push_failed" };
  }

  return { ok: true, created, updated, deleted };
}
