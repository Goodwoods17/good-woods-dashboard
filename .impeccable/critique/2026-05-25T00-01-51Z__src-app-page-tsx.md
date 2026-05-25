---
target: good-woods-dashboard pre-merge audit
total_score: 25
p0_count: 3
p1_count: 4
timestamp: 2026-05-25T00-01-51Z
slug: src-app-page-tsx
---
# Impeccable Critique — Good Woods Dashboard, pre-merge audit

**Target:** src/app/page.tsx (Hitlist homepage + all 13 surfaces under the polish wave)
**Branch:** feat/estimator-rework, 15 commits ahead of origin/main

## Design Health Score

| # | Heuristic | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Visibility of System Status | 3 | Hitlist + ViewToggle + saved-view counts read instantly. HealthPill on /reports and /jobs/[id] reads job.healthStatus not deriveHealth, stale truth. |
| 2 | Match System / Real World | 3 | Margin/blocker vocab dialed in. "Danger zone" header on delete is Bootstrap-y; Andon/WIP terms unexplained for future teammate. |
| 3 | User Control & Freedom | 3 | ESC closes palette + modal; delete-with-confirm. No undo on inline blocker edits. FLIP reorder has no hint. |
| 4 | Consistency & Standards | 1 | Three button vocabularies live side-by-side (ink-pill rounded-full / rounded-md bg-accent / rounded-md bordered). Three card vocabularies (shadow-no-border / border-border / border-l-4). |
| 5 | Error Prevention | 3 | Delete-confirm, status dropdowns. Cancel/Submit on /jobs/new have competing weights. |
| 6 | Recognition Over Recall | 3 | Saved-view chips, cmdk, hotkeys. JobDetail defaults to Costs not Overview, wrong landing tab. |
| 7 | Flexibility & Efficiency | 3 | Cmd+K + hotkeys + ICS export. No row-level keyboard nav on Hitlist. |
| 8 | Aesthetic & Minimalist | 2 | OverviewTab + ReportsView + JobDetail header = 7+ hero-metric KPI cards (banned). MarginChart = 3-series grouped bars (Salesforce shape). |
| 9 | Error Recovery | 2 | JobsList empty state good. No app-level error boundary. Delete failures silent. |
| 10 | Help & Documentation | 2 | Demo tag explains synthetic data. But M3 on disabled tab, M2 in ReportsView, v0.7.0 M1-M7 in sidebar, roadmap leaks. |
| Total | | 25/40 | Solid working tool with three drift patches dragging polished surfaces down |

## Anti-Patterns Verdict

LLM assessment: Mixed. Morning-coffee path (Hitlist + briefing strip + ViewToggle + cmdk) is Linear/Raycast-grade. JobDetail, /reports, /pnl, briefing list, /jobs/new form, sidebar logo tile all read as enterprise-SaaS template. User fluent in Linear would trust homepage, recoil at job detail.

Deterministic scan: Unavailable, impeccable detector engine missing from install (wrapper exists, bundled module not shipped). Visual review carried the deterministic load.

Anti-reference slip-risk map (PRODUCT.md):
- Generic enterprise SaaS: CLEAR LEAK (OverviewTab + ReportsView KpiTiles; MarginChart 3-series grouped bars + legend)
- Cabinet incumbent gray slab: MINOR LEAK (KanbanBoard bordered cards/columns)
- Construction-trade safety palette: clear
- Bootstrap admin templates: MINOR LEAK (Sidebar shape; JobDetail tab underline)

## Overall Impression

Roughly two-thirds of surfaces migrated to Lit Workshop direction. The remaining third (OverviewTab, ReportsView, KanbanBoard, BriefingItemCard, MarginChart, Sidebar logo tile, /jobs/new form) is still pre-direction and reads like a different product. The biggest single opportunity is finishing the migration before merge, each surface is under 30 minutes of focused work.

## What is Working

1. Hitlist + briefing strip combo on / is the design distilled. Italic teaser, numbered ranking, Flame icon, "8 jobs - $X on the line" subtitle. FLIP reorder, hotkeys, AnimatePresence layout.
2. Pill / StatusDot / HealthPill / BlockerChip primitive ladder. Clean shape-vs-vocabulary separation.
3. CommandPalette with job-code matching + numbered hotkeys. Linear-grade.

## Priority Issues

### [P0] /jobs/new primary CTA is still clay + rounded-md
Why: Canonical job-creation moment, the place revenue enters. Submit is clay (banned on CTAs by Rare-Accent Rule), corner is wrong, Submit and Cancel have same visual weight.
Fix: rounded-full bg-ink-pill text-white hover:bg-accent-active. Match homepage New Job button.
Command: polish src/app/jobs/new/page.tsx

### [P0] MarginChart ships spec-banned chart shape
Why: DESIGN.md section 5 specifies vertical-fade line+area. Ships as 3-series grouped BarChart with Legend (Salesforce shape). P&L is the honest profitability surface (PRODUCT.md success signal 4) and looks like a Salesforce report.
Fix: Single line+area for margin (lead metric) over months, clay to transparent fill. Revenue/Cost become sparkline rows or toggle. Drop Legend.
Command: distill features/pnl/components/MarginChart.tsx

