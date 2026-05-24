# Cabinetry Shop Dashboard — Build Direction Spec

**Version:** 0.2 **Last updated:** May 4, 2026 **Build phase:** Phase 1 (frontend \+ mock data)

**Purpose of this document:** A reference document for Claude Code while building the cabinetry shop suite. This is **direction**, not a step-by-step build order. Claude Code should consult relevant sections when working on a given module.

**How to use it:** When asked to build, refactor, or extend any part of the app, first read the relevant module section, then the design system, then the Lean principles section. Treat the design system as the source of truth — never invent new tokens, status colors, or spacing values.

**Phase 1 scope:** Build the full UI exactly as described, using mock JSON data files instead of a real database. No login screen yet. Owner-only role works end-to-end; other roles are skeletal (visible in the UI, not fully wired). Backend (database, auth, file storage) is Phase 2\.

---

## 1\. Product Overview

**Name:** *(TBD — placeholder: "Shop Suite")*

**What it is:** An all-in-one operations platform for a single cabinetry shop covering the full value stream from lead capture to job close-out. It replaces the patchwork of spreadsheets, paper checklists, whiteboards, and sticky notes that typically run a custom shop.

**Core modules:**

1. **CRM** — leads, customers, communication log  
2. **Estimator** — quotes, line items, materials, labor, margin  
3. **Project Management** — jobs from sold → installed, milestones, schedule  
4. **Lean Task Tracker** — Kanban for shop floor work, takt/cycle tracking  
5. **SOPs & Standard Work** — flowcharts, checklists, training docs  
6. **Installer Portal** — daily logs, install checklists, photos, signoffs  
7. **Inventory** — materials, hardware, consumables, reorder thresholds  
8. **P\&L / Financial Analysis** — job-level profitability, shop-wide reporting

**Success criteria:**

- One source of truth — no one asks "where's that file?"  
- Status visible at a glance from any device, anywhere in the shop  
- Defects and delays caught the same shift, not the next week  
- Estimates → jobs → invoices flow without re-keying data

---

## 2\. Tech Stack (locked)

| Layer | Choice | Why |
| :---- | :---- | :---- |
| Framework | Next.js 14 (App Router) | SSR/SSG, full-stack-ready, file-based routing |
| Language | TypeScript (strict) | Type safety across modules |
| Styling | Tailwind CSS | Matches design tokens 1:1 |
| Components | shadcn/ui | Owned, themeable, accessible |
| Charts | Recharts | Clean, composable, light-mode native |
| Icons | Lucide React | Pairs with shadcn, soft strokes |
| Forms | React Hook Form \+ Zod | Validation \+ types in one place |
| State | React Server Components \+ Zustand for client state | Minimal client JS |
| Data layer (Phase 1\) | Local JSON files in `/data` \+ typed loader functions | No backend needed |
| Data layer (Phase 2\) | **TBD — likely Supabase (Postgres \+ Auth \+ Storage \+ Realtime)** | Decided after Phase 1 |
| Auth (Phase 1\) | None — single-user prototype | Login screen comes in Phase 2 |
| Deployment | Vercel | Zero-config Next.js |

**Required Tailwind plugins:** `@tailwindcss/forms`, `@tailwindcss/typography`, `tailwindcss-animate`.

### 2.1 Phase 1 Data Layer Pattern

All mock data lives in `/data/*.json` with matching TypeScript types in `/types/*.ts`. Loader functions in `/lib/data/*.ts` return promises so swapping in a real database in Phase 2 only changes the loader implementations, not the components that call them.

/data

  customers.json

  estimates.json

  jobs.json

  inventory.json

  sops.json

  andon-log.json

  ...

/types

  Customer.ts

  Estimate.ts

  Job.ts

  ...

/lib/data

  getCustomers.ts          // returns Promise\<Customer\[\]\>

  getJobsAtRisk.ts

  ...

**Rule:** Components never import JSON directly. Always go through a loader function. This is the seam where Phase 2 plugs in.

### 2.2 Integrations (planned)

| Integration | Phase | Notes |
| :---- | :---- | :---- |
| Mozaik (CAD/CNC) | v2 | Design data model so cut lists / part lists can be imported. See §13. |
| QuickBooks | v2 | Mirror chart-of-accounts terminology in P\&L module to ease later sync. |
| Google Calendar | v1 | Two-way sync for install dates and shop schedule. |
| Email transactional | v1 | Booking confirms, signoff PDFs, estimate-sent notifications. (Provider chosen in Phase 2 — likely Resend.) |
| SMS | v1 | Installer reminders, customer "we're on the way" messages. (Provider TBD — likely Twilio.) |
| Stripe | Future | Out of scope for now. |
| Customer portal | Future | Out of scope — not in v1. |

Phase 1 mocks the integrations: calendar shows fake events from a JSON file; SMS/email "send" buttons log to console with a toast confirmation.

---

## 3\. Design System

The visual feel: **soft, warm, quiet, confident.** Think Claude desktop app meets a high-end Apple product, with just enough warmth to feel like a workshop and not a SaaS dashboard.

### 3.1 Color Tokens

All colors defined as CSS variables in `globals.css` and mapped into `tailwind.config.ts`.

#### Light Mode (default)

