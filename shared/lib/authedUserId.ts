/**
 * Pure, I/O-free resolver for the authenticated actor id (QBO-H5, issue #188).
 *
 * Kept free of `next/headers` / Supabase so it can be unit-tested directly; the
 * server reader that actually pulls the user off the request cookies lives in
 * `authedUserServer.ts` and delegates the final mapping to this function.
 */

/** Minimal shape we read off a Supabase auth user (just the stable id). */
export type ActorUser = { id?: string | null } | null | undefined;

/**
 * Resolve the audit actor id from a Supabase user. Returns the user id for an
 * authenticated request, or `null` for an unauthenticated / cron-triggered one
 * (an empty-string id is treated as absent so we never store `""` as an actor).
 */
export function actorIdFromUser(user: ActorUser): string | null {
  const id = user?.id;
  return id ? id : null;
}
