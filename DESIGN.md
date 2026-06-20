---
name: Good Woods Dashboard
description: Sharp, quiet, focused cabinet-shop dashboard. Pure-white canvas with whisper-warm glow, serif display, Lean visual management.
colors:
  background: "#FAFAF9"
  canvas-top: "#FFFFFF"
  canvas-foot-tint: "#F2EDE9"
  surface: "#FFFFFF"
  surface-muted: "#F4F2EE"
  surface-sunken: "#ECE9E4"
  border-faint: "#ECE9E4"
  border: "#E2DFD9"
  border-strong: "#CDC9C1"
  text-primary: "#1A1916"
  text-secondary: "#4F4D49"
  text-tertiary: "#8B8782"
  text-disabled: "#C4BFB6"
  accent: "#B86F52"
  accent-hover: "#A45F44"
  accent-active: "#8F4F36"
  accent-soft: "#F2E4DC"
  secondary: "#8B7355"
  secondary-soft: "#EDE7DD"
  status-on-track: "#6B8E5C"
  status-at-risk: "#C99846"
  status-blocked: "#B5544C"
  status-complete: "#7A8B6F"
  status-paused: "#9A968D"
  status-andon: "#D14D3F"
  status-on-track-soft: "#E8EFE3"
  status-at-risk-soft: "#F7EBD5"
  status-blocked-soft: "#F2DDDA"
  status-andon-soft: "#FADBD7"
  ink-pill: "#1A1916"
  trade-plumbing: "#2D8992"
  trade-countertop: "#3C84A2"
  trade-installer: "#547DAB"
  trade-electrical: "#6C75AF"
  trade-delivery: "#826FA5"
  trade-finisher: "#976796"
  trade-upholstery: "#A16580"
  trade-other: "#747B83"
typography:
  display:
    fontFamily: "Cormorant Garamond, Tiempos Headline, Georgia, serif"
    fontSize: "38px"
    fontWeight: 500
    lineHeight: "44px"
    letterSpacing: "-0.02em"
  display-italic:
    fontFamily: "Cormorant Garamond, Tiempos Headline, Georgia, serif"
    fontSize: "38px"
    fontWeight: 500
    lineHeight: "44px"
    letterSpacing: "-0.02em"
    fontStyle: "italic"
  headline:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: "30px"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: "24px"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter var, Inter, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "-0.01em"
  body-emphasis:
    fontFamily: "Inter var, Inter, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "22px"
    letterSpacing: "-0.005em"
  label:
    fontFamily: "Inter var, Inter, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.06em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink-pill}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-active}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  segmented-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "4px"
  segmented-pill-active:
    backgroundColor: "{colors.ink-pill}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
  status-badge-clay:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  status-badge-taupe:
    backgroundColor: "{colors.secondary-soft}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  status-badge-neutral:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  health-pill-on-track:
    backgroundColor: "{colors.status-on-track-soft}"
    textColor: "{colors.status-on-track}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  health-pill-at-risk:
    backgroundColor: "{colors.status-at-risk-soft}"
    textColor: "{colors.status-at-risk}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  health-pill-blocked:
    backgroundColor: "{colors.status-blocked-soft}"
    textColor: "{colors.status-blocked}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
---

# Design System: Good Woods Dashboard

## 1. Overview

**Creative North Star: "The Quiet Foreman"**

A workshop foreman who never raises his voice. He knows every job's state before you ask, points at what needs you today, and stays out of the way when nothing's wrong. The dashboard inherits that posture: a near-white canvas with a barely-there warm glow at the foot, cards that float on soft shadow with no visible borders, serif display type for character, the Lean status palette held in the warm corner of the wheel. The "Lit Workshop, lighter" register: pure white where it counts, a hint of clay warmth at the edges to anchor the brand, and sharp typographic precision throughout.

The system rejects the SaaS-dashboard reflex (data-table-with-coloured-pills, gradient KPI cards, identical card grids, sidebar-icon-and-chart admin shell). It also rejects the construction-trade safety palette (yellow/orange/alarm-red), cabinet-incumbent gray density (Mozaik, ProKitchen, Cabinet Vision), and Bootstrap admin-template anonymity. The two reference systems that ARE allowed to influence this one: **Claude desktop app** and **Apple Settings / iA Writer**. Sharp, native-feel software, with a single warm clay accent that says workshop without saying hard-hat.

