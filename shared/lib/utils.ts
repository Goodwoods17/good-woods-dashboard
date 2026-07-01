import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A best-effort unique id for client-created rows. Prefers the native
 * `crypto.randomUUID()` when available (all modern browsers + Node), falling
 * back to a timestamp+random id where it is not. App-code only — this is for
 * generating optimistic/local ids, never a security token (see
 * `generateCapabilityToken` for that). Matches the idiom that was copied inline
 * across the drawings feature.
 */
export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

// ADR 0022 — the single opaque-token generator now lives in its own module
// beside the loader (`capabilityLink.ts`). Re-exported here so the existing
// import site keeps working without churn.
export { generateCapabilityToken } from "./capabilityToken";