### [P0] Sidebar logo tile is permanent clay surface
Why: Rare-Accent Rule says clay at full saturation under 5 percent of visible surface. Sidebar is global chrome, visible every page. 28x28 clay tile competes with every other clay accent for attention budget.
Fix: bg-text-primary with white GW lettering, or clay outline on white. Same on src/app/login/page.tsx:116.
Command: quieter Sidebar.tsx

### [P1] OverviewTab opens with banned hero-metric KPI grid
Why: DESIGN.md section 6 explicit ban. Three text-2xl semibold cards. Compounds with JobDetail defaulting to Costs, when user reaches Overview the lead visual is the antipattern. Blocker editor below the fold.
Fix: Promote blocker form to top. Demote KPIs to compact stat strip in JobDetail header (dedup).
Command: distill features/jobs/components/OverviewTab.tsx

### [P1] BriefingItemCard is exact border-l-4 banned pattern
Why: DESIGN.md section 6 named exact pattern. /briefing top-3 surface, visual jumps to Slack-channel-list register.
Fix: Replace left stripe with leading StatusDot (lg, 10px) inline with headline. Drop outer border. Use bg-surface shadow-resting.
Command: quieter features/briefing/components/BriefingItemCard.tsx

### [P1] KanbanBoard carries borders everywhere (Ghost-Border Rule x5)
Why: Cards bordered, columns bordered, droppable hover clay-on-clay. Hitlist solid; Kanban is the visual reset users trip over on view switch.
Fix: Cards bg-surface shadow-resting, shadow-hover on grab. Columns bg-surface-muted/40 only. Droppable highlight 2px inset ring at ring-accent-soft.
Command: polish KanbanBoard.tsx

### [P1] Reduced-motion kills andon pulse
Why: PRODUCT.md a11y carves andon pulse as the one exception. globals.css:146 zeroes ALL animations with !important. Tablet user with battery-saver loses safety signal.
Fix: After reduced-motion block, re-enable .animate-andon-pulse and .animate-andon-icon-pulse at original durations.
Command: harden globals.css

### [P2] Manual healthStatus read on JobDetail + ReportsView
Why: Hitlist/JobsList use deriveHealth correctly. JobDetail.tsx:97 + ReportsView.tsx:237 read raw flag. Same job can show green on / and red on /jobs/[id]. DESIGN.md section 5 contract violated.
Fix: Reads use deriveHealth(job). StatusEditor on JobDetail restricted to paused toggle only.
Command: harden JobDetail.tsx + ReportsView.tsx

### [P2] Typography scale undefined, components hardcode px values
Why: DESIGN.md section 3 specifies Greeting 38 / Headline 24 / Title 18 / Body 14. Tailwind ships defaults that do not map. ~24 grep hits for text-[Npx] across 12+ files. PageHeader is text-[28px] (off-spec).
Fix: Add fontSize tokens (greeting, headline, title, body, caption, label, micro). Sweep all text-[Npx] usages.
Command: typeset tailwind.config.ts + global sweep

### [P3] borderRadius.xl is 12px but DESIGN.md says 14px
Off-spec by 2px on every primary card.
Fix: tailwind.config.ts:78 xl 14px. Add pill 9999px.
Command: polish tailwind.config.ts

### [P3] Italic-Serif Rule violation in BriefingCard teaser
Whole-sentence italic Cormorant reads as marketing-hero-line.
Fix: Drop italic. Keep font-serif.
Command: typeset BriefingCard.tsx

## Persona Red Flags

Andrew at 6am with coffee, desktop (canonical user):
- Lands on /, Hitlist great. Clicks top job for blocker, JobDetail opens to Costs tab. Three extra interactions (find Overview tab, scroll past 3 KPI cards, find blocker textarea) before the one thing he came for. ADHD attention derails here.
- Edits blocker, blurs. No saved feedback. Did it save? Unclear.

Andrew in truck on phone between sites:
- ViewToggle + New Job + PageHeader compete for narrow top-right. No md collapse defined.
- KanbanBoard single column on phone, Kanban dies on the device where which job at install matters most.
- Hitlist row chevron + Add to calendar icons are h-3 w-3, under 44x44 PRODUCT.md a11y baseline.

Andrew on tablet walking shop floor:
- Andon pulse killed by reduced-motion bug. Bright sun + battery saver = no safety signal.
- KanbanBoard 12-14px text fails eight-feet glance contract.

## Minor Observations

- JobsList table header/body weights inverted
- ViewToggle uses bg-surface/70 not specd bg-white/60 (10% drift)
- Sidebar/ReportsView/disabled-tab leak M1-M7, M2, M3 roadmap
- OverviewTab destructive button uses --status-blocked as destructive (banned)
- MilestonesStrip + TasksTab current-step is solid bg-accent (2 more clay surfaces)
- BriefingCard returns null on no-briefing, should render EmptyState
- InvoiceDocument.tsx:168 uses literal #F4F2EE instead of COLORS.surfaceMuted

## Questions to Consider

1. Default tab on /jobs/[id]: switch Costs to Overview?
2. MarginChart shape: single line+area, or stacked area for cost/margin/revenue?
3. Manual healthStatus editing: collapse to Pause toggle only?
4. Roadmap leak (M1-M7, M2, M3): keep or strip?
5. Tablet/phone responsive sweep: scope as a shop-floor pass next?
