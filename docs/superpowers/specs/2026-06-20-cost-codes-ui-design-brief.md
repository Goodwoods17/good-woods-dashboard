# Cost Codes & Live Job Costing — UI Design Brief (impeccable `shape`)

- **Date:** 2026-06-20
- **Status:** Draft brief — **awaiting Andrew's confirmation** (shape's gate). Produced autonomously against PRODUCT.md, DESIGN.md, and the costing spec while Andrew was out.
- **Companion to:** `docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md` (the engineering spec). This brief covers only the **visual/UX** of the build phases P4 (Job Budget-vs-Actual tab + views E/B/C), P5 (views A/D + `/pnl` rollup).
- **Scope note:** design planning only — no code. It guides P4–P5 when their schema (P1–P3) lands.

---

## 1. Feature summary

The surfaces that let Andrew see, mid-job, whether a job is making money — and where it's leaking — so he can act *this shift*, not at month-end. Two homes: a **Budget-vs-Actual tab** on `/jobs/[id]` (the centerpiece, with five switchable timeline lenses) and an **open-jobs rollup** band on `/pnl`. Audience: Andrew, one user, at his desk with coffee and thumbed on his phone in the truck.

## 2. Primary user action

**Read the job's money-state in one glance, then drill to the leak.** The tab answers one question — *"are we on track to make money on this job, and if not, which phase is bleeding?"* The **projected-margin verdict** (a sage/amber/red number) plus the default timeline marker answer it before Andrew focuses; everything else (view switcher, phase table, "Log actual cost") is periphery. This is PRODUCT.md principle 1 (status-at-a-glance) and principle 2 (one primary action) applied literally — the eight-feet glance test is the audit.

## 3. Design direction

- **Color strategy: Restrained** (the product floor), with the project's **semantic status tones doing the one job that carries meaning** — `status-on-track` (sage #6B8E5C) / `status-at-risk` (amber #C99846) / `status-blocked` (red #B5544C) for the margin verdict and variance. The terracotta **accent** (#B86F52) marks the *actual* series and the active view-switcher tab; **budget** renders as a neutral hairline/ghost (`border-strong` / `text-tertiary`), so actual-vs-budget reads as "coloured line crossing a quiet reference," never two competing colours.
- **Theme: light.** Scene sentence: *"Andrew, mid-morning at his shop desk with coffee, glancing at one open job to decide whether to change how he runs today's shift — and again on his phone in the truck between sites, in daylight."* Forces the existing warm-whisper light canvas, calm density, real mobile.
- **Anchor references:** Claude desktop (warm parchment surfaces, Inter at tuned sizes, short physical motion), Apple Settings / iA Writer (native calm density), and Linear (the product-fluent dense-table idiom for the phase breakdown). **Explicitly not** Procore/BuilderTrend (no safety-amber alarm palette — our amber is a *tone*, used small), not the SaaS hero-metric KPI card, not Mozaik gray slabs.
- **Inherits the shipped idiom verbatim:** `recharts` AreaChart with a vertical accent→transparent gradient and an endpoint-only dot, hairline/hidden axes, white tooltip with `border` + soft shadow (see `features/pnl/components/MarginChart.tsx`); section cards `bg-surface rounded-2xl shadow-resting p-5/6`; `font-serif text-title` headings; **stat-strips (label-over-`font-mono` tabular value), never hero KPI cards** (see `StatStrip.tsx`); chart colours from `@shared/lib/chartPalette`.

## 4. Scope

Production-ready; the whole Budget-vs-Actual tab + the `/pnl` band (a surface, not one screen); shipped-quality interactive components; polish-until-it-ships. Task-scoped — does not persist to PRODUCT.md/DESIGN.md.

## 5. Layout strategy — the Budget-vs-Actual tab

A single column inside the existing `/jobs/[id]` tab frame, three stacked zones, emphasis front-loaded:

