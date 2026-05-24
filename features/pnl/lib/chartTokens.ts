// Recharts SVG-rendered colors need static values — they're not CSS
// variable consumers like Tailwind classes. The actual palette lives in
// `shared/lib/chartPalette.ts`; this file re-exports the keys this
// feature uses so existing call sites keep working. Future surfaces
// should import from `@shared/lib/chartPalette` directly.
import { PALETTE } from "@shared/lib/chartPalette";

export const CHART_TOKENS = {
  accent: PALETTE.accent,
  accentDeep: PALETTE.accentDeep,
  border: PALETTE.border,
  borderFaint: PALETTE.borderFaint,
  surfaceMuted: PALETTE.surfaceMuted,
  textPrimary: PALETTE.textPrimary,
  textTertiary: PALETTE.textTertiary,
  onTrack: PALETTE.onTrack,
  atRisk: PALETTE.atRisk,
  blocked: PALETTE.blocked,
} as const;
