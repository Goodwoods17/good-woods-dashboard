/**
 * Single feature flag for the Invoices milestone (#4). Read from the
 * build-time-inlined `NEXT_PUBLIC_INVOICES_ENABLED` env so it gates BOTH the
 * server route and client code from one switch. **Absent / not "true" = OFF.**
 *
 * Per the feature spec's mandatory overnight-build constraints: prod stays
 * dormant (flag absent) until the owner flips it on after review; dev/test/CI
 * set it to "true" so the Playwright smoke can exercise the feature.
 */
export function invoicesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_INVOICES_ENABLED === "true";
}

/**
 * "Dark-ship" sub-flag for the QuickBooks Online sync slices (QBO S1+, issue
 * #147). The QBO connection surfaces (Connect QuickBooks settings panel, the
 * `/api/invoices/qbo/*` OAuth routes) ride a SEPARATE switch
 * `NEXT_PUBLIC_INVOICES_QBO_ENABLED`, OFF in prod until the owner flips it; CI
 * sets it "true" so the Playwright smoke can exercise the gated panel.
 *
 * **Absent / not "true" = OFF.** Every new QBO route / panel MUST be gated
 * behind this helper (never behind `invoicesEnabled()` alone).
 */
export function invoicesQboEnabled(): boolean {
  return process.env.NEXT_PUBLIC_INVOICES_QBO_ENABLED === "true";
}
