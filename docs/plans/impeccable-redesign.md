# Impeccable Redesign Pass — 10 Surfaces

**Goal:** Run the remaining 10 not-yet-critiqued surfaces through impeccable `craft`, to
DESIGN.md compliance + responsive (no horizontal scroll, mobile-convertible).

**Locked decisions (2026-05-29):**

- **Scope:** Full redesign where weak; compliance + responsive everywhere else.
- **Sequence:** Worst mobile-risk first.
- **Role pages:** Shop + Installer built for Andrew's own use (tablet + truck), not skeletal.
- **Responsive model:** Desktop (≥1024) full suite · Tablet (768–1023) adapts, stays board/table-shaped (shop-floor tablet is a real target) · Phone (<768) transforms to mobile-native. Transform pattern varies per surface.

**Canon:** PRODUCT.md (sharp/quiet/focused, one primary action per surface, status-at-a-glance, ADHD cognitive load) + DESIGN.md / `.impeccable/design.json` (Lit Workshop: ghost-border rule, leading status dots, ink-pill CTAs, rare clay accent, warm neutrals, 44px touch targets). No em dashes in UI copy.

---

## Build order & per-surface briefs

### 1. /shop — Shop-floor Kanban 🔴 worst width risk (redesign)

- **Now:** 4 draggable columns (Cut/Assemble/Finish/Install), WorkUnitCard draggables, WIP header, AndonBanner. localStorage only. 800px+ min width, desktop-only.
- **Primary action:** See what's at each station and what's stuck, from across the shop.
- **Redesign:** Keep 4-col board on desktop. Cards float (shadow-resting, no borders), leading status dot, hours-on-station + andon state legible at 8 feet. WIP limits as quiet over/under cues, not safety-color slabs.
- **Tablet:** condensed board, still 4 columns scrollable as a contained region only if needed (no page scroll), larger tap targets.
- **Phone:** single-column **station switcher** — segmented pill picks Cut/Assemble/Finish/Install, shows that station's stack as cards. Andon surfaces above the fold regardless of station.
- **Open question:** Q-SHOP below.

### 2. /calendar — Month grid 🔴 (redesign)

- **Now:** 6×7 month grid, ≤3 pills/day + "+N", monthly job list below. Real data. 600px+ grid.
- **Primary action:** What's landing/installing this month, where are the crunch days.
- **Redesign:** Desktop keeps month grid, day cells float via tonal step not hard borders; status dots on pills.
- **Phone:** transform to **agenda list** (grouped by day, only days with events), not a squished grid. Month nav stays.
- **Tablet:** grid holds, denser cells.

### 3. /inventory — Stock table 🟠 (redesign + persistence)

- **Now:** LowStockBanner + 6-col editable StockTable. localStorage only. ~700px, no scroll wrapper.
- **Primary action:** What's low and needs reordering today.
- **Redesign:** Low-stock is the lead (surfaced as a quiet at-risk grouping at top), not a separate banner slab. Table is the secondary detail.
- **Phone:** rows become **stacked cards** (Material as title, On-hand/Reorder/Unit/Value as labeled fields, inline edit retained).
- **Persistence:** "Full redesign where weak" → move to Supabase (table + RLS) so stock actually saves. Flag if you'd rather defer.

### 4. /catalog — Materials & Finishes 🟠 (redesign + persistence)

- **Now:** Materials/Finishes tab nav + editable CRUD tables. localStorage. Wide tables, no scroll wrapper.
- **Primary action:** Look up / maintain the material + finish library used by estimator and jobs.
- **Redesign:** Tabs stay. Tables comply with shared primitives.
- **Phone:** CRUD rows → stacked cards with inline edit; +Add as a sticky primary action.
- **Persistence:** move to Supabase alongside inventory (same call as Q above).

### 5. /pnl — Profit & Loss (compliance only, near-done)

- **Now:** Full build. 4 KPI tiles + area chart + sparkline rows. Real data. max-w-7xl, mobile-safe.
- **Watch:** the 4 KPI tiles flirt with the banned hero-metric template. Demote to a compact stat strip (header subtitle register), keep the margin line+area as the single lead visual. Confirm chart already matches the DESIGN.md vertical-fade spec (the old MarginChart P0).
- **Phone:** stat strip wraps; chart uses ResponsiveContainer (already fine).

### 6. /crm record surfaces — detail / new / edit (compliance only)

- **Now:** Detail = responsive 3-col (jobs + introduced clients / profile + notes). Forms = max-w-2xl single-column. Real Supabase. Already on-brand per the contacts review.
- **Watch:** confirm detail collapses cleanly 3→1 col on phone; confirm form touch targets 44px; keep the anchor-contact clay dot + warmth chip conventions.
- **Light touch — mostly verification, not redesign.**

### 7. /settings — Workspace config (compliance, light)

- **Now:** 5 stacked section cards. max-w-3xl, mobile-safe.
- **Watch:** one primary action per section, ghost-border compliance, destructive (Reset) properly weighted + confirmed. Hardcoded Company/Tax fields: leave as display, label as not-yet-editable rather than faking inputs.

### 8. /sops — SOPs reference (redesign, thin stub)

- **Now:** 260px sidebar library + article pane. Hardcoded SOPS array.
- **Primary action:** Find the right procedure and read the steps without hunting.
- **Redesign:** Keep two-pane on desktop. Article typography is the product here (steps, pitfalls, est. time) — make it read like a well-set document, not a form.
- **Phone:** library collapses to a **list → article** drill-down (back-button returns to list), not a cramped sidebar.
- **Data stays hardcoded** (out of scope to author SOP content).

### 9. /installer — Install portal (compliance, build for own use)

- **Now:** Full build, single-column, Today/This week/Later/Past due groups, InstallCard + SiteAccess pills, "Mark done". Real data. Already mobile-native.
- **Watch:** this is the phone-in-truck surface — verify 44px targets, one-tap "Mark done" with feedback, SiteAccess legibility. Mostly verification + polish.

### 10. /login — Auth (compliance, quick)

- **Now:** Full build, centered max-w-sm, email/password, error banner. Supabase auth.
- **Watch:** ghost-border (form shell uses border + shadow-sm — align to shadow-resting), the logo tile clay-saturation note from the original critique (quiet it), focus rings, error copy is plain-language, mobile padding.

---

## Open questions to resolve before/while building

**Q-SHOP (gating surface #1):** Shop kanban data is mock/localStorage. For "build for your own use," do you want it
(a) wired to real jobs (derive station from job pipeline stage, drag updates the job), or
(b) a standalone shop board with its own work-units saved to Supabase, independent of the jobs pipeline?
This decides whether Shop is a _view of jobs_ or a _separate board_.

**Q-PERSIST (gates #3/#4):** Confirm Inventory + Catalog get real Supabase tables now (vs. staying localStorage for this pass). Default = yes, wire them.

## Cadence

Build worst-first (Shop → Calendar → Inventory → Catalog → P&L → CRM records → Settings → SOPs → Installer → Login). Each surface: shape-confirm if it needs a redesign decision, build, verify responsive at phone/tablet/desktop in the browser, then move on. `tsc` + `lint` + `build` stay green throughout.
