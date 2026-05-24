// Recharts SVG-rendered colors need static values — they're not CSS
// variable consumers like Tailwind classes. Keep tokens in sync with
// app/globals.css visually, but understand they don't auto-theme.
export const CHART_TOKENS = {
  accent: "#B86F52",
  accentDeep: "#8F4F36",
  border: "#E2DFD9",
  borderFaint: "#ECE9E4",
  surfaceMuted: "#F4F2EE",
  textPrimary: "#1A1916",
  textTertiary: "#8B8782",
  onTrack: "#6B8E5C",
  atRisk: "#C99846",
  blocked: "#B5544C",
} as const;
