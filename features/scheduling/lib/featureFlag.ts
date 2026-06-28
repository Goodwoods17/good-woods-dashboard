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

/**
 * P6 "dark-ship" sub-flag for the not-yet-live scheduling slices (S23+).
 *
 * P6 surfaces (one-way Google Calendar push, the P&L forecast, …) layer ON TOP
 * of the live scheduling feature, so they ride a SEPARATE switch:
 * `NEXT_PUBLIC_SCHEDULING_P6_ENABLED`. It is OFF in prod, so the live shop sees
 * nothing new from these slices until the owner flips it; dev/CI set it to
 * "true" so the Playwright smoke can exercise the gated surface.
 *
 * **Absent / not "true" = OFF.** Every new P6 route / nav item / panel / button
 * MUST be gated behind this helper (never behind `schedulingEnabled()` alone).
 */
export function schedulingP6Enabled(): boolean {
  return process.env.NEXT_PUBLIC_SCHEDULING_P6_ENABLED === "true";
}
