/**
 * Canonical SVG-safe hex palette for Good Woods.
 *
 * **Why this exists:** Recharts (charts) and @react-pdf/renderer (invoice
 * PDFs) both render in SVG-or-canvas contexts that can't read the CSS
 * variables defined in `src/app/globals.css`. They need literal hex
 * strings. This file is the single source of truth for those hex copies.
 *
 * Keep these values in sync with `globals.css` when the palette shifts.
 * The current values reflect the "Lit Workshop, lighter" direction
 * locked 2026-05-24 (DESIGN.md). When `globals.css` changes, update this
 * file in the same commit and grep for any inline hex usages that
 * should also migrate.
 *
 * Consumers (as of 2026-05-24):
 *  - `features/pnl/lib/chartTokens.ts` (re-exports a subset)
 *  - `features/reports/components/ReportsView.tsx`
 *  - `features/jobs/components/invoice/InvoiceDocument.tsx`
 */
export const PALETTE = {
  // Canvas + surfaces
  background: "#FAFAF9",
  canvasTop: "#FFFFFF",
  canvasFootTint: "#F2EDE9",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F2EE",
  surfaceSunken: "#ECE9E4",

  // Borders
  borderFaint: "#ECE9E4",
  border: "#E2DFD9",
  borderStrong: "#CDC9C1",

  // Text (warm graphite, never pure black)
  textPrimary: "#1A1916",
  textSecondary: "#4F4D49",
  textTertiary: "#8B8782",
  textDisabled: "#C4BFB6",

  // Accent — muted clay
  accent: "#B86F52",
  accentHover: "#A45F44",
  accentActive: "#8F4F36",
  accentDeep: "#8F4F36",
  accentSoft: "#F2E4DC",

  // Secondary — warm taupe
  secondary: "#8B7355",
  secondaryHover: "#75614A",
  secondarySoft: "#EDE7DD",

  // Ink pill — primary CTA background (same hex as text-primary, semantically distinct)
  inkPill: "#1A1916",

  // Status — Lean visual management (held from spec §3.1)
  onTrack: "#6B8E5C",
  atRisk: "#C99846",
  blocked: "#B5544C",
  complete: "#7A8B6F",
  paused: "#9A968D",
  andon: "#D14D3F",

  // Status soft fills
  onTrackSoft: "#E8EFE3",
  atRiskSoft: "#F7EBD5",
  blockedSoft: "#F2DDDA",
  andonSoft: "#FADBD7",
} as const;

export type PaletteKey = keyof typeof PALETTE;
