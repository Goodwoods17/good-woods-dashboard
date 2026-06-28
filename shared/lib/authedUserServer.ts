/**
 * Server-only reader for the authenticated actor id (QBO-H5, issue #188).
 *
 * Route handlers run after the auth middleware, but the handler itself still
 * needs the *identity* (not just "is logged in") to write it onto the audit
 * trail. This reads the Supabase session out of the request cookies and returns
 * the user id, degrading to `null` when Supabase is unconfigured (fork-and-run /
 * local dev) so callers can keep working — the audit row simply records no actor.
 *
 * Never import from a client component.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { actorIdFromUser } from "./authedUserId";

/**
 * The authenticated user id for the current request, or `null` when there is no
 * session / Supabase is unconfigured. Pairs with `pushInvoiceBill` /
 * `voidInvoiceBill`'s `pushedBy` / `voidedBy` params.
 */
export async function getAuthedUserId(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const cookieStore = cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // Read-only: a route handler reading identity must not mutate cookies.
      setAll() {},
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return actorIdFromUser(user);
  } catch {
    return null;
  }
}
