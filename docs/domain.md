# Domain Glossary — Cabinetry & Hardware

Terms used across the shop and in this codebase. Use these precisely
in code, comments, variable names, and UI copy.

## Doors

- **Overlay** — how much a door covers the cabinet face frame
  - **Full overlay** — door covers the full face frame
  - **Half overlay** — two doors share one face frame stile
  - **Inset** — door sits flush inside the frame (most demanding fit)
- **Reveal** — the visible gap around an installed door (typically
  1/16" or 2mm; tighter on inset)
- **Stile** — vertical member of a door frame
- **Rail** — horizontal member of a door frame
- **Slab door** — a door with no frame, single panel
- **Shaker door** — frame-and-panel door with flat center panel

## Hinges and hardware

- **Cup** — round recess bored into the back of a door for a
  concealed hinge. Standard diameter is 35mm.
- **Cup depth** — typically 11.5–13mm
- **Cup distance** (from edge of door) — typically 3–5mm depending
  on hinge brand
- **Plate** — mounting hardware on the cabinet side that the hinge
  arm clips onto. Sized by overlay.
- **Hinge boring** — the operation of drilling cup holes
- **Crown / overlay** — common Blum plate sizing terminology
- **Self-closing / soft-close** — hinge mechanism types
- **Compact 38N, Clip Top, Modul** — Blum hinge series names
- **Salice** — alternative hinge brand to Blum

## The 32mm system

European cabinet construction standard. Hardware references a 32mm
grid of holes drilled along cabinet sides. All standard hardware
(slides, hinges, shelf pins) is designed to land on this grid.

## Cabinets and millwork

- **Carcass** — the cabinet box without doors or face frame
- **Face frame** — solid wood frame on the front of a cabinet box
  (North American style). Frameless = European style.
- **Toe kick** — the recessed base under a base cabinet
- **Light rail / valance** — trim under upper cabinets
- **Filler** — strip used to close gaps between cabinets and walls
- **Scribe** — to fit a piece against an irregular surface

## Materials

- **MDF** — medium density fiberboard
- **Melamine** — paper-faced particleboard
- **Plywood (cabinet-grade)** — typically 3/4" maple or birch ply
- **Meranti** — Philippine mahogany; current Jesse/Jamie project
- **VG fir** — vertical-grain Douglas fir; current Jesse/Jamie
  project
- **Edge banding** — thin strip applied to cover plywood/MDF edges

## Finishing

- **Alcea 2K** — the shop's standard finish: 2-component acrylic
- **Sheen** — gloss level: matte, satin, semi-gloss, gloss
  - Shop typical range: matte to satin
- **Stain** — color applied before topcoat; often custom-matched
- **Sealer / topcoat** — coats applied over stain
- **Spray booth** — finishing room with filtered ventilation

## Project terminology

- **Schedule** (as in "door schedule") — the spec sheet listing every
  door in a project with its dimensions, type, and hardware
- **Punch list / deficiency list** — final list of items to fix at
  end of a project
- **Allowance** — pre-agreed budget for hardware or finishes the
  client selects
- **Trade coordination** — managing overlap with other trades
  (electrical, plumbing, etc.) during install

## Parties we work with

Spacecraft has relationships with several kinds of outside party. They are
deliberately distinct concepts — what you pay them _for_ differs, and so
does the record that holds them.

- **Client** — a party that pays Spacecraft for work (homeowner, designer,
  GC, architect). Lives in the contacts table; the **Payer** is the client
  on the hook for a given job. The client relationship carries the sales
  story (revenue, warmth, who introduced them).
- **Supplier** — an outside business Spacecraft _buys goods from_:
  materials, hardware, doors, finishes (e.g. Windsor Plywood, New Surrey
  Cabinet Doors). A supplier is known by the goods it prices (its offers),
  not by labour.
- **Subtrade** — an outside company or person Spacecraft _hires to perform
  work on a job_: install crews, finishers, countertop fabricators,
  electricians, delivery. Canadian construction term. A subtrade is paid
  for **labour/work**, which is what distinguishes it from a Supplier (paid
  for goods) and from **in-house crew** (employees / Users, not a subtrade).
- **Trade** — the discipline a subtrade practises: installer, finisher,
  countertops, electrical, plumbing, delivery, upholstery, other. The set of
  trades is a managed list (the **trade registry**), each carrying a colour and
  an icon for at-a-glance reading. (Also the sense in "trade coordination" above
  — managing overlap with other trades on site.)
- **Trade-line** — a single trade a project _needs_, listed on the project. It
  may be unassigned ("needed, no one booked yet") or filled by a specific
  subtrade. A project has many trade-lines; planning them before the work starts
  is normal. The thing you add with the "Add trade" button. **Phase-tagged** (a
  Toolpath cut → CNC/Cut; a countertop → Install) and carries a **cost** plus
  **schedule dates** (e.g. a countertop's template date + install date), so a
  trade-line feeds **both** the project schedule (its dates land on the timeline)
  and **budget-vs-actual** (its `cost` is the subtrade budget _for its phase_; the
  matching subtrade cost-actual is the actual). Subtrade variance is therefore
  **per-phase**, unlike materials (job-level).

## Workflow & costing

- **Phase** — one of the six workflow stages a job's work and cost group
  under: Design · CNC/Cut · Assembly · Finishing · Delivery · Install. The
  **canonical term** across estimator, labour, and job costing (resolved
  2026-06-20). Stored as `labour_categories` — the table keeps the legacy
  name "category"; we say _phase_. A job's **milestones are these six phases**
  1:1 (ADR 0008), so the current milestone doubles as the schedule gate that
  marks a phase complete (Design = signed drawings/contract/estimate;
  Delivery = all parts on site). Still distinct from `PipelineStatus`, the
  sales pipeline.
- **Cost code** — an Operation (a named unit of shop work) that carries a
  short, unique `code` (e.g. `ASM-BASE`). The shared key that lets budgeted
  vs. actual labour be compared across the estimate, the live timers, and
  the job. **Nests under a Phase (required)** — the phase is its home column on
  the shop-floor kanban, so each code can become a task card there. Cost codes
  are **user-managed data** — added/edited in `/labour → Setup → Cost codes`,
  not hardcoded; a new code added there flows automatically into estimates, the
  frozen budget, and the Budget-vs-Actual tab. Seeded with a starter set (mostly
  install/assembly operations); Andrew extends it as products are spec'd. The
  estimator/budget/P4 resolve codes from this **live registry** (ADR 0012).
- **Work card** — a durable **task on the shop-floor board** on a specific Project.
  Required: a **Phase** (its column) and a **title/description**. Optional: a **Cost
  code** (the precise costing anchor — when set, it fixes the phase) and an
  **assignee** (who owns it). Carries `target_quantity`, a **status** (`todo →
doing → stuck → done`), and a **source** (`budget` / `template` / `manual`).
  Seeded from the frozen **Budget** or a **Job template**, or hand-added by anyone
  on the floor (description required) at job start or mid-job. **Sessions** are the
  time events logged against a card; many workers can each log their own. A card's
  phase is fixed by its code (when coded), so work **advances by status, not by
  dragging between phase columns**. (Replaces the retired `shop_unit` — the
  localStorage station prototype.)
- **Uncoded card / "Needs a code" triage** — a Work card with no Cost code. Its
  time still counts for timekeeping (the Session carries worker + job + duration)
  and attributes to its **phase** as variance, but it is **invisible to the
  per-code learning loop until coded**. Uncoded (and manual) cards surface in a
  **"Needs a code"** queue; an **admin/foreman** assigns an existing code or
  creates a new one — **code creation is admin-only** (in `/labour → Setup`, never
  the floor terminal) to protect the code structure. Once coded, the task feeds
  budget-vs-actual and the next bid.
- **Stuck** — a Work-card status meaning the task **can't proceed** (waiting on
  materials, a defect, a question). Surfaces in the shop-wide **"Needs attention"**
  band — the Andon idea (visible problem, team helps), folded into the card.
  _Distinct from_ the pace band **"blocked"**, which means a running Session is
  _over_ its suggested time. Different axes: workflow vs pace.
- **External blocker** — the **project** is waiting on an **outside party** (a Contact —
  client/homeowner/designer/architect/GC — or a supplier/subtrade) before work can
  continue: client sign-off on shop drawings, designer-approved handles, a permit. Unlike
  a **Stuck** Work card (an _internal_ shop task the crew can unstick), an external blocker
  is **out of the shop's hands** and blocks at the **project / phase** level. Recorded with
  _who_ we're waiting on, _since when_ (so it ages — "stalled 6 days"), and optionally _which
  phase it gates_ (else it's a **whole-job** blocker). It **derives** the job's effective
  `health = blocked` and blocker chip (source of truth; not written through), surfacing in the
  Hitlist, Schedule, briefing, pipeline, and the shop board. A **phase-specific** blocker
  _soft-gates_ that phase's milestone advance (warns, allows); a whole-job blocker flags health
  only and never gates. (Structured `job_blockers` table — Slice B2; ADR 0013.)
- **Driver** — an optional **unit of measure** a cost code's time scales with
  (sheet, board foot, board, linear foot…). A code _with_ a driver tracks
  **minutes per unit** and estimates as `quantity × min/unit`; a code _without_
  one is flat (time-only). Drivers come from a managed unit list (the estimator's
  `ea/sqft/lf/bf` plus `sheet`/`board`) so per-unit averages stay comparable. A
  timer Session on a driven code records the `quantity` done, enabling
  physical-%-complete projection. Maps to quantity on a QuickBooks item line.
- **Session** — one timer run of a Cost code by a Worker on a Project (optional).
  Measures **active time** (below). The unit the shop-floor timer attaches to;
  one **open** Session per worker (starting a new one auto-stops their previous).
  Maps to a QuickBooks **Time Activity** (ADR 0011).
- **Active time** — a Session's hands-on duration, **pauses excluded**. The basis
  for a cost code's historical average, the in-house labour Cost-actual, and pace.
  Wall-clock start→stop is _not_ used. Banked across pause/resume; the full active
  total is fixed on Stop (ADR 0011).
- **Pause** — a within-sitting break in a Session (lunch, interruption); resumes
  the same Session and does not count toward active time. Switching to another
  cost code, or ending the day, is a **Stop** + a new Session later — never a pause.
- **Target quantity** — for a driven Cost code, the planned units entered on
  _Start_ (the "Y" that yields a suggested time). Distinct from `quantity`, the
  actual units done, entered on _Stop_.
- **Suggested time** — the "should take about" target shown on a running timer:
  the outlier-trimmed historical average (per-unit × target quantity for driven
  codes) → else the Budget's bid estimate → else the operation's hand-set default.
  Drives the pace colour.
- **Pace** — active time ÷ suggested time, banded **on-track** (<80%), **at-risk**
  (80–100%), **over** (>100%); the timer's colour language (sage / amber / red),
  reusing the status tones.
- **Budget** — the planned cost frozen on a Job when an estimate is saved:
  **per cost code for labour** (budgeted minutes × phase rate), plus a **single
  job-level material figure** (the estimate's material total). Materials are a
  _fixed_ estimate, not budgeted per phase — a sheet or a door isn't owned by one
  labour phase. Buying more later (an error/replacement, or under-estimated yield)
  shows as **material variance** against that one number. The baseline actuals are
  measured against. (ADR 0012 / P4: labour carries the per-code variance detail;
  material is job-level.)
- **Cost-actual** — an incurred job cost as it lands: in-house labour (from
  timer Sessions), or a logged **Supplier** (material) or **Subtrade**
  payment, optionally attributed to the Partner paid. Distinct from the
  estimate's quoted cost and from the Budget.
- **Subtrade actual** — a logged payment to a subtrade for work on a job;
  a `job_cost_actuals` row with `kind = 'subtrade'`. Tied to the specific
  **trade-line** it settles (`trade_line_id`) and optionally to the
  **Partner** paid (`partner_id`). Logged via the "Log actual cost" form
  on the Budget-vs-Actual tab (Material | Subtrade toggle). Multiple
  actuals can accrue against one trade-line (e.g. deposit + final invoice).
- **Projected margin** — the Budget-vs-Actual tab's headline: `revenue −
projected job cost`, where projected cost locks completed phases to their
  **actual** and assumes open phases at least hit **budget** (overruns persist;
  driven codes project the overrun _now_ from pace). Anchored to the job's
  **quoted margin** (the same number shown on the Pipeline) and moved only by
  _tracked drift_ (labour + material + subtrade variance), so with no actuals it
  equals the quote. **Overhead** is a silent constant inside it — subtracted so
  the figure matches the app's all-in margin everywhere else, but it has no
  actual to track, so it never appears as a variance row and cancels out of
  Clawback. **Subtrade actuals are included** per trade-line (ADR 0015); an
  open trade-line projects to `max(actual, budget)`, a done line locks to its
  actual. The headline is all-in with no caveat label.
- **Trade-line variance** — the difference between a trade-line's projected cost
  and its budget (`max(actual, budget) − job_trades.cost` for an open line;
  `actual − budget` for a done line). The sum across all trade-lines is
  `subtradeDrift`, one of the three components of **Clawback**. An open
  under-budget trade-line contributes zero drift (savings are withheld until
  the line closes).
- **Clawback** — `max(0, budgeted margin − projected margin)`: the dollars a job
  has drifted from its bid. Equals the sum of labour + material overruns (overhead
  and subtrade-budget cancel, being equal on both sides). Zero = on or under bid.
- **Project** — the user-facing name for a **Job** (internal `Job` entity /
  `features/jobs`; QuickBooks calls it a project too). The durable container
  for one piece of work. Over its life a project can take **more than one
  estimate → invoice cycle** (the original plus change orders), so its Budget
  and revenue **accumulate**.
- **Change order** — added or changed scope partway through a project. Handled
  as a **new estimate + new invoice within the same project** — not an edit to
  the original — so the originals stay intact and both budget and revenue grow.
  An unbudgeted mid-job task that is _not_ a change order (rework, scope creep)
  correctly shows as variance against the existing budget.
- **Estimate** — a light record of one budgeting cycle on a project (the original
  or a change order); owns its budget lines (per cost code + per phase). The
  durable summary the estimator emits on _Save as Job_ — not a re-editable
  document. Maps to a QuickBooks **Estimate** (see ADR 0010).
- **Invoice** — a light record of one revenue cycle on a project; its amount adds
  to the project's revenue. Maps to a QuickBooks **Invoice**. A project's total
  revenue = Σ its invoices.
- **Job template** — a named, reusable definition of a _job type_ (e.g. "Full
  kitchen", "Install only", "Spray finishing only"). Defines which quote sections
  show, the **set of cost codes** the job uses, and default overhead/markup. It
  **references** cost codes (it does not copy them — codes stay in Labour). One
  concept; supersedes the former split between estimator section-templates and the
  P2b cost-code task templates (**ADR 0012**). A template carries the _task set_,
  not fixed quantities — those come per-job (manual entry or a Mozaik import).
- **Mozaik import** — dropping a Mozaik pricing-export CSV onto an estimate to
  auto-fill the **cabinet counts, material BOM, and labour breakdown** (quantities
  - structure only). The app **re-prices** with its own catalog + labour rates +
    cost codes; Mozaik's dollar amounts are not used as the budget. Lands as a draft
    estimate to review, then _Save as Job_ freezes the budget (**ADR 0012**). Sample:
    `docs/samples/mozaik-export-sample.csv`.
- **QuickBooks mapping** — the costing model is shaped to map 1:1 onto QuickBooks
  for a future integration: Project→Project, Payer→Customer, Estimate→Estimate,
  Invoice→Invoice, **Phase→Class**, **Cost code→Item**, Worker→Employee,
  Session→Time Activity, Supplier/Subtrade→Vendor, cost-actual→Bill/Expense. Full
  table + rationale in ADR 0010.

## Add new terms here

When introducing a domain term in code, add it here first.