:root {

  /\* Surfaces — warm, never pure white \*/

  \--background:        \#FAF9F7;  /\* page background \*/

  \--surface:           \#FFFFFF;  /\* cards, modals \*/

  \--surface-muted:     \#F4F2EE;  /\* subtle fills, hover \*/

  \--surface-sunken:    \#EFEDE8;  /\* nested panels \*/

  /\* Borders — soft, low contrast \*/

  \--border:            \#E8E4DD;

  \--border-strong:     \#D6D1C7;

  /\* Text — warm grays, never pure black \*/

  \--text-primary:      \#2B2926;

  \--text-secondary:    \#6B6862;

  \--text-tertiary:     \#9A968D;

  \--text-disabled:     \#C4BFB6;

  /\* Accent — muted clay/terracotta (primary actions) \*/

  \--accent:            \#B86F52;

  \--accent-hover:      \#A45F44;

  \--accent-active:     \#8F4F36;

  \--accent-soft:       \#F1E4DC;  /\* tinted backgrounds \*/

  /\* Secondary accent — warm taupe \*/

  \--secondary:         \#8B7355;

  \--secondary-hover:   \#75614A;

  \--secondary-soft:    \#EDE7DD;

  /\* Status — Lean visual management (see §4) \*/

  \--status-on-track:   \#6B8E5C;  /\* muted sage, not bright green \*/

  \--status-at-risk:    \#C99846;  /\* warm amber, not safety-yellow \*/

  \--status-blocked:    \#B5544C;  /\* dusty red, not alarm-red \*/

  \--status-complete:   \#7A8B6F;  /\* soft moss \*/

  \--status-paused:     \#9A968D;  /\* neutral gray \*/

  \--status-andon:      \#D14D3F;  /\* the only "loud" red — used sparingly \*/

  /\* Status soft fills (for backgrounds, badges) \*/

  \--status-on-track-soft:  \#E8EFE3;

  \--status-at-risk-soft:   \#F7EBD5;

  \--status-blocked-soft:   \#F2DDDA;

  \--status-andon-soft:     \#FADBD7;

}

#### Dark Mode (toggle, not auto)

\[data-theme="dark"\] {

  \--background:        \#1C1B19;

  \--surface:           \#25241F;

  \--surface-muted:     \#2D2C27;

  \--surface-sunken:    \#1F1E1B;

  \--border:            \#3A3833;

  \--border-strong:     \#4A4842;

  \--text-primary:      \#ECEAE4;

  \--text-secondary:    \#B5B1A8;

  \--text-tertiary:     \#807C73;

  \--text-disabled:     \#5A5750;

  \--accent:            \#D08B6F;

  \--accent-hover:      \#DD9C82;

  \--accent-active:     \#BA785D;

  \--accent-soft:       \#3D2A22;

  \--secondary:         \#A8927A;

  \--secondary-soft:    \#2F2820;

  \--status-on-track:   \#87A977;

  \--status-at-risk:    \#DBAA5C;

  \--status-blocked:    \#C9685F;

  \--status-complete:   \#95A689;

  \--status-paused:     \#807C73;

  \--status-andon:      \#E36050;

  \--status-on-track-soft:  \#2A352A;

  \--status-at-risk-soft:   \#3A2F1F;

  \--status-blocked-soft:   \#3A2624;

  \--status-andon-soft:     \#3D211D;

}

**Rules:**

- Never use pure `#FFFFFF` background or pure `#000000` text — always the warm tokens above.  
- Status colors are **semantic only**. Never use `--status-blocked` for non-status purposes (e.g., "delete" buttons use `--accent` or a dedicated `destructive` variant if needed).  
- The `--status-andon` red is reserved for active andon alerts and critical safety. Don't dilute it.

### 3.2 Typography

**Font:** Inter (variable) — `Inter var` from Google Fonts or `next/font`.

// tailwind.config.ts

fontFamily: {

  sans: \['Inter var', 'Inter', 'system-ui', '-apple-system', 'sans-serif'\],

  mono: \['JetBrains Mono', 'ui-monospace', 'monospace'\],

}

**Type scale** (line-height in parens):

| Token | Size | Use |
| :---- | :---- | :---- |
| `text-xs` | 12px (16) | Captions, table micro-labels |
| `text-sm` | 13px (20) | Secondary text, table cells |
| `text-base` | 14px (22) | **Body default** — slightly smaller than web norm for density |
| `text-md` | 15px (24) | Card titles, form labels |
| `text-lg` | 17px (26) | Section headings |
| `text-xl` | 20px (28) | Page subheadings |
| `text-2xl` | 24px (32) | Page titles |
| `text-3xl` | 30px (38) | Dashboard hero numbers |
| `text-4xl` | 40px (48) | Wall-display KPIs only |

**Weight rules:**

- Body: 400  
- Emphasized body / labels: 500  
- Headings: 600 (never 700+ — keeps it quiet)  
- Numbers/KPIs: use `font-feature-settings: "tnum"` (tabular nums) for alignment

**Letter spacing:**

- Default: `-0.01em` (Inter benefits from slight tightening)  
- Headings 20px+: `-0.02em`  
- All-caps labels: `+0.04em`

### 3.3 Spacing & Layout

Tailwind's default 4px scale. Rules of thumb:

- Card padding: `p-6` (24px) on desktop, `p-4` (16px) on mobile  
- Stack gap inside cards: `space-y-4` (16px)  
- Section gap on a page: `space-y-8` (32px) to `space-y-10` (40px)  
- Page outer padding: `px-6 py-8` desktop, `px-4 py-6` mobile  
- Sidebar width: `w-64` (256px) collapsed to `w-16` (64px)  
- Max content width: `max-w-7xl` (1280px) for most pages, full width for shop-floor TVs

### 3.4 Border Radius

| Token | Value | Use |
| :---- | :---- | :---- |
| `rounded-sm` | 4px | Tags, badges |
| `rounded-md` | 6px | Inputs, buttons |
| `rounded-lg` | 8px | Cards, dropdowns |
| `rounded-xl` | 12px | Modals, large panels |
| `rounded-2xl` | 16px | Hero cards, marketing |

Avoid `rounded-full` except for avatars and status dots.

### 3.5 Shadows (use sparingly)

