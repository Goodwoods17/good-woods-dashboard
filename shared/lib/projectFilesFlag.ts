/**
 * Single feature flag for the Project Files & Sharing (Tier-2) milestone (#12) —
 * the generalized `share_tokens` registry, the document view/upload portals, and
 * the cross-link pins. Read from the build-time-inlined
 * `NEXT_PUBLIC_PROJECT_FILES_ENABLED` env so it gates BOTH the server routes and
 * client code from one switch. **Absent / not "true" = OFF.**
 *
 * Per the milestone's mandatory constraint (ADR 0022): prod stays dormant (flag
 * absent) until the owner flips it on AFTER review + applying the staged
 * migration; dev/test/CI set it to "true" so the Playwright smoke can exercise
 * the feature. It lives in `shared/lib` (not a feature folder) because the
 * `share_tokens` registry it gates is cross-feature shared infrastructure.
 *
 * Every new Project-Files route / nav item / panel / mint button MUST be gated
 * behind this helper.
 */
export function projectFilesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PROJECT_FILES_ENABLED === "true";
}
