// Recharts SVG-rendered colors need static values — they're not CSS
// variable consumers like Tailwind classes. Keep tokens in sync with
// app/globals.css visually, but understand they don't auto-theme.
export const CHART_TOKENS = {
  accent: "#B86F52",
  border: "#E8E4DD",
  surfaceMuted: "#F4F2EE",
  textPrimary: "#2B2926",
  textTertiary: "#9A968D",
  onTrack: "#6B8E5C",
  atRisk: "#C99846",
  blocked: "#B5544C",
} as const;