Light mode favors **borders over shadows**. Use shadows only for true elevation (modals, dropdowns).

\--shadow-sm:  0 1px 2px 0 rgb(43 41 38 / 0.04);

\--shadow-md:  0 4px 12px \-2px rgb(43 41 38 / 0.06), 0 2px 4px \-2px rgb(43 41 38 / 0.04);

\--shadow-lg:  0 12px 32px \-8px rgb(43 41 38 / 0.10), 0 4px 8px \-4px rgb(43 41 38 / 0.06);

### 3.6 Motion

Subtle. Apple/Claude-feel motion is short, eased, and physical.

\--ease-standard: cubic-bezier(0.2, 0, 0, 1);

\--ease-emphasized: cubic-bezier(0.3, 0, 0, 1);

\--duration-fast: 120ms;

\--duration-base: 200ms;

\--duration-slow: 320ms;

- Hover states: `120ms`  
- Modal/drawer enter: `200ms`  
- Page transitions: `200ms` fade  
- Andon alert pulse: `1200ms` infinite (the one exception to "subtle")

### 3.7 Component Patterns

Every component uses shadcn/ui as the base and overrides only what's needed to match tokens. Never create a new "Button" or "Card" component without checking shadcn first.

**Buttons:**

- Primary: `bg-accent text-white hover:bg-accent-hover`  
- Secondary: `bg-surface border border-border text-text-primary hover:bg-surface-muted`  
- Ghost: `text-text-secondary hover:bg-surface-muted hover:text-text-primary`  
- Destructive: `bg-status-blocked text-white hover:bg-[#A04841]`  
- Sizes: `sm` (32px), `md` (36px), `lg` (44px — touch target for shop floor)

**Inputs:** `border-border focus:border-accent focus:ring-2 focus:ring-accent/20`

**Cards:** `bg-surface border border-border rounded-lg p-6`

**Status badges:** colored dot \+ text on `--status-*-soft` background. Never use bright fills.

---

## 4\. Lean Principles in the UI

These are the operating principles. Every screen should pass the test: *"Does this support visual management, standard work, waste reduction, pull, 5S, or andon?"*

### 4.1 Visual Management (status at a glance)

- Every job, task, and work order has a **single primary status color** drawn from the palette above.  
- Status appears in 3 places consistently: list view (left dot), detail view (top-right pill), card view (left border accent).  
- Aggregate views (the home dashboard, shop-floor TV) show status as filled bars or count chips, never as 3D pie charts or gradient gauges.  
- A glance from 8 feet away should answer: *what's on track, what's at risk, what's blocked.*

### 4.2 Standard Work (SOPs, checklists)

- SOPs are first-class entities, not PDFs buried in Drive.  
- Every job inherits a **standard work template** for its job type (e.g., "Frameless Kitchen — Standard"). Deviations are tracked.  
- Checklists are touch-friendly (44px targets), one task per line, photo evidence optional but encouraged.  
- Completed checklists become the **install signoff document**.

### 4.3 Waste Reduction (the 8 wastes — DOWNTIME)

Surfaces that explicitly call out waste:

- **Defects log** — every quality issue tagged to a job, root cause field required  
- **Downtime log** — machine/employee idle time, with reason codes  
- **Inventory** — flags for overstock and stockouts (overproduction & inventory waste)  
- **Job timeline** — visual gap between scheduled and actual cycle time (waiting waste)  
- **Movement map** *(future)* — heatmap of installer/employee travel

### 4.4 Pull / Just-in-Time (Kanban)

- Shop-floor work is organized as a Kanban: **Queued → Cut → Assemble → Finish → QC → Ready to Install → Installed**.  
- WIP limits per column (configurable, default visible).  
- Cards are draggable on desktop, swipeable on tablet/mobile.  
- Pulling a card forward auto-logs cycle time for the previous stage.

### 4.5 5S (organization)

- Inventory has location codes (Shelf A3, Bin 12, Yard West).  
- Photo of "standard state" attached to each location — empty? Wrong items? Flag it.  
- Weekly 5S audit checklist module (`Sort, Set in Order, Shine, Standardize, Sustain`) — score per area, trend over time.

### 4.6 Andon (real-time problem alerts)

- One-tap "Andon" button persistently available (header on mobile, sidebar bottom on desktop).  
- Triggers a notification to the foreman \+ a visible banner across affected role dashboards.  
- Andon alerts use `--status-andon` and a slow pulse — the **only animated alert** in the system.  
- All andons are logged. Resolution requires a root cause note before clearing.

---

## 5\. Roles & Permissions

Six roles for the shop. **Phase 1 builds the Owner role end-to-end**; the other five roles get UI shells (login routing, dashboard placeholders) but full feature wiring comes later.

| Role | Primary device | Sees | Can edit | Phase 1 status |
| :---- | :---- | :---- | :---- | :---- |
| **Owner / Admin** | All | Everything | Everything | ✅ Full |
| **Estimator / Sales** *(combined)* | Desktop | CRM, Estimator, Jobs (own) | CRM, Estimates, Customers | 🟡 Skeletal |
| **Designer** | Desktop | CRM (read), Jobs (assigned), Files | Renderings, drawings, design notes on jobs | 🟡 Skeletal |
| **Shop Foreman / PM** *(combined)* | Tablet, TV, Desktop | All shop modules, schedule, inventory | Job status, assignments, andon, inventory | 🟡 Skeletal |
| **Shop Employee** | Tablet, TV | Today's jobs, SOPs, andon | Task status, time, defect logs | 🟡 Skeletal |
| **Installer** *(in-house)* | Phone, Tablet | Today's installs, customer info, SOPs | Daily log, photos, signoff, andon | 🟡 Skeletal |
| **Office / Bookkeeper** | Desktop | CRM, Invoices, P\&L | Customer info, invoices, payments | 🟡 Skeletal |

