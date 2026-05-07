# Auth (login flow)

The login page and the auth-gated UX. The actual auth machinery is
**shared infrastructure**, not a feature, because middleware, sidebar,
and every page depend on it — see "Where things live" for the split.

## What it does

- `/login` — email + password sign-in form. Posts to Supabase Auth via
  `useAuth().signIn`. On success, redirects to `?next=...` if present,
  otherwise `/`.
- The sidebar shows the signed-in user's email and a sign-out button.
- The Next.js `middleware.ts` enforces "must be signed in" for every
  route except `/login`. If `NEXT_PUBLIC_SUPABASE_URL` is unset, the
  gate is skipped (so fork-and-run / local dev works without setup).

## Where things live

This split is intentional:

- `shared/lib/authStore.tsx` — `AuthProvider`, `useAuth`,
  `getSupabase()`, the session listener. **Shared**, because it's
  imported by `Sidebar`, the root `layout.tsx`, and any page that needs
  the current user.
- `middleware.ts` (root) — server-side route gate. Uses
  `@supabase/ssr`'s `createServerClient` so it has access to cookies
  on the server. Independent of `authStore.tsx`, which is the
  client-side mirror.
- `src/app/login/page.tsx` — the form. Owned by this feature.

## Domain notes

- Single-user M1: there's exactly one signed-in user at any time. Roles
  / multi-user are explicitly punted (see README "What's still on the
  shelf"). Don't add role checks until that's a real requirement.
- The "no-Supabase fallback" path means the app must work end-to-end
  without auth env vars. If that ever stops being a goal (e.g. multi-
  tenant launch), update `middleware.ts` to fail closed instead.

## When to revisit

- Multi-role auth (designer, installer, owner) → add a `role` column to
  Supabase user metadata, gate destructive actions in settings.
- Magic-link or SSO instead of password → all the changes are inside
  `authStore.signIn` and the `/login` form; middleware is unaffected.
- Per-tenant data isolation → that's a much bigger change (RLS policies,
  workspace concept). Plan it as a real feature.