1. **Verdict header (the lead).** A stat-strip register (reusing the `StatStrip` pattern): **Projected margin $ + %** (toned sage/amber/red) · **vs quoted** (the drift, e.g. "▼ 6 pts") · **Clawback** ($ to hit the bid) · a quiet **"as of today"** stamp. No hero card; this is the same thin label-over-mono-value rail the P&L header already uses, so the two pages rhyme.
2. **The timeline (the visual).** A `bg-surface rounded-2xl shadow-resting` card holding the **view switcher** (segmented control, terracotta active tab, matching `LabourView`'s tab nav) above the active lens. Default lens = **E (milestone lane)**. The card title is `font-serif` ("Where this job stands") with the active-view name as a quiet subtitle.
3. **The phase table (the drill).** A Linear-dense table below: one row per phase (Design…Install), columns **Budgeted · Actual · Variance · %**, variance toned (over = red text, under = sage), values `font-mono tabular-nums`. Rows **expand to their cost codes** (labour) on click; a driven code shows inline quantity progress ("18 / 40 sheets"). A periphery **"Log actual cost"** button sits in the table header, right-aligned.

Rhythm: generous space around the verdict + chart (they're the glance), denser in the table (Andrew opts into detail). Vary spacing — no uniform card stack.

### The five lenses (all over one dataset; re-expressed in the shipped idiom)

| Lens | Build | Notes |
|---|---|---|
| **E · Milestone lane** *(default)* | Custom SVG/flex track like `MilestonesStrip` — Sold→Install dots, "you are here" marker, a sage/amber/red variance chip per completed phase | The glance view; reuses the milestone strip's visual language so it feels native to the job page |
| **A · Burn-up** | `recharts` AreaChart — cumulative actual (accent line + gradient, endpoint dot, exactly `MarginChart`'s treatment) over a ghost-hairline budget reference, vertical "today" rule | Reuses MarginChart wholesale; budget line is `border-strong` dashed |
| **D · Projection cone** | `recharts` — stacked labour/material actual area + a dashed run-rate cone to install; cone tinted `status-blocked-soft` if projected over | The forward-looking lens |
| **B · Phase bars** | CSS/flex horizontal bars (not recharts) — actual fill in status tone, budget as a tick; grey = not started | Fastest "which phase bleeds"; pairs with the table below |
| **C · Pace + margin** | Custom SVG arc gauge (budget used vs time elapsed) + the projected-margin number echoed large-ish (still mono, not a hero card) | The at-a-glance verdict lens |

## 6. Key states

- **Default (live):** budget set, some actuals in — the full verdict + lens + table.
- **No budget yet:** job saved without a coded estimate. Empty state *teaches*: "No budget on this job yet. Save it from an estimate to set the baseline, or add codes here." with a primary "Add budget" affordance. Not "no data."
- **Budget, no actuals yet:** verdict shows "On budget (nothing logged)"; timeline shows the budget reference flat; table shows budget with `—` actuals. Teach: "Start a timer on /labour tagged to this job to see actuals here."
- **Over budget / at risk:** verdict toned amber/red; the leaking phase's row + its chip carry the tone; the clawback figure is the call to action. Never an alarm-red wash — tone is in the number and the chip, on the warm canvas.
- **Unbudgeted task present:** flagged distinctly (an "unbudgeted" tag on the row), so scope-creep reads differently from a budget overrun (per spec §6 / change-order decision).
- **Phase closed / job complete:** closed phases lock to actual (a subtle "closed" affordance); a complete job shows the final, not projected, margin.
- **Loading:** skeleton rows in the table + a skeleton chart block (no centre spinner — product.md).
- **Error:** inline, `formatError`-backed, never `[object Object]` (matches the jobs/labour stores' pattern).

## 7. Interaction model

- **View switcher:** click a segment → crossfade the lens (150–250ms, state-conveying, `prefers-reduced-motion` → instant). The verdict header stays put across lenses (it's the constant answer).
- **Phase row:** click to expand/collapse its codes (chevron affordance, height/opacity transition). Keyboard-operable; 44px touch targets for the truck/tablet.
- **Log actual cost:** opens an **inline panel or native `<dialog>`/popover (not a heavy modal)** — fields: amount (`formatCAD`), kind (material / subtrade), partner (Supplier/Subtrade picker from Partners), phase + optional code, date, note. Save → optimistic insert, the verdict + timeline recompute live.
- **Driven-code progress:** the inline "18 / 40 sheets" is read-only here; quantity is captured on the `/labour` timer Stop (P2), not re-entered.
- **Mobile:** the verdict strip wraps (as `StatStrip` already does); the switcher becomes a horizontally-scrollable segmented control or a select; the table collapses to phase cards with the same four numbers. Structural responsive, not fluid type.

## 8. Content requirements

- **Margin states in shop-plain voice** (PRODUCT.md): *Healthy / Tight / Below floor* tones, not "Class A/B/C." Verdict copy: "Projected margin 24% — Tight" / "On track" / "Below floor".
- **Clawback line:** "$2,900 to hit your bid" — specific number + verb-shaped. No buzzwords.
- **Empty/teaching copy** as in §6 — each teaches the next action.
- **No em dashes in shipped copy** (matches the briefing prompt's own hard rule). Verb+object buttons: "Log actual cost", "Add budget", "Mark phase closed".
- **`/pnl` band copy:** "Open jobs" heading; a "margin at risk" total as a stat-strip item; per-row "▼ N pts vs quote".
- Numbers always `font-mono tabular-nums`; money always `formatCAD`; percentages `formatPct`.

## 9. `/pnl` open-jobs rollup (P5)

A band **above** the existing month chart, not a replacement: a `font-serif` "Open jobs" heading, then a quiet table — Project · Quoted · Projected cost · **Projected margin** (toned) · vs-quote drift — each row a deep-link to that job's Budget-vs-Actual tab. One stat-strip item leads: **"$X margin at risk across N open jobs."** The month chart gains a **dashed accent extension** for in-progress months' projected margin (solid = booked), reusing the `MarginChart` series treatment. No new card type; it sits in the same `rounded-2xl shadow-resting` surface vocabulary.

## 10. Recommended impeccable references for the build

- `layout.md` — the three-zone tab + the dense phase table rhythm.
- `animate.md` — the lens crossfade, the burn-up line draw, the "today" marker; all state-conveying, reduced-motion-safe.
- `interaction-design.md` — the "Log actual cost" panel and the expand/collapse rows.
- `clarify.md` — the verdict/empty/clawback microcopy in shop-plain voice.
- `audit.md` — contrast on the toned numbers (amber on warm-white is the risk: verify ≥4.5:1; bump toward ink if close), 44px targets, reduced-motion.

## 11. Open questions (defaults asserted; confirm or override)

- **Default lens = E (milestone lane).** It matches "running timeline marker on the job" and reuses the milestone strip language. *(Default; Andrew can set a different default per his glance preference.)*
- **Verdict tone thresholds** reuse the app's existing margin bands (≥30% on-track, ≥20% at-risk, else blocked — from `computeMargin` / `StatStrip`), so the costing verdict and the rest of the app agree. *(Asserted.)*
- **"Log actual cost" lives on the tab** (not a separate route). *(Asserted — keeps the money loop in one place.)*

---

> **Confirmation gate (shape):** Andrew to confirm the lead direction — Restrained + status-tone verdict, default lens E, stat-strip-not-hero-card, inherit the MarginChart idiom — or override, before P4 build begins.