**Notes:**

- Estimator and Sales are one role (one person wears both hats).  
- Designer is a separate role for renderings and CAD work — read access to CRM, write access to design files on jobs.  
- Foreman and Project Manager are one role.  
- Installers are in-house employees, so they get full job-detail access (subcontractors would be more locked down if added later).

---

## 6\. Navigation

**Desktop (≥1024px):** Collapsible left sidebar.

┌──────────────────────────────────────────────────────────┐

│ ┌──────────┐                                             │

│ │ \[Logo\]   │  Page Title                       \[User ▾\]  │

│ │          │  Breadcrumb / context                       │

│ │ ◇ Home   │ ─────────────────────────────────────────── │

│ │ ◇ CRM    │                                             │

│ │ ◇ Jobs   │  \[ Page content \]                           │

│ │ ◇ Shop   │                                             │

│ │ ◇ Install│                                             │

│ │ ◇ Inv.   │                                             │

│ │ ◇ Estim. │                                             │

│ │ ◇ SOPs   │                                             │

│ │ ◇ P\&L    │                                             │

│ │          │                                             │

│ │ ⚠ Andon  │                                             │

│ │ ⚙ Setting│                                             │

│ └──────────┘                                             │

└──────────────────────────────────────────────────────────┘

**Tablet (768–1023px):** Sidebar collapses to icon rail by default, expandable.

**Mobile (\<768px):** Bottom tab bar with 5 primary destinations (role-dependent), hamburger for the rest.

┌──────────────────────┐

│  Page Title    \[≡\]   │

├──────────────────────┤

│                      │

│   \[ Page content \]   │

│                      │

├──────────────────────┤

│ ◇    ◇    ⚠    ◇   ◇│   ← bottom tabs

│Home Jobs Andon Inv ⋯ │

└──────────────────────┘

**TV / wall display (≥1920px):** No nav at all — full-bleed dashboard mode (`/display/[boardId]`).

### 6.1 Command Palette (Cmd+K)

Global keyboard shortcut on desktop. Fuzzy-search any entity (customer, job, estimate, SOP, inventory item) plus the **5 primary actions** from §7.1 surfaced as top results.

---

## 7\. Home Dashboards (per role)

### 7.1 Owner Home — Phase 1 priority

The owner home screen is **the** home screen for Phase 1\. Everything else is built around it.

**Top 5 cards (in this order):**

1. Jobs installing this week  
2. Jobs at risk / behind schedule  
3. Today's schedule across the shop  
4. Estimates awaiting customer response  
5. Shop capacity / utilization this week

**Top 5 quick actions** (as buttons in a header bar \+ as Cmd+K results):