Implementation discipline matches the visual restraint. Match aesthetic complexity to code complexity: this system is minimal, so the code should be precise. Vertical-fade alpha gradients (clay → transparent) carry visual energy on chart fills and capacity bars; pure colour fills don't show up anywhere they don't have to. Status colour appears as soft pills and small dots, not as surfaces. Motion is short, eased, and physical (120ms / 200ms / 320ms); the andon pulse is the one sustained animation in the entire product.

**Key Characteristics:**

- Pure-white canvas (#FAFAF9) with a whisper-warm glow at the foot
- No card borders by default; surfaces separate via shadow + tonal step
- Serif display (Cormorant Garamond) for headings, italic for emphasis; Inter for body and data
- Single clay accent (#B86F52), used as gradient fills more than as surface fills
- Lean status palette held: muted sage, warm amber, dusty red, soft moss, gray-paused, andon-red
- Dark pill CTAs (#1A1916), translucent segmented pills with backdrop-blur
- Vertical-fade alpha gradients carry the "transparent" energy purposefully
- Status visible at a glance from eight feet (the spec §4.1 contract)

## 2. Colors

A near-white canvas with a small set of warm-biased neutrals, one clay accent that lives mostly as gradient fade, and the Lean semantic palette held untouched. Every neutral leans warm (yellow/brown), never blue/gray. The clay accent is restrained: it shows up at full saturation only in tiny places (dots, gradient stops, soft-fill pills). The CTAs use ink (#1A1916), not clay, so the accent stays rare.

### Primary

- **Muted Clay** (`#B86F52`): the brand accent. Used at full saturation only in small surfaces (dots, the top stop of vertical-fade gradients, soft pills). Hover deepens to `#A45F44`, active to `#8F4F36`. Soft tint `#F2E4DC` for accent backgrounds on selected pills and chart overlays.

### Secondary

- **Warm Taupe** (`#8B7355`): the second-string neutral when clay would compete with status. Pipeline-stage badges that carry human-touch states (sold, installing). Soft tint `#EDE7DD`.

### Neutral

- **Canvas** (`#FAFAF9`): the page background. Near-white but with a faint warm cast. Reads as "premium paper" rather than "OS desktop white."
- **Canvas Top / Card Surface** (`#FFFFFF`): pure white. Used for cards floating on the canvas — the cards earn pure white because their elevation says "this content is the focus."
- **Canvas Foot Tint** (`#F2EDE9`): the warm-tinted base of the canvas's foot-glow gradient. Never used as a solid fill, always as the end stop of a vertical gradient.
- **Surface Muted** (`#F4F2EE`): subtle inset fills, hover affordances, table header rows.
- **Surface Sunken** (`#ECE9E4`): nested panels, demo-data badges, the lowest neutral allowed on a surface.
- **Border Faint** (`#ECE9E4`): row dividers inside cards, table grid lines. Rarely visible — keep it under 1px effective contrast.
- **Border** (`#E2DFD9`): the rare full border, used only on inputs and on the focus state of the segmented pill.
- **Border Strong** (`#CDC9C1`): input focus, emphasized divider.
- **Text Primary** (`#1A1916`): body and headings. Warm graphite, never pure black.
- **Text Secondary** (`#4F4D49`): supporting text, table cells.
- **Text Tertiary** (`#8B8782`): metadata, captions, table micro-labels.
- **Text Disabled** (`#C4BFB6`): the only neutral allowed to read as "absent."
- **Ink Pill** (`#1A1916`): used as background colour for primary CTA pills, segmented-pill active state, and dark chips. Same hex as text-primary; semantically separated because it's used as a surface, not as text.

### Status (Lean semantic palette)

Held from spec v0.2 §3.1 untouched. These are **semantic colours only** — never use `--status-blocked` for non-status purposes (destructive buttons use ink-pill or a dedicated destructive variant).

- **Muted Sage** (`#6B8E5C`) — `--status-on-track`. Health pill for on-track jobs. Soft fill `#E8EFE3`.
- **Warm Amber** (`#C99846`) — `--status-at-risk`. Soft fill `#F7EBD5`.
- **Dusty Red** (`#B5544C`) — `--status-blocked`. Soft fill `#F2DDDA`.
- **Soft Moss** (`#7A8B6F`) — `--status-complete`. Done and stowed, not a victory.
- **Soft Gray** (`#9A968D`) — `--status-paused`. Deliberately paused work.
- **Andon Red** (`#D14D3F`) — `--status-andon`. **The only loud colour.** Reserved for active andon alerts and critical safety. Soft fill `#FADBD7`. Pulses at 1200ms.

### Categorical (Trade) Palette

A small, **muted, cool-arc** palette that labels subtrade disciplines (installer,
finisher, etc.). It exists because trades are a *category* axis that must never be
confused with the *condition* (health) or *stage* (pipeline) axes. The whole
palette lives in the cool half of the wheel (hue 200–351), deliberately clear of
every warm reserved hue (red/andon ~28, clay ~45, taupe ~65, amber ~78, sage/moss
~135). Chroma is held low (~0.085, "other" near-neutral) so it reads quiet, never
as a Procore-style safety palette. Lightness is fixed at OKLCH L 0.58 so each dot
carries the same visual weight as a status dot. All clear WCAG non-text contrast
(≥3:1) on both the neutral pill (`surface-muted`) and white.

| Trade      | Token              | Hex       | OKLCH                |
| ---------- | ------------------ | --------- | -------------------- |
| Plumbing   | `--trade-plumbing`   | `#2D8992` | `oklch(0.58 .085 205)` |
| Countertop | `--trade-countertop` | `#3C84A2` | `oklch(0.58 .085 228)` |
| Installer  | `--trade-installer`  | `#547DAB` | `oklch(0.58 .085 252)` |
| Electrical | `--trade-electrical` | `#6C75AF` | `oklch(0.58 .090 276)` |
| Delivery   | `--trade-delivery`   | `#826FA5` | `oklch(0.58 .085 300)` |
| Finisher   | `--trade-finisher`   | `#976796` | `oklch(0.58 .090 327)` |
| Upholstery | `--trade-upholstery` | `#A16580` | `oklch(0.58 .085 351)` |
| Other      | `--trade-other`      | `#747B83` | `oklch(0.58 .015 252)` |

The list is **registry-driven** (Settings), so new trades get a hue from this arc
without a token rename. **Icon carries identity; colour carries the glance.** A
trade is always shown as a coloured dot **plus** a Lucide icon **plus** a text
label, so colour is never the sole signal and near-neighbour hues (the three blues)
stay unambiguous. Verified visually 2026-06-20.

### Named Rules

**The Foot-Glow Rule.** The canvas carries a vertical gradient: `#FFFFFF` at top, `#FAFAF9` at 60%, `rgba(184,111,82,0.04)` at the foot. The glow is invisible at first glance and only registers as warmth on second look. If it reads as "orange tint" at first look, it's too strong. Tune until ambiguous.

**The Rare-Accent Rule.** Clay (`#B86F52`) appears at full saturation on ≤5% of any visible surface. It carries dots, gradient top-stops, and soft-fill pills. It does NOT carry buttons (those use ink), surfaces, or large fills. The rarity is the point.

**The One Loud Red Rule.** Only `--status-andon` is allowed to be saturated. Every other status colour is muted on purpose. If a screen needs an "alert" red, ask whether it's actually an andon. If not, use `--status-blocked` and a soft background.

**The Warm-Neutral Rule.** Every neutral tints warm (yellow/brown), never blue/gray. If a designer-tool default would push the neutral toward `#F5F5F5` cool, that's wrong; the warm canvas tokens are the source of truth.

**The Off-Axis Categorical Rule.** Trade colours are the *one* sanctioned cool palette, and they earn the exception by staying off every semantic axis: only the categorical `--trade-*` tokens may use cool hues, only as small dots + icons (never fills, never text), and always paired with an icon + label. A trade colour must never be reused to mean a status, a stage, or an accent. If a new categorical need appears (not health, not pipeline), it draws from this arc; it does not mint a warm hue that competes with status.

## 3. Typography

**Display Font:** Cormorant Garamond (variable, with Tiempos Headline and Georgia fallbacks). A high-contrast transitional serif with elegant italic. Loaded via `next/font/google` at weights 400 and 500, with italic enabled. Display use only — headings, greetings, page titles, card heads.

**Body Font:** Inter (variable) with `system-ui, -apple-system, sans-serif` fallbacks. Carries body text, table cells, labels, button text, form copy. Loaded via `next/font/google` as already wired in the project.

**Mono Font:** JetBrains Mono, with `ui-monospace, monospace` fallback. Used for tabular numeric data (prices, percentages, job codes), inline code references, and a small amount of label microtext where alignment matters.

**Character:** A serif/sans pairing that reads as editorial but never as marketing. Cormorant Garamond carries the warmth and confidence of the brand; Inter carries the precision. Italic Cormorant is reserved for soft emphasis inside a greeting or section title ("Three *things* want you today") — never for full headings, never for body text.

### Hierarchy

- **Greeting** (Cormorant 500, 38px / 44px, -0.02em): the morning "Good morning, Andrew" line and any single-statement hero copy. Italic variant available for in-line emphasis on one or two words.
- **Headline** (Cormorant 500, 24px / 30px, -0.02em): page titles in `PageHeader`. Replaces the previous `text-2xl` Inter heading.
- **Title** (Cormorant 500, 18px / 24px, -0.01em): section headings within a page, card heads ("This week's hitlist", "Shop capacity this week").
- **Body emphasis** (Inter 500, 14px / 22px, -0.005em): row primary text, the "next step" sentence in a Hitlist row.
- **Body** (Inter 400, 14px / 22px, -0.01em): default body and table cells. Slightly tighter letter-spacing than web norm.
- **Secondary** (Inter 400, 13px / 20px, -0.005em): supporting text, table footnotes.
- **Caption** (Inter 400, 12px / 16px, -0.005em): metadata, microlabels.
- **Label** (Inter 500, 11px / 16px, +0.06em, uppercase): all-caps section dividers ("RECENT TRANSACTIONS"), eyebrow text, demo tags.
- **Mono** (JetBrains 400, 13px / 20px): prices, percentages, job codes, code references.

### Named Rules

**The Serif-Italic Rule.** Italic Cormorant carries emphasis on 1-2 words inside a greeting or section title. Never on whole headings, never on body, never on UI labels. The italic is a brushstroke, not a default.

**The Tabular Number Rule.** Every numeric value that aligns in a column (currency, percentages, dates, job codes) gets `font-variant-numeric: tabular-nums` via the `.tabular-nums` utility class. Proportional figures only on running prose.

**The Never-700 Rule.** Heading weight is 500 in the serif, 600 in the sans for table-headers / eyebrows. Anything heavier reads as shout. The system is quiet by design.

## 4. Elevation

The system separates surfaces via **soft shadows + tonal step**, not borders. Cards float on the canvas; the canvas itself is `#FAFAF9` and cards are `#FFFFFF`, so the tonal step is real but tiny (~1% lightness), and the shadow carries most of the visual lift. Borders appear in three places only: inputs (1px `--border`), the rare emphasized divider (`--border-strong`), and inside cards as row dividers at `rgba(26,25,22,0.05)`.

### Shadow Vocabulary

- **Resting** (`0 8px 22px -14px rgba(26,25,22,0.10)`): the default soft lift on a card at rest. Subtle but present.
- **Hover / Active** (`0 12px 30px -18px rgba(26,25,22,0.18)`): on draggable cards, the Hitlist hero card, and any surface that responds to focus. Deepens on interaction.
- **Floating** (`0 1px 2px rgba(26,25,22,0.04), 0 6px 18px -10px rgba(26,25,22,0.10)`): segmented pill, command palette base. A softer-but-multi-layered shadow.
- **Modal / Drawer** (`0 12px 32px -8px rgba(26,25,22,0.10), 0 4px 8px -4px rgba(26,25,22,0.06)`): true elevation. Reserved for modals, dropdowns, andon alerts.

### Named Rules

**The Ghost-Border Rule.** Surfaces don't get borders. They earn separation through tonal step (the canvas is `#FAFAF9`, the card is `#FFFFFF`) plus a soft shadow at rest. If a designer asks "should this card have a border?", the answer is no.

**The Hover-Earns-Lift Rule.** Resting shadows are soft. Hover, drag, and focus deepen the shadow by ~80% (resting `0.10` → hover `0.18` on the same offset). Don't introduce colour on hover; introduce lift.

**The Modal-Only-True-Elevation Rule.** The "Modal / Drawer" shadow vocabulary is reserved for genuinely lifted elements (modals, dropdowns, the andon banner). Cards don't get to use it; they stay at "Resting" or "Hover."

## 5. Components

Built on **shadcn/ui** primitives, tuned to the Quiet-Foreman register. Every interactive component carries default / hover / focus / active / disabled / loading / error states. Skeleton loaders mirror the final layout (no spinners over content). Empty states teach the next action with an icon + headline + guidance + primary button per spec §10.

### Buttons

- **Shape:** pill (`rounded-full`, 999px). The dark ink-pill is the primary affordance language. Rounded-md (6px) is reserved for compact secondary actions inside dense data surfaces.
- **Primary (Ink Pill):** `bg-ink-pill text-white` (`#1A1916` on white). Padding `8px 14px` default, `10px 18px` for hero CTAs. Hover deepens to `bg-accent-active` (`#8F4F36`) — the only place clay shows up on a button. Sizes: sm 30px / md 36px / lg 44px (shop-floor touch).
- **Secondary:** `bg-white text-text-primary` with no border, soft floating shadow. Hover deepens shadow + faint `bg-surface-muted`. Used for "Cancel" / "Back" / secondary actions.
- **Ghost:** `text-text-secondary` only. Hover `bg-surface-muted hover:text-text-primary`. The quietest button; used inside dense tables for row actions.
- **Destructive:** `bg-status-blocked text-white`. Hover deepens. Reserved for delete-with-confirm and irreversible destructive actions.
- **Focus:** `outline: 2px solid var(--accent); outline-offset: 2px;` applied globally to `:focus-visible`. Never `outline: none`.

### Segmented Pill (ViewToggle)

- **Style:** outer container is `bg-white/60 backdrop-blur(8px)` with the floating shadow vocabulary. Inner buttons are transparent; the active button gets `bg-ink-pill text-white` in a smaller inner pill.
- **Use:** Hitlist / Schedule / List / Kanban view toggle on `/`. Also used for any 2-4-way exclusive choice in the product.
- **Aria:** every button has `aria-pressed`.

### Inputs

- **Style:** `bg-white border border-border rounded-md`, padding `8px 12px`. Body text (14px).
- **Focus:** border shifts to `border-strong`, plus `ring-2 ring-accent-soft` glow. No bright outline.
- **Label:** always visible above the input. Placeholder-only labels are forbidden.
- **Search input:** carries a `<Search>` Lucide icon (16px) absolute-positioned 12px from the left edge.

### Cards / Containers

- **Corner style:** `rounded-xl` (14px) for primary cards, `rounded-lg` (10px) for compact panels.
- **Background:** `bg-white` always. Cards never use `bg-surface-muted` as their main background.
- **Border:** **none.** Cards earn separation through tonal step + shadow.
- **Shadow strategy:** Resting shadow by default; Hover shadow on interactive cards.
- **Internal padding:** 20px for primary cards (default), 14-16px for compact rows inside a card.
- **Nested cards forbidden.** If a card contains another card, restructure.

### Hitlist Row

- **Style:** `display: grid` with 5 columns (idx · main · health-dot · price · health-pill). Padding `12px 22px`. Top border `1px solid rgba(26,25,22,0.06)` between rows; the first row has no top border (it abuts the card head).
- **Index:** JetBrains Mono, 11px, tertiary text.
- **Step text:** Inter 500 (body emphasis), 13.5px primary text. Hover deepens to accent.
- **Blocker chip:** inline with the step text, see Status Badges below.
- **Health dot:** 8px circle, semantic colour.
- **Price:** JetBrains Mono, tabular-nums, with a tiny eyebrow underneath ("At risk", "Blocked", "Contracted") in 10px label-style.
- **Health pill:** see Health Pills below.

### Status Badges (pipeline)

- **Style:** colored dot (`h-1.5 w-1.5 rounded-full`) + uppercase label + soft fill background, pill radius. Padding `2px 8px`.
- **3-bucket pipeline color map** (spec §8.3 dual-axis preserved):
  - Neutral (`new`, `complete`): `bg-surface-muted text-text-secondary` + tertiary-gray dot.
  - Secondary taupe (`sold`, `installing`): `bg-secondary-soft text-secondary` + taupe dot. Human-touch stages.
  - Accent clay (`in_design`, `in_production`, `in_finishing`): `bg-accent-soft text-accent` + clay dot. Active making.
- **Anti-rule:** never use the green/amber/red health palette here. Pipeline is a *stage* axis; health is a *condition* axis. Mixing them muddies the eight-feet glance.

### Health Pills

- **Style:** colored dot + label, full-pill radius (`rounded-full`), `*-soft` background, matching text color. Padding `3px 9px`.
- **Values:** On Track (sage), At Risk (amber), Blocked (dusty red), Complete (moss), Paused (gray). Andon-soft red used only on dedicated andon alert banners.
- **Truth source:** values come from `deriveHealth(job)` in `features/jobs/lib/health.ts`. Manual override only preserves `paused`. The dashboard's dots and pills always reflect the rule, never a stale manual flag.

### Status Dot (primitive)

- A standalone colored dot used at the left edge of list rows (spec §4.1) and inline anywhere the health story needs to read at a glance.
- Sizes `sm` (6px) / `md` (8px) / `lg` (10px). Default `md`.
- Located at `shared/components/ui/StatusDot.tsx`.

### Trade Chip / Trade Pill

- **Style:** `bg-surface-muted` neutral pill (`rounded-full`, padding `4px 11px`), holding a `--trade-*` coloured dot (8px) + a Lucide icon (14px, same trade colour) + the trade label in `text-secondary`. Deliberately **quieter than a Health Pill**: trade colour rides the dot + icon, not a coloured soft-fill, because category must rank below condition in the eight-feet glance.
- **Icon = identity, colour = glance.** Always render all three (dot + icon + label); colour is never the sole signal, which keeps the three near-blue trades unambiguous and satisfies WCAG.
- **Suggestion variant:** transparent with a `1px dashed --border`, leading `+`, for the tap-to-add strip on the Trades card.
- **Trade-line row** (on `/jobs/[id]`): dot + icon + trade label, then the assigned subtrade name (`text-secondary`) or `TBD — tap to assign` (`text-tertiary`, italic). Baseline-aligned, top divider `rgba(26,25,22,0.06)`.
- Colours come from the registry, mapped through `--trade-*`. Never hardcode a trade hue inline.

### Margin Cell

- **Style:** colored dot + tabular-num percentage + optional label ("Healthy" / "Tight" / "Below floor").
- **Thresholds:** ≥30% on-track sage; 20–30% at-risk amber; <20% blocked dusty-red.
- **Voice:** plain shop English. Never "Class A" or "Tier 1."

### Charts (vertical-fade gradient fills)

- **Line + area:** the area below the line uses a vertical alpha gradient: `clay → transparent` (`stop-opacity: 0.45 → 0`). The line itself sits on top at `accent-active` (`#8F4F36`) at 1.5px stroke. The endpoint carries a 3px filled circle in the same color.
- **Capacity / progress bars:** horizontal gradient inside the bar: `clay(0.35) → clay(0.95)` left to right. Background of the bar track is `rgba(26,25,22,0.06)`. At-risk thresholds switch to `amber(0.35 → 0.95)`; over-capacity to `blocked(0.35 → 1.0)`.
- **Sparkline:** same vertical-fade fill, no axis labels, no grid. The number above the sparkline carries the actual value.

### Page Header

- **Style:** `padding 28px 34px 0`. Title is Cormorant Garamond 500, 38px greeting or 24px headline depending on surface. Subtitle is 13px secondary, tabular-nums for numeric tokens. Action region (right-aligned) holds the segmented pill and the primary CTA.
- **No bottom border.** The header bleeds into the page; the next surface (a card) provides visual separation via shadow.

### Demo Tag

- **Style:** tiny chip beside a blocker label. `bg-surface-sunken text-text-tertiary`, padding `0 4px`, font-size 9px uppercase, letter-spacing 0.04em. Reads "demo."
- **When:** any time a value is rendered from synthetic data (currently `BLOCKER_IS_SYNTHETIC = true` in `features/jobs/lib/blockers.ts`). When real fields land, drop the flag and the tags vanish.

## 6. Do's and Don'ts

### Do:

- **Do** use the foot-glow on every page-level canvas (`linear-gradient(180deg, #FFFFFF 0%, #FAFAF9 60%, rgba(184,111,82,0.04) 100%)`). It's the brand signature.
- **Do** float cards on shadow with no borders. Pure white cards on the `#FAFAF9` canvas; resting shadow carries the lift.
- **Do** use Cormorant Garamond 500 for all headings and the greeting. Italic only on 1-2 emphasis words inside a heading.
- **Do** use dark ink pills (`#1A1916`) for primary CTAs. Clay accent is reserved for hover state, dots, gradient stops, and soft-fill pills.
- **Do** put a colored status dot at the left edge of every list-view row (spec §4.1). The eight-feet glance test is the design contract.
- **Do** render charts with vertical-fade alpha gradient fills (`clay → transparent`). It's the brand's transparency vocabulary, used purposefully.
- **Do** render capacity / progress bars with horizontal gradient fills (`clay(0.35) → clay(0.95)`). Same vocabulary, different axis.
- **Do** use `tabular-nums` on every numeric value that aligns in a column.
- **Do** ensure 44×44px touch targets on shop-floor and install screens.
- **Do** flag synthetic data with the `demo` tag. When real data lands, the flag goes away.
- **Do** keep heading weight at 500 (Cormorant) / 600 (Inter all-caps labels). Never 700+.

### Don't:

- **Don't** add borders to cards. The Ghost-Border Rule applies system-wide. Borders are reserved for inputs, the rare emphasized divider, and inside-card row dividers at `rgba(26,25,22,0.05)`.
- **Don't** use the warm clay accent at full saturation on a surface (button background, card fill, banner). Clay shows up at full saturation only on small surfaces — dots, gradient top-stops, soft-fill pills. **The Rare-Accent Rule.**
- **Don't** turn the foot-glow into an obvious orange band. If it reads as "orange tint" at first glance, it's too strong. Tune until ambiguous.
- **Don't** use Cormorant Garamond for body, labels, buttons, table cells, or anything that isn't a heading or greeting.
- **Don't** use italic Cormorant on whole headings. Italic is for 1-2 emphasis words inside a heading.
- **Don't** use bright safety-green / safety-yellow / alarm-red. The status palette is muted sage / warm amber / dusty red on purpose. Only `--status-andon` is allowed to be loud, and only during active andon alerts. (PRODUCT.md anti-reference: construction-trade safety palette.)
- **Don't** use `border-left` or `border-right` greater than 1px as a coloured stripe. Use full borders, background tints, leading dots, or nothing.
- **Don't** use gradient text. Use a solid color and weight.
- **Don't** reuse a `--trade-*` colour to mean a status, stage, or accent, or give a trade a coloured soft-fill pill. Trade colour is a cool-arc, dot-plus-icon category cue only. **The Off-Axis Categorical Rule.**
- **Don't** ship glassmorphism as default — purposeful translucency (the segmented pill, ambient glows) only. The remaining surfaces are solid.
- **Don't** stack two information architectures on the same view (e.g., AI briefing card AND flat data list competing for the same eye). Pick one focal point. (Open issue today on `/`.)
- **Don't** use display fonts for UI labels, buttons, or data. Cormorant is for headings only; Inter does everything else.
- **Don't** reinvent standard affordances for flavor (custom scrollbars, weird form controls, non-standard modals).
- **Don't** ship a Salesforce/NetSuite/ServiceNow data-table-with-pills aesthetic. (PRODUCT.md anti-reference: generic enterprise SaaS.)
- **Don't** ship a Mozaik/Cabinet Vision/ProKitchen gray slab UI. (PRODUCT.md anti-reference: cabinet-industry incumbents.)
- **Don't** ship a Procore/BuilderTrend safety-coloured construction-trade aesthetic. (PRODUCT.md anti-reference: construction-trade apps.)
- **Don't** ship a Bootstrap-admin / AdminLTE off-the-shelf shell. (PRODUCT.md anti-reference: bootstrap admin templates.)
- **Don't** show a hero-metric KPI card. KPIs live as header subtitles or as compact stats inside a card, not as big-number-with-gradient blocks.
- **Don't** reach for a modal as the first answer. Exhaust inline / progressive disclosure first.
- **Don't** introduce new tokens. This document is canonical. New requirements update this document; this document updates the tokens.
