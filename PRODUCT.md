# Product

## Register

product

## Users

**Today: one user.** Andrew Chilton, owner of Spacecraft Joinery (Victoria BC fulfilment + install cabinetry, ~$400K revenue). He runs sales, quoting, design coordination, shop scheduling, install management, and the books. He has ADHD. He opens the dashboard at his desk with coffee in the morning, on his phone in the truck between sites, and on a tablet when he's walking the shop floor.

That's the only user-shape that should drive design decisions right now. Other shop roles (estimator, designer, foreman, employee, installer, bookkeeper) are wireframed in the codebase but no one logs in under those roles yet. **They are aspirational, not constraints.** Build the dashboard for Andrew first; team expansion is a real future thread but it does not get to dilute current decisions.

The job he is doing when he opens it: **figure out the state of the shop, fast.**

## Product Purpose

A daily working tool that answers *what's on track, what's at risk, what's blocked* across every job in the shop — at a glance, from anywhere, on any screen. Lean visual management is the dominant principle; everything else (Estimator, P&L, Inventory, CRM, SOPs, Shop Kanban, Installer Portal) is in service of getting an honest picture of *where everything stands today*.

What success looks like 30 days from launch (Andrew's own answers, all four picked):

1. **Habit shift.** The dashboard is the morning-coffee landing page, not Gmail or a spreadsheet.
2. **Same-day catches.** A blocked job, a stale quote, or a tight margin surfaces *while there's still time to fix it this shift* — not next week.
3. **Flow without re-keying.** A quote moves to a sold job moves to an invoice without spreadsheets in the middle.
4. **Honest profitability.** Andrew knows which job made the most money this month, traceable to actual costs.

These are stacked outcomes, not alternatives. The product fails if it nails any one and misses the others.

## Brand Personality

**Sharp. Quiet. Focused.**

Not "soft and warm." Sharp means surgical, decisive, no slack typography or padding-for-padding's-sake. Every pixel earns its place. **Quiet** means the system never raises its voice — restrained palette, no decoration, no animation that doesn't convey state. **Focused** means one opinion per surface, one primary question per view, the next action obvious.

The two reference systems that capture this register:

- **Claude desktop app** — warm-leaning parchment surfaces (not pure white, not cold gray), Inter typography at finely-tuned sizes, motion that's short and physical, semantic color used sparingly. The most precise single reference for what this should feel like at rest.
- **Apple Settings / iA Writer** — native-feel software. System-fluent affordances, predictable layouts, soft elevation, calm density. Functional precision that doesn't draw attention to itself.

Neither of those references is "trade-tool" or "shop-clipboard." This dashboard is software, and it should look like software made by someone who cares — not software pretending to be a paper checklist.

Voice and copy lean shop-floor plain: margin states are *Healthy / Tight / Below floor*, not *Class A/B/C*; empty states teach the next action, not "no data"; job codes read like `GW-2026-001`, not opaque UUIDs.

## Anti-references

Explicitly NOT (all four called out specifically):

- **Generic enterprise SaaS** (Salesforce, NetSuite, ServiceNow). The category traps are: data-table-with-coloured-pills aesthetics; bright "modern" gradients on KPI cards; hero-metric cards with big numbers and small labels; identical card grids; sidebar-icon-and-breadcrumb-and-charts admin shell.
- **Cabinet-industry incumbents** (Mozaik, Cabinet Vision, ProKitchen). The trap is: Windows-95-shaped, dense gray slab UIs, manual-heavy workflows, no semantic hierarchy. The competitive set Andrew is fleeing.
- **Construction-trade apps** (Procore, BuilderTrend). The trap is: safety-yellow / fluorescent-orange / alarm-red signal palettes, hard-hat aesthetic, masculine-construction signifiers. This product is in a cabinet shop, not on a high-rise.
- **Bootstrap admin templates / AdminLTE clones**. The trap is the off-the-shelf admin shell: pre-made sidebar + breadcrumb + chart-card grid. Distinctive only by its indistinctness. This product should feel bespoke, not assembled from a marketplace.

Every "Don't" in `DESIGN.md` should carry one of these four anti-references by name.

## Design Principles

Five strategic principles, derived directly from Andrew's answers above:

1. **Status at a glance is the design contract.** The primary job is visual management; if a view requires reading to be understood, it has failed. Every list row, every card, every dashboard surface should answer *what's on track, what's at risk, what's blocked* before the user focuses on it. The eight-feet glance test (from across a workshop, can you read the state?) is the audit. *Source: primary JTBD.*

2. **One primary action per surface.** ADHD-cognitive-load is the headline a11y concern. Every screen must point at ONE next thing before offering breadth. Wall-of-options is forbidden. Filter chips, view toggles, secondary actions all live in the periphery — the lead is always one move. *Source: a11y answer + "Focused" personality.*

3. **Same-day truth over end-of-month truth.** The dashboard's job is to surface problems while there's still time to fix them today. Derived data beats manual fields that go stale (Health derived from install proximity vs pipeline stage; margin band from cost lines; capacity from WIP). Manual override stays available, but the rule is the default. *Source: success signal #2.*

4. **Native-feel, never off-the-shelf.** The system should feel like software Andrew commissioned, not software he downloaded. System-fluent components, restrained motion, no marketing decoration. Match Claude desktop and Apple Settings register; reject every anti-reference above. *Source: references + anti-references.*

5. **Owner first, team eventually.** Every current decision optimizes for one user (Andrew). Aspirational multi-role flows do not get to dilute today's product. When the team starts logging in, *that* will be the moment to redesign the role-specific surfaces. Until then, the wireframed role pages stay skeletal. *Source: users answer.*

## Accessibility & Inclusion

- **Lead concern: ADHD-friendly cognitive load.** One primary action per screen. Avoid choice overload (>4 visible primary options in a single decision context). Make the next action obvious. Section breaks and visual hierarchy carry more weight than density.
- **WCAG 2.1 AA baseline** — table stakes, not a feature. Status conveyed by color always also has text or icon. Focus rings always visible. Forms always have labels.
- **Touch targets** — 44×44px minimum on any surface meant for tablet/phone use in the shop or on install.
- **Reduced motion** — `prefers-reduced-motion` honored globally; animation durations zeroed. The andon pulse is the one exception (and it's a safety signal, not decoration).
- **Multi-device respect** — desktop, tablet, phone, and shop-floor TV are all real targets. No surface should assume mouse + keyboard exclusively.

## Working Files

- **`docs/build-direction-spec.md`** (v0.2, copied 2026-05-24): the detailed module/wireframe reference for the 12 modules. Treat it as background, NOT as the strategic brief. When the spec and this PRODUCT.md disagree on tone, brand, or principles, **this document wins** — the spec was a self-brief from 2026-05-04 and has been superseded on personality (sharp, not soft) and reference set (Claude/Apple, not "Claude meets high-end Apple with workshop warmth"). When the spec and this PRODUCT.md disagree on a token, a wireframe, or a module behavior, the spec wins (those are the implementation details).
- **`DESIGN.md`**: visual system (colors, typography, components, do's/don'ts). Generated from this PRODUCT.md via `/impeccable document`.
