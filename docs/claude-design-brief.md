# Good Woods — Claude Design guardrail brief

Paste this into Claude Design's chat at the start of a project, _after_ linking
the repo (root) so it has auto-extracted your tokens. Tokens give it the
palette and type; this gives it the taste rules the extractor won't infer.
Source of truth is `DESIGN.md` + `PRODUCT.md` — if they change, update this.

---

**North star — "The Quiet Foreman":** a near-white canvas with a whisper-warm
clay glow, serif display type, the Lean status palette, sharp and quiet.
Allowed influences: the Claude desktop app and Apple Settings / iA Writer.
Native, precise software with a single warm accent.

**Tokens (already in tailwind.config.ts / DESIGN.md, restated for safety):**

- Canvas `#FAFAF9`; cards pure white `#FFFFFF`. Every neutral leans warm —
  never blue/gray.
- One accent: clay `#B86F52` (hover `#A45F44`, active `#8F4F36`, soft `#F2E4DC`).
- Display type: Cormorant Garamond 500 (serif), headings only. Body/UI: Inter.
  Numbers: JetBrains Mono, tabular.
- Status palette, all muted: sage on-track, amber at-risk, dusty-red blocked,
  moss complete, gray paused, andon-red.

**Non-negotiable rules (this is what a generic AI tool gets wrong):**

1. **No borders on cards.** Surfaces separate via soft shadow + tonal step.
   Borders only on inputs and rare emphasized dividers.
2. **Rare-Accent:** clay at full saturation on ≤5% of any surface — dots,
   gradient top-stops, soft-fill pills. Never as a button/card/banner fill.
3. **CTAs are dark ink pills `#1A1916`, not clay.** Clay only on hover.
4. **No bright safety green/yellow/alarm-red.** Status colors stay muted.
   Only andon-red may be loud, and only on active alerts.
5. **No hero KPI cards** / big-number-gradient blocks. KPIs live as header
   subtitles or compact stats inside a card.
6. **Serif (Cormorant) for headings only.** Inter does everything else.
   Italic serif only on 1–2 emphasis words inside a heading.
7. **Foot-glow** gradient on the page canvas, so subtle it's ambiguous — never
   an obvious orange band.
8. No gradient text. No glassmorphism by default. No custom scrollbars or
   reinvented form controls.
9. Build on **shadcn/ui** primitives.
10. Pill-shaped buttons (`rounded-full`). Primary cards `rounded-xl` (14px).

**Do NOT look like:** generic enterprise SaaS (Salesforce/NetSuite/ServiceNow),
cabinet incumbents (Mozaik/Cabinet Vision/ProKitchen), construction-trade safety
apps (Procore/BuilderTrend), or Bootstrap/AdminLTE admin templates.

---

When the design is ready, use **Export → handoff bundle** and pass it to Claude
Code (this repo) with one instruction. I'll implement it on-brand and commit.
