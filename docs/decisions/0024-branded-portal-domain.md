# 24. Branded portal domain

Date: 2026-06-30
Status: Accepted (lands with the S13 PR, milestone #12)

## Context

Three no-login capability-link portals serve external stakeholders — clients,
designers, and GCs — at routes they have no context for:

- `/d/<token>` — document view portal (S2, ADR 0022)
- `/f/<token>` — client form-fill portal (Forms P2)
- `/s/<token>` — client schedule portal (Scheduling S18)

All three live at the main app domain (`good-woods-dashboard.vercel.app`). This
domain has **zero external brand recognition**: a client receiving a link to
`good-woods-dashboard.vercel.app/d/…` sees a long opaque URL with a Vercel
subdomain — no visual reason to trust it. Industry research on link-based fraud
(phishing) consistently identifies the domain as the primary legitimacy signal;
the UI content only matters after the recipient decides to click.

Two additional concerns surface with the existing setup:

1. **Anti-phishing:** clients cannot distinguish a genuine Good Woods portal from
   a spoofed page at a lookalike domain, because the genuine domain is already
   non-obvious.
2. **Caching:** it is easy to add a CDN or proxy in front of a Vercel project
   later. Token pages must **never** be cached, regardless of what sits in front —
   a revoke must kill access on the very next HTTP request.

## Decision

### 1. Branded domain alias: `files.goodwoods.com`

Add `files.goodwoods.com` as a domain alias on the Vercel project (Project
Settings → Domains). Vercel serves all routes — including `/d`, `/f`, `/s` — at
every configured domain alias. The DNS record is a CNAME pointing to
`cname.vercel-dns.com`.

This is **infra-only**: no route rewrite, no new page, no structural code
change. The portal routes already work correctly at any domain Vercel serves the
project at.

**Why `files.goodwoods.com` and not a path under `www.spacecraftjoinery.com`?**
A path-based approach (e.g. `www.spacecraftjoinery.com/portal/…`) would require
proxying a separate Next.js app from a marketing site, adding significant
operational complexity for zero recipient benefit. A dedicated subdomain is the
standard Vercel pattern and keeps ops minimal.

**Why a subdomain of `goodwoods.com` and not `spacecraftjoinery.com`?**
`goodwoods.com` is shorter, already used in staff email, and the brand Andrew
uses with clients informally. Adjust as domain ownership dictates — this ADR
records the pattern, not the exact hostname. The canonical hostname is the
`PORTAL_BRANDED_DOMAIN` constant in `shared/lib/portalDomain.ts`.

### 2. Consistent branded header on all portal pages

A shared `PortalBrand` component (`shared/components/layout/PortalBrand.tsx`)
renders at the top of every public portal page and inactive state, providing:

- **Good Woods** wordmark (serif, matching the dashboard identity)
- A context subtitle ("Project documents", "File request", "Project schedule", or
  "Project form") so the recipient immediately understands what they're looking at
- `data-testid="portal-brand"` for e2e smoke verification

This replaces the per-page inline text headers that existed on the document and
schedule portals, and consolidates the existing inline branded header that Forms
had built independently — one pattern, six pages, zero duplication.

### 3. Hard no-cache at the edge — belt and suspenders

Every portal route already exports `dynamic = "force-dynamic"`. S13 adds two
further layers:

- `fetchCache = "force-no-store"` exported from each of `/d`, `/f`, `/s` route
  files — stops Next.js from hoisting any fetch result into the in-process cache.
- `next.config.mjs` `headers()` — emits `Cache-Control: no-store, max-age=0` +
  `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` for every portal
  path, regardless of which domain serves the request. This covers any proxy or
  CDN inserted later.

**The three layers together** mean a token revoke takes effect on the very next
HTTP request with no stale-cache window at the route, framework, or CDN layer.

### 4. No service-role secret exposure

No secret or service-role key is embedded in any response header, cookie, or
client-visible config. The branded domain is an alias, not a new backend. The
portal routes were already service-role server-side only (`import "server-only"`
on the service client); nothing changes there. A client hitting
`files.goodwoods.com/d/<token>` and a client hitting the main domain see exactly
the same server-rendered HTML.

## Consequences

- **Recipients see `files.goodwoods.com/d/<token>`** in their browser — a clear,
  short, branded URL that reads as legitimate and matches the "Good Woods" identity
  they already know.
- **No code duplication removed** — the `PortalBrand` extraction eliminates the
  one existing inline branded header from `PublicFillView`, with the three other
  portal pages gaining a consistent brand identity they lacked before.
- **Vercel dashboard step required** — the domain alias cannot be added in code
  (it requires Vercel project access and DNS control). This ADR is the signal to
  the owner to make that dashboard change when ready.
- **No migration** — purely infra + UI code. No schema change.
- **DNS TTL:** set the CNAME TTL to 5 minutes initially to make a domain change
  fast during stabilisation; raise to 1 hour once confirmed.
