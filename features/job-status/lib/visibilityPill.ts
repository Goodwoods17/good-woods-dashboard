import type { Visibility } from "./types";

// Human-readable labels for the three visibility values — used in aria-labels
// and tooltips where space permits.
export const VISIBILITY_LABELS: Record<Visibility, string> = {
  owner: "Owner only",
  client: "Client",
  both: "Owner + Client",
};

// Compact labels for space-constrained badges (item rows, event chips).
export const VISIBILITY_SHORT_LABELS: Record<Visibility, string> = {
  owner: "Internal",
  client: "Client",
  both: "Both",
};

// Cycles owner → client → both → owner. One tap advances; third tap resets.
export function nextVisibility(v: Visibility): Visibility {
  if (v === "owner") return "client";
  if (v === "client") return "both";
  return "owner";
}

// True for any visibility value that a future client portal should render.
// "Both" is included because it means owner AND client can see it.
export function isClientFacing(v: Visibility): boolean {
  return v === "client" || v === "both";
}

// Tailwind class groups for visibility badges — muted for owner (default,
// unremarkable), amber for client-only, blue/accent for shared.
export type VisibilityTone = { bg: string; text: string };

export function visibilityTone(v: Visibility): VisibilityTone {
  switch (v) {
    case "owner":
      return { bg: "bg-surface-muted", text: "text-text-tertiary" };
    case "client":
      return { bg: "bg-amber-50", text: "text-amber-700" };
    case "both":
      return { bg: "bg-accent-soft", text: "text-accent" };
  }
}
