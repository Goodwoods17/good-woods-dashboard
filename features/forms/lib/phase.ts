import type { FormPhase } from "@shared/lib/types";

/** Display labels for the form phase tag (issue #32). Null = unphased. */
export const FORM_PHASE_LABELS: Record<FormPhase, string> = {
  design: "Design",
  cnc_cut: "CNC / Cut",
  assembly: "Assembly",
  finishing: "Finishing",
  delivery: "Delivery",
  install: "Install",
};

export function formPhaseLabel(phase: FormPhase | null): string {
  return phase ? FORM_PHASE_LABELS[phase] : "Unphased";
}
