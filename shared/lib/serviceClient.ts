import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The single lazy service-role Supabase client for the app's server-only paths
 * (tokenized share-link portals, etc.). Reads SUPABASE_SERVICE_ROLE_KEY — a
 * server-only env var, NEVER NEXT_PUBLIC_* — so this module MUST NEVER be
 * imported into a client component or anything that reaches the browser bundle.
 *
 * Returns null when either env var is missing so callers can degrade to a clean
 * "unconfigured" state rather than throw.
 */

let serviceClient: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js patches global fetch with its Data Cache; GET requests default to
      // `force-cache`. supabase-js issues its reads through fetch, so without this
      // the first load of a token (e.g. before the client submits) gets cached and
      // a later resume read serves the STALE answer — the saved checkbox comes back
      // unchecked, or a moved committed date reads its prior value. These reads are
      // inherently live (state behind a token), so opt every request out of the
      // cache.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return serviceClient;
}
