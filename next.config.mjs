/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Branded portal domain (S13, ADR 0024) ───────────────────────────────────
  // The portal routes (/d, /f, /s) are accessible at both the main app domain
  // (good-woods-dashboard.vercel.app) and the branded alias (files.goodwoods.com).
  // The alias itself is wired in the Vercel dashboard (Project Settings → Domains);
  // no DNS or rewrite code is needed here because Vercel serves all routes at all
  // configured domain aliases. What WE own in code:
  //   1. The branded PortalBrand header on every portal page (anti-phishing identity).
  //   2. The `force-dynamic` / `force-no-store` export on every portal route so the
  //      CDN edge never caches a token page regardless of the serving domain.
  //   3. Belt-and-suspenders Cache-Control headers below — belt for Vercel's CDN,
  //      suspenders for any reverse proxy in front of it.

  async headers() {
    return [
      {
        // Portal paths: hard no-store at the CDN edge, whichever domain serves them.
        // This is belt-and-suspenders: the route files also carry `force-dynamic` +
        // `fetchCache = "force-no-store"`. Both together means a revoke takes effect
        // on the NEXT request with no stale-cache window.
        source: "/:path(d|f|s)/:token*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          // Prevent MIME-sniffing of the HTML page (defence-in-depth for the portal).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't let the portal page appear inside an iframe (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
