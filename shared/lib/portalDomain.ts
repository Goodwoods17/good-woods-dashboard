// The canonical branded domain for all no-login capability-link portals.
// This constant is the single source of truth referenced by middleware,
// next.config rewrites, and the PortalBrand component's legitimacy notice.
// Changing the domain is a one-line edit here.
export const PORTAL_BRANDED_DOMAIN = "files.goodwoods.com";

// Public portal path prefixes — the only paths surfaced by the branded domain
// alias. The main app domain serves them too (auth-exempt in middleware); the
// branded domain is a Vercel domain alias that makes these paths addressable at
// a client-facing hostname (e.g. files.goodwoods.com/d/<token>).
export const PORTAL_PATH_PREFIXES = ["/d", "/f", "/s"] as const;

/**
 * Returns true when the `Host` header matches the branded portal domain.
 * Strips the port so it works in local dev (localhost:3000) and Vercel previews.
 */
export function isPortalBrandedHost(host: string): boolean {
  const hostname = host.split(":")[0];
  return hostname === PORTAL_BRANDED_DOMAIN;
}

/**
 * Returns true when a pathname is one of the public, no-login portal paths.
 * Mirrors the PUBLIC_ROUTES logic in middleware so both stay in sync.
 */
export function isPortalPath(path: string): boolean {
  return PORTAL_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
