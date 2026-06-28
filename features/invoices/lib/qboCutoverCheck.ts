/**
 * Pure, I/O-free helpers for QBO S12 — sandbox→production cutover readiness
 * check (issue #158). No Supabase, no QBO API, no React.
 *
 * Reads environment variables directly so the checklist reflects the current
 * deployment. All inputs are injectable via overrides so the function is fully
 * unit-testable without mutating process.env.
 */

import { readQboEnvironment, type QboEnvironment } from "./qboOAuth";

export type CutoverCheckItem = {
  /** Short label shown in the checklist. */
  label: string;
  /** True when this item is satisfied. */
  pass: boolean;
  /** One-line detail / what to set. */
  detail: string;
};

export type CutoverReadiness = {
  /** The QBO environment this deployment targets (sandbox | production). */
  environment: QboEnvironment;
  /** True only when the deployment is fully wired for production QBO traffic. */
  ready: boolean;
  /** Per-item breakdown for display / logging. */
  items: CutoverCheckItem[];
};

type CutoverEnvInput = {
  QBO_ENVIRONMENT?: string;
  QBO_OAUTH_CLIENT_ID?: string;
  QBO_OAUTH_CLIENT_SECRET?: string;
  QBO_TOKEN_ENC_KEY?: string;
  NEXT_PUBLIC_INVOICES_QBO_ENABLED?: string;
};

/**
 * Assess whether the current deployment is ready for production QBO traffic.
 *
 * Accepts optional `overrides` (injectable for unit tests) so production.env
 * values are never required in the test environment.
 */
export function checkCutoverReadiness(overrides: CutoverEnvInput = {}): CutoverReadiness {
  const get = (key: keyof CutoverEnvInput): string | undefined =>
    key in overrides ? overrides[key] : process.env[key];

  const environment = readQboEnvironment(get("QBO_ENVIRONMENT"));
  const clientId = get("QBO_OAUTH_CLIENT_ID");
  const clientSecret = get("QBO_OAUTH_CLIENT_SECRET");
  const encKey = get("QBO_TOKEN_ENC_KEY");
  const qboFlag = get("NEXT_PUBLIC_INVOICES_QBO_ENABLED");

  const credsPresent = Boolean(clientId?.trim() && clientSecret?.trim());
  const encKeyPresent = Boolean(encKey?.trim());
  const isProduction = environment === "production";
  const flagEnabled = qboFlag === "true";

  const items: CutoverCheckItem[] = [
    {
      label: "QBO_OAUTH_CLIENT_ID + QBO_OAUTH_CLIENT_SECRET set",
      pass: credsPresent,
      detail: "Add the production app client id and secret to Vercel env vars",
    },
    {
      label: "QBO_TOKEN_ENC_KEY set (32-byte hex key)",
      pass: encKeyPresent,
      detail: "Generate a fresh key for prod: openssl rand -hex 32",
    },
    {
      label: "QBO_ENVIRONMENT=production",
      pass: isProduction,
      detail:
        `Currently targeting: ${environment}. ` +
        'Set QBO_ENVIRONMENT=production in Vercel env vars and redeploy.',
    },
    {
      label: "NEXT_PUBLIC_INVOICES_QBO_ENABLED=true",
      pass: flagEnabled,
      detail: "Flip the QBO feature flag on in Vercel prod and redeploy",
    },
  ];

  return {
    environment,
    ready: credsPresent && encKeyPresent && isProduction && flagEnabled,
    items,
  };
}
