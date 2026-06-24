/** Normalized 0–1 geometry so pins/markup scale across zoom + device. Pure. */
export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function normalizePoint(
  offsetX: number, offsetY: number, width: number, height: number
): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return { x: clamp01(offsetX / width), y: clamp01(offsetY / height) };
}

export function denormalize(
  x: number, y: number, width: number, height: number
): { left: number; top: number } {
  return { left: x * width, top: y * height };
}
