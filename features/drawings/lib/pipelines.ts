import type { PieceKind } from "@shared/lib/types";

export const NOT_STARTED = "not_started";
export const DONE = "done";

export const CABINET_STAGES = [
  "cut", "assembled", "finished", "packed", "delivered", "installed", "final_adjustments",
] as const;
export const PART_STAGES = [
  "cut", "edgebanded", "sanded", "sprayed", "packed", "delivered", "installed", "final_adjustments",
] as const;

export const STAGE_PIPELINES: Record<PieceKind, readonly string[]> = {
  cabinet: CABINET_STAGES,
  end_panel: PART_STAGES,
  scribe: PART_STAGES,
  toe_kick: PART_STAGES,
  filler: PART_STAGES,
};

/** Full ordered lifecycle including the not_started/done bookends. */
export function lifecycle(kind: PieceKind): string[] {
  return [NOT_STARTED, ...STAGE_PIPELINES[kind], DONE];
}

export function nextStatus(kind: PieceKind, status: string): string | null {
  const lc = lifecycle(kind);
  const i = lc.indexOf(status);
  return i >= 0 && i < lc.length - 1 ? lc[i + 1] : null;
}

export function prevStatus(kind: PieceKind, status: string): string | null {
  const lc = lifecycle(kind);
  const i = lc.indexOf(status);
  return i > 0 ? lc[i - 1] : null;
}

export function progress(kind: PieceKind, status: string): { index: number; total: number } {
  const lc = lifecycle(kind);
  const i = lc.indexOf(status);
  return { index: i < 0 ? 0 : i, total: lc.length - 1 };
}

export function isCutTransition(kind: PieceKind, from: string, to: string): boolean {
  return to === "cut" && from !== "cut";
}

const LABELS: Record<string, string> = {
  not_started: "Not started", cut: "Cut", assembled: "Assembled", finished: "Finished",
  edgebanded: "Edgebanded", sanded: "Sanded", sprayed: "Sprayed", packed: "Packed",
  delivered: "Delivered", installed: "Installed", final_adjustments: "Final adjustments",
  done: "Done",
};
export function stageLabel(stage: string): string {
  return LABELS[stage] ?? stage;
}
