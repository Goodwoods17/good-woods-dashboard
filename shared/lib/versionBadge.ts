import pkg from "../../package.json";

const BRAND = "Good Woods";

// The badge shows brand · vMAJOR.MINOR — patch noise is dropped so the footer
// stays compact and the marketing version stays in lockstep with package.json
// (the single source of truth) rather than a hand-edited string.
export function versionBadgeLabel(version: string | undefined = pkg.version): string {
  const [major = "0", minor = "0"] = (version ?? "").split(".");
  const safeMajor = /^\d+$/.test(major) ? major : "0";
  const safeMinor = /^\d+$/.test(minor) ? minor : "0";
  return `${BRAND} · v${safeMajor}.${safeMinor}`;
}