1. Create an estimate from a customer record  
2. Send an estimate to a customer for signature  
3. See which jobs are at risk this week *(jumps to filter on Jobs page)*  
4. Drag a job card forward on the Kanban board *(jumps to Shop board)*  
5. Log install-day photos and customer signoff *(jumps to today's install)*

**Wireframe — Owner Home:**

┌────────────────────────────────────────────────────────────────────┐

│ Good morning, \[Name\]                          \[⌘K\]  \[User ▾\]      │

│ Monday, May 4, 2026                                                │

├────────────────────────────────────────────────────────────────────┤

│ QUICK ACTIONS                                                      │

│ \[+ New Estimate\] \[Send Estimate\] \[Jobs at Risk\] \[Shop Board\]      │

│ \[Today's Install\]                                                  │

├──────────────────────────────┬─────────────────────────────────────┤

│ INSTALLING THIS WEEK         │ JOBS AT RISK                        │

│                              │                                     │

│ ●  J01 Henderson  Wed 5/7    │ ●  J02 Brown      2 days behind     │

│ ●  J05 Kim        Thu 5/8    │ ●  J04 Patel      material delay    │

│ ●  J03 Lee        Fri 5/9    │ ●  J07 Walsh      QC redo           │

│                              │                                     │

│ → All installs               │ → All at-risk jobs                  │

├──────────────────────────────┼─────────────────────────────────────┤

│ TODAY'S SHOP SCHEDULE        │ ESTIMATES AWAITING RESPONSE         │

│                              │                                     │

│ 7:00  Cut — J01 (Mike)       │ EST-0124 Henderson  $42,800  3d     │

│ 8:30  Asmbl — J02 (Carlos)   │ EST-0127 Garcia     $28,400  6d  ⚠  │

│ 10:00 Finish — J03 (Sara)    │ EST-0131 Tran       $51,200  1d     │

│ 13:00 QC — J05               │ EST-0133 Park       $19,800  2d     │

│ 14:30 Load J05 for install   │                                     │

│                              │ → All open estimates                │

│ → Full schedule              │                                     │

├──────────────────────────────┴─────────────────────────────────────┤

│ SHOP CAPACITY THIS WEEK                                            │

│                                                                    │

│ Cut       ████████████████░░░░  78%                                │

│ Assemble  █████████████████████ 94%  ●  near max                   │

│ Finish    ████████░░░░░░░░░░░░  42%                                │

│ Install   ████████████████░░░░  82%                                │

│                                                                    │

│ → Capacity planner                                                 │

└────────────────────────────────────────────────────────────────────┘

**Status color usage on home:**

- "At risk" job dots use `--status-at-risk`  
- "Blocked" jobs use `--status-blocked`  
- Estimate aging: 0–3 days neutral, 4–7 days `--status-at-risk` indicator, 8+ `--status-blocked`  
- Capacity bars: \<85% on-track, 85–95% at-risk, \>95% blocked

### 7.2 Other Role Homes (skeletal in Phase 1\)

These are wireframed for design consistency but not fully wired in Phase 1\. They render with placeholder/static data so the navigation feels real.

#### Foreman/PM Home

┌────────────────────────────────────────────────────────────────┐

│ Shop Floor — \[Date\]                                  \[Andon ⚠\] │

├────────────────────────────────────────────────────────────────┤

│ TODAY'S BOARD (Kanban — abbreviated)                          │

│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │

│ │Queue│ │ Cut │ │Asm. │ │Fin. │ │ QC  │ │Ready│              │

│ │ J04 │ │ J01 │ │ J02 │ │ J03 │ │     │ │ J05 │              │

│ │ J07 │ │     │ │     │ │     │ │     │ │     │              │

│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘              │

├──────────────────────────────┬─────────────────────────────────┤

│ ASSIGNMENTS                   │ INVENTORY ALERTS               │

│ Mike    → J01 Cut             │ ● Blum hinges — 8 left         │

│ Carlos  → J02 Assemble        │ ● 3/4" maple ply — 2 sheets    │

│ Sara    → J03 Finish          │ → reorder                      │

└──────────────────────────────┴─────────────────────────────────┘

#### Designer Home

┌────────────────────────────────────────────────────────────────┐

│ Design Queue                                  \[+ New Drawing\]  │

├────────────────────────────────────────────────────────────────┤

│ ASSIGNED TO ME                                                 │

│ ●  J08 Patel      Renderings due Thu                          │

│ ●  J11 Rivera     Cabinet drawings — in review                │

├────────────────────────────────────────────────────────────────┤

│ AWAITING CUSTOMER APPROVAL          RECENTLY APPROVED          │

│ J05 Kim — sent 2d ago               J03 Lee — 5d ago           │

│ J08 Patel — sent today              J02 Brown — 1w ago         │

└────────────────────────────────────────────────────────────────┘

#### Shop Employee Home (tablet)

┌────────────────────────────────────────────┐

│ Hi, Mike                       \[Andon ⚠\]   │

├────────────────────────────────────────────┤

│ YOUR TASK                                  │

│ ┌────────────────────────────────────────┐ │

│ │ Job \#J01 — Henderson Kitchen           │ │

│ │ Stage: CUT                             │ │

│ │ Started 8:14 AM  •  Est 2.5 hrs       │ │

│ │                                        │ │

│ │ ▶ View SOP    ▶ Mark Complete         │ │

│ └────────────────────────────────────────┘ │

├────────────────────────────────────────────┤

│ NEXT UP                                    │

│ Job \#J04 — Patel Bath Vanity              │

└────────────────────────────────────────────┘

#### Installer Home (phone)

┌──────────────────────┐

│ Today's Install  \[≡\] │

├──────────────────────┤

│ HENDERSON KITCHEN    │

│ 1248 Maple Ave       │

│ Start: 8:00 AM       │

│ ───────────────────  │

│ ▶ Open Job           │

│ ▶ Pre-Install Check  │

│ ▶ Photos             │

│ ▶ Customer Signoff   │

├──────────────────────┤

│ NEXT INSTALL         │

│ Tomorrow — Patel     │

├──────────────────────┤

│ ◇   ◇   ⚠   ◇   ⋯   │

└──────────────────────┘

#### Office/Bookkeeper Home

┌────────────────────────────────────────────────────────────────┐

│ Office                                                         │

├────────────────────────────────────────────────────────────────┤

│ A/R AGING               A/P DUE THIS WEEK                      │

│ Current   $24,300       Materials supplier   $8,400           │

│ 30 days   $12,800       Hardware supplier    $2,100           │

│ 60+ days   $4,200  ●    Payroll              $14,800          │

│                                                                │

│ INVOICES TO SEND        UPCOMING DEPOSITS                      │

│ J03 Lee — final         J11 Rivera — 50% on contract sign     │

│ J05 Kim — final         J08 Patel — final due install         │

└────────────────────────────────────────────────────────────────┘

---

## 8\. Module Specs

For each module: purpose → key entities → primary screens → wireframe → states.

### 8.1 CRM

**Purpose:** Capture leads, track customers, log every touchpoint.

**Entities:** `Customer`, `Lead`, `Contact`, `Communication` (call/email/text/meeting), `Tag`.

**Key screens:**

- Customer list (filterable table)  
- Customer detail (header \+ tabs: Overview / Activity / Estimates / Jobs / Files)  
- Lead intake form (web form \+ manual entry)

**Wireframe — Customer Detail:**

┌──────────────────────────────────────────────────────────────┐

│ ← Customers                                  \[+ New Activity\]│

├──────────────────────────────────────────────────────────────┤

│ HENDERSON, JESSICA                              ● Active     │

│ jessica@email.com • (555) 123-4567 • Tag: Kitchen, Referral │

├──────────────────────────────────────────────────────────────┤

│ \[Overview\] \[Activity\] \[Estimates\] \[Jobs\] \[Files\]            │

├──────────────────────────────────────────────────────────────┤

│                                                              │

│ NEXT STEP                          OPEN ESTIMATES            │

│ Send revised estimate              EST-0124  $42,800         │

│ Due Friday                         Sent 3 days ago           │

│                                                              │

│ RECENT ACTIVITY                                              │

│ ▪ Call — Apr 28 — Discussed timeline                        │

│ ▪ Email — Apr 25 — Sent initial quote                       │

│ ▪ Site visit — Apr 22 — Measured kitchen                    │

└──────────────────────────────────────────────────────────────┘

**States:** loading skeleton → empty ("No customers yet — \[+ Add\]") → error → populated.

### 8.2 Estimator

**Purpose:** Build accurate quotes fast. Convert to a job in one click.

**Entities:** `Estimate`, `EstimateLineItem`, `MaterialCatalog`, `LaborRate`, `Assembly` (reusable groupings).

**Key screens:**

- Estimate list  
- Estimate builder (line items, materials, labor, overhead, margin)  
- Customer-facing PDF preview  
- Send-for-signature flow (Phase 1: mock — generates a PDF and shows a fake "sent" state; Phase 2: real e-signature integration)

**Wireframe — Estimate Builder:**

┌──────────────────────────────────────────────────────────────┐

│ ← Estimates    EST-0124 — Henderson Kitchen     \[Save\] \[→\]  │

├──────────────────────────────────────────────────────────────┤

│ Customer: Jessica Henderson    Status: Draft                 │

├──────────────────────────────────────────────────────────────┤

│ LINE ITEMS                                       \[+ Add Item\]│

│ ┌──────────────────────────────────────────────────────────┐ │

│ │ Frameless base cabinets (12)            $8,400           │ │

│ │ Frameless wall cabinets (8)             $5,200           │ │

│ │ Quartz countertops 42 sf                $4,620           │ │

│ │ Soft-close hardware                       $980           │ │

│ │ Labor — fabrication (40 hrs)            $3,200           │ │

│ │ Labor — install (16 hrs)                $1,440           │ │

│ └──────────────────────────────────────────────────────────┘ │

├──────────────────────────────────────────────────────────────┤

│ Subtotal           $23,840                                   │

│ Overhead (15%)      $3,576                                   │

│ Margin (35%)        $9,594                                   │

│ ─────────────────────────                                    │

│ TOTAL              $37,010      Margin check: ● Healthy      │

└──────────────────────────────────────────────────────────────┘

**Margin check** uses status colors: ≥30% on-track, 20–30% at-risk, \<20% blocked.

### 8.3 Project Management (Jobs)

**Purpose:** Manage the lifecycle of a sold job from contract → install → close.

**Entities:** `Job`, `JobMilestone`, `JobAssignment`, `JobDocument`.

**Key screens:**

- Jobs list (filter: status, foreman, install date)  
- Jobs at risk view (saved filter, links from owner home)  
- Job detail (overview, timeline, tasks, files, costs)  
- Schedule (calendar / Gantt view)

**Wireframe — Job Detail:**

┌──────────────────────────────────────────────────────────────┐

│ ← Jobs    J01 — Henderson Kitchen          ● On Track        │

├──────────────────────────────────────────────────────────────┤

│ Customer: Henderson  •  Foreman: Carlos  •  Install: May 18 │

├──────────────────────────────────────────────────────────────┤

│ MILESTONES                                                   │

│ ●━━━━━●━━━━━●━━━━━○━━━━━○━━━━━○                              │

│ Sold  Mater. Cut   Asmbl Finish Inst.                        │

│ Apr 12 Apr 18 Apr 25 ...                                     │

├──────────────────────────────────────────────────────────────┤

│ \[Overview\] \[Tasks\] \[SOP\] \[Files\] \[Costs\] \[Activity\]         │

├──────────────────────────────────────────────────────────────┤

│ TASKS (8 of 23 done)                                         │

│ ✓ Order materials             — Carlos                       │

│ ✓ Cut base cabinets           — Mike                         │

│ ◯ Assemble base cabinets      — Carlos    ● in progress     │

│ ◯ Finish — stain coat 1       — Sara                         │

│ ...                                                          │

└──────────────────────────────────────────────────────────────┘

### 8.4 Lean Task Tracker (Shop Kanban)

**Purpose:** The shop floor's heartbeat. WIP visible, cycle time tracked, pull-based flow.

**Key screens:**

- Kanban board (default home for foreman)  
- Cycle time analytics  
- WIP limit configuration

**Wireframe — Kanban Board:**

┌────────────────────────────────────────────────────────────────────┐

│ Shop Board     \[Filter ▾\] \[Today ▾\]                  \[TV view ↗\]  │

├────────────────────────────────────────────────────────────────────┤

│ QUEUED (4) │ CUT (3/3) │ ASMBL (2/4) │ FINISH (2/2) │ QC │ READY  │

│ ─────────  │ WIP at max│             │ WIP at max  │     │        │

│ ┌───────┐  │ ┌───────┐ │ ┌───────┐   │ ┌───────┐   │     │ ┌────┐ │

│ │J04    │  │ │J01    │ │ │J02    │   │ │J03    │   │     │ │J05 │ │

│ │Patel  │  │ │Hndrsn │ │ │Brown  │   │ │Lee    │   │     │ │Kim │ │

│ │● ok   │  │ │● ok   │ │ │● risk │   │ │● ok   │   │     │ │● ok│ │

│ │2.5h   │  │ │1.5h ↻ │ │ │3h    │   │ │5h ↻   │   │     │ └────┘ │

│ └───────┘  │ └───────┘ │ └───────┘   │ └───────┘   │     │        │

│ ┌───────┐  │           │             │             │     │        │

│ │J07    │  │           │             │             │     │        │

│ └───────┘  │           │             │             │     │        │

└────────────────────────────────────────────────────────────────────┘

- `↻` \= active timer  
- WIP limit shown as `(current/max)`. Column header turns amber when at max, red when over.  
- Drag → forward auto-stops timer on previous stage and starts on new stage.

### 8.5 SOPs & Standard Work

**Purpose:** Living documentation of how work is done. Versioned, searchable, embedded into jobs.

**Entities:** `SOP`, `SOPStep`, `SOPVersion`, `SOPAttachment` (image/video/diagram).

**Key screens:**

- SOP library (search, filter by area)  
- SOP detail (steps, media, version history)  
- Flowchart view (visual SOP — start → branches → end)  
- Edit / new version flow

**Wireframe — SOP Detail:**

┌──────────────────────────────────────────────────────────────┐

│ ← SOPs    SOP-014 Edge Banding             v3 — Apr 2026     │

├──────────────────────────────────────────────────────────────┤

│ \[Steps\] \[Flowchart\] \[Versions\] \[Used in jobs\]               │

├──────────────────────────────────────────────────────────────┤

│ STEPS                                                        │

│                                                              │

│ 1\. Pre-check — temperature 350°F  ─────  \[photo of gauge\]   │

│ 2\. Feed panel face-down at 25 FPM                            │

│ 3\. Trim flush — top, bottom, ends                            │

│ 4\. Inspect — no glue squeeze-out                             │

│ 5\. Mark complete in shop board                               │

│                                                              │

│ Checklist used 142 times • Avg 11 min • Defect rate 0.4%   │

└──────────────────────────────────────────────────────────────┘

### 8.6 Installer Portal

**Purpose:** Phone-first daily workflow for installers in the field.

**Key screens:**

- Today's installs (list)  
- Install detail (customer info, drawings, parts list, SOP, checklist, photos, signoff)  
- Daily log entry

**Wireframe — Install Detail (mobile):**

┌──────────────────────┐

│ ← Today              │

├──────────────────────┤

│ HENDERSON KITCHEN    │

│ 1248 Maple Ave       │

│ ───────────────────  │

│ 📞 (555) 123-4567   │

│ 🗺  Directions       │

│ 📋 Parts List (24)   │

│ 📐 Drawings          │

│ 📑 SOP — Kitchen Ins │

├──────────────────────┤

│ INSTALL CHECKLIST    │

│ ☑ Site walk          │

│ ☑ Floor protection   │

│ ☐ Set base cabs      │

│ ☐ Set wall cabs      │

│ ☐ Counters           │

│ ☐ Hardware           │

│ ☐ Punch list         │

│ ☐ Customer signoff   │

├──────────────────────┤

│ 📷 Add photo         │

│ ⚠ Andon              │

└──────────────────────┘

### 8.7 Inventory

**Purpose:** Know what's in the shop, what's running low, what's in transit.

**Entities:** `Item`, `Location`, `StockMovement`, `PurchaseOrder`, `Supplier`.

**Key screens:**

- Inventory list (search \+ filter)  
- Item detail (current stock, locations, history, reorder threshold)  
- Reorder queue (auto-generated from thresholds)  
- Receive shipment flow

**Wireframe — Inventory List:**

┌──────────────────────────────────────────────────────────────┐

│ Inventory       \[Search…\]   \[Filter ▾\]    \[+ New Item\]      │

├──────────────────────────────────────────────────────────────┤

│ Name                Location    On Hand   Reorder  Status   │

│ ───────────────────────────────────────────────────────────── │

│ 3/4" Maple Ply      A3          2 sht     10       ● Low    │

│ Blum hinges         B12         8 ea      50       ● Low    │

│ Cabinet screws \#8   B05         320 ea    100      ● OK     │

│ Conv. varnish gal   Yard W      4 gal     2        ● OK     │

│ Drawer slides 18"   B14         42 pr     20       ● OK     │

└──────────────────────────────────────────────────────────────┘

Mobile: card stack, swipe right to receive, left to log usage.

### 8.8 P\&L / Financial Analysis

**Purpose:** Know which jobs make money, which don't, and where the leaks are.

**Key screens:**

- P\&L overview (month, quarter, YTD)  
- Job profitability (sortable: actual vs. estimated)  
- Cost-of-goods breakdown  
- Cash flow snapshot

**Phase 1 note:** Use mock numbers and QuickBooks-compatible categories so v2 sync is straightforward.

**Wireframe — P\&L Overview:**

┌──────────────────────────────────────────────────────────────┐

│ P\&L        \[This Month ▾\]                    \[Export ↗\]     │

├──────────────────────────────────────────────────────────────┤

│ REVENUE                                          $124,300   │

│   Cabinetry sales              $98,200                       │

│   Install services             $26,100                       │

├──────────────────────────────────────────────────────────────┤

│ COGS                                             ($68,200)  │

│   Materials                    ($41,300)                     │

│   Direct labor                 ($22,400)                     │

│   Subcontractors                ($4,500)                     │

├──────────────────────────────────────────────────────────────┤

│ GROSS MARGIN                  $56,100   45.1%   ● Healthy   │

├──────────────────────────────────────────────────────────────┤

│ OPERATING EXPENSES                              ($31,200)   │

│ NET INCOME                    $24,900   20.0%   ● Healthy   │

├──────────────────────────────────────────────────────────────┤

│ JOBS THIS MONTH — sorted by margin                          │

│ J01 Henderson      $37k   42% ●     │  J04 Patel  $18k 18%●│

│ J02 Brown          $28k   31% ●     │  J05 Kim    $52k 38%●│

└──────────────────────────────────────────────────────────────┘

---

## 9\. Component Inventory

Build / customize these from shadcn/ui. Don't roll your own.

**Layout:** AppShell, Sidebar, MobileTabBar, PageHeader, Breadcrumbs, EmptyState, ErrorBoundary, LoadingSkeleton.

**Inputs:** Button, IconButton, Input, Textarea, Select, Combobox, DatePicker, FileUpload, Toggle, Checkbox, RadioGroup, Slider, SearchInput.

**Display:** Card, StatCard, KpiCard, Badge, StatusBadge, StatusDot, Avatar, Tag, Progress, Divider.

**Data:** DataTable (with sort, filter, paginate), KanbanBoard, KanbanColumn, KanbanCard, Calendar, Timeline, GanttRow.

**Feedback:** Toast, Dialog, Drawer, Sheet, Popover, Tooltip, AlertBanner, AndonAlert (special).

**Charts:** LineChart, BarChart, AreaChart, DonutChart (sparingly), Sparkline, PipelineChart (custom for status flow).

**Domain-specific:**

- `JobCard` — used in Kanban \+ lists  
- `SopChecklist` — used in jobs \+ installer portal  
- `EstimateLineItemRow`  
- `InventoryRow`  
- `MarginIndicator` — colored bar with threshold ticks  
- `WipBadge` — column WIP counter with at-max state  
- `AndonButton` — persistent across role layouts  
- `CapacityBar` — used on owner home  
- `EstimateAgingPill` — used on owner home

---

## 10\. State Handling (every screen)

Every data view must explicitly handle these states. No exceptions.

| State | Pattern |
| :---- | :---- |
| **Loading** | Skeleton with the same layout as final content. Never spinners on top-level views. |
| **Empty** | Icon \+ 1-line headline \+ 1-line guidance \+ primary action button. |
| **Error** | Icon \+ "Something went wrong" \+ retry button \+ (in dev) collapsible details. |
| **Partial / stale** | Subtle "Updated 5 min ago" timestamp; pull-to-refresh on mobile. |
| **Offline** | Banner top of page; cached data shown with "offline" tag; queue mutations. (Phase 2 once real backend exists.) |
| **Permission denied** | Friendly "You don't have access to this" \+ who to ask. |

Empty state copy should be specific:

- ❌ "No data"  
- ✅ "No estimates yet. Create your first one to start quoting customers."

---

## 11\. Accessibility

- WCAG 2.1 AA minimum.  
- All status conveyed by color **also** uses an icon or text label (color-blind safe).  
- Focus rings: `ring-2 ring-accent ring-offset-2 ring-offset-background` — visible always, never `outline:none` without a replacement.  
- Touch targets: 44×44px minimum on shop floor / install screens.  
- Forms: every input has a visible label (no placeholder-only labels).  
- Andon alerts: ARIA `role="alert"` and `aria-live="assertive"`.  
- Tested with VoiceOver (iOS), TalkBack (Android), and NVDA (Windows).

---

## 12\. Responsive Breakpoints

screens: {

  'sm':   '640px',   // phone landscape

  'md':   '768px',   // tablet

  'lg':   '1024px',  // small laptop

  'xl':   '1280px',  // desktop

  '2xl':  '1536px',  // large desktop

  'tv':   '1920px',  // wall display (custom)

}

**Behavior at each breakpoint:**

- `< sm`: bottom tab bar, single-column, large touch targets  
- `sm – md`: single-column, sidebar collapsed  
- `md – lg`: two-column where sensible, sidebar icon rail  
- `lg – xl`: full sidebar, multi-column dashboards  
- `xl – 2xl`: max-w-7xl content  
- `tv`: full-bleed dashboard mode, \+1 type size, no sidebar

---

## 13\. Phase 2 Decisions (deferred)

Decisions to make after Phase 1 prototype is working:

1. **Auth provider** — Clerk (fastest, prettiest), NextAuth (free, more control), or Supabase Auth (free, bundles with Supabase DB). Recommendation pending Phase 2\.  
2. **Database** — Supabase (recommended: Postgres \+ Auth \+ Storage \+ Realtime in one), Neon, or self-hosted Postgres.  
3. **File storage** — Supabase Storage (if Supabase chosen), S3, or UploadThing.  
4. **Email transactional provider** — Resend (modern, dev-friendly), Postmark, or SendGrid.  
5. **SMS provider** — Twilio (industry standard) or alternatives.  
6. **Mozaik integration** — read cut lists / parts lists into the Inventory and Job modules. Investigate Mozaik's export formats during Phase 2 planning.  
7. **QuickBooks integration** — sync chart of accounts, invoices, bills. QuickBooks Online API.  
8. **Customer portal** — read-only magic-link page or full login? Decide when v1 is in users' hands.  
9. **E-signature for estimates** — DocuSign, Dropbox Sign, or build minimal e-sign in-app.

---

## 14\. How Claude Code Should Use This Document

1. **Before writing any UI:** read §3 (Design System). Use the exact tokens. Don't introduce new colors, font sizes, or spacing values.  
2. **Before building a module:** read the relevant subsection of §8. Build to the wireframe shape; don't redesign without asking.  
3. **Before adding a status indicator:** read §4.1 and §3.1. Use the right semantic color.  
4. **Before adding animation:** read §3.6. Default is "subtle." The only loud motion is andon.  
5. **Before deciding "we don't need an empty state":** read §10. Yes you do.  
6. **When in doubt about role / permission:** read §5. In Phase 1, only Owner is fully wired.  
7. **When the owner asks for something that conflicts with this doc:** flag the conflict, ask which wins, then update this doc to match.  
8. **When tempted to wire up a real backend:** stop. Phase 1 is mock data only. Add new mock JSON files instead.

---

## 15\. Phase 1 Build Suggestions (non-binding)

If asked "what should I work on next," good order is:

1. **Foundation** — Next.js project, Tailwind config with all tokens from §3, shadcn/ui setup, AppShell with sidebar \+ mobile bottom tabs.  
2. **Owner Home (§7.1)** — the 5 cards with mock data. This proves the design system end-to-end.  
3. **One module deep** — pick Jobs first (§8.3) since it's central. Build the list, the detail page, and the at-risk filter that the owner home links to.  
4. **Estimator (§8.2)** — second-most-important. Includes the "create from customer" and "send for signature" actions from §7.1.  
5. **Shop Kanban (§8.4)** — third, because it's the visual centerpiece for the shop floor.  
6. Remaining modules in any order: CRM → Inventory → SOPs → Installer Portal → P\&L.

This is a suggestion, not a requirement. Owner can redirect Claude Code at any time.

---

*Document version: 0.2 — Phase 1 build, decisions baked in. Update with every meaningful product decision.*  
