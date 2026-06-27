/**
 * Single feature flag for the Scheduling & Client-Commitment Engine
 * (milestone #7). Read from the build-time-inlined `NEXT_PUBLIC_SCHEDULING_ENABLED`
 * env so it gates BOTH the server route and client code from one switch.
 * **Absent / not "true" = OFF.**
 *
 * Per the milestone's mandatory constraint: prod stays dormant (flag absent)
 * until the owner flips it on after review; dev/test/CI set it to "true" so the
 * Playwright smoke can exercise the feature.
 */
export function schedulingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SCHEDULING_ENABLED === "true";
}
