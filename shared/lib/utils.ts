import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ADR 0022 — the single opaque-token generator now lives in its own module
// beside the loader (`capabilityLink.ts`). Re-exported here so the existing
// import site keeps working without churn.
export { generateCapabilityToken } from "./capabilityToken";
