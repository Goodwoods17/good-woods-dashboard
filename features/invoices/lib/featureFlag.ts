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
