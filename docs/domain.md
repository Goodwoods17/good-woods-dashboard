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
deliberately distinct concepts — what you pay them *for* differs, and so
does the record that holds them.

- **Client** — a party that pays Spacecraft for work (homeowner, designer,
  GC, architect). Lives in the contacts table; the **Payer** is the client
  on the hook for a given job. The client relationship carries the sales
  story (revenue, warmth, who introduced them).
- **Supplier** — an outside business Spacecraft *buys goods from*:
  materials, hardware, doors, finishes (e.g. Windsor Plywood, New Surrey
  Cabinet Doors). A supplier is known by the goods it prices (its offers),
  not by labour.
- **Subtrade** — an outside company or person Spacecraft *hires to perform
  work on a job*: install crews, finishers, countertop fabricators,
  electricians, delivery. Canadian construction term. A subtrade is paid
  for **labour/work**, which is what distinguishes it from a Supplier (paid
  for goods) and from **in-house crew** (employees / Users, not a subtrade).
- **Trade** — the discipline a subtrade practises: installer, finisher,
  countertops, electrical, plumbing, delivery, upholstery, other. The set of
  trades is a managed list (the **trade registry**), each carrying a colour and
  an icon for at-a-glance reading. (Also the sense in "trade coordination" above
  — managing overlap with other trades on site.)
- **Trade-line** — a single trade a project *needs*, listed on the project. It
  may be unassigned ("needed, no one booked yet") or filled by a specific
  subtrade. A project has many trade-lines; planning them before the work starts
  is normal. The thing you add with the "Add trade" button.

## Workflow & costing

- **Phase** — one of the six workflow stages a job's work and cost group
  under: Design · CNC/Cut · Assembly · Finishing · Delivery · Install. The
  **canonical term** across estimator, labour, and job costing (resolved
  2026-06-20). Stored as `labour_categories` — the table keeps the legacy
  name "category"; we say *phase*. A job's **milestones are these six phases**
  1:1 (ADR 0008), so the current milestone doubles as the schedule gate that
  marks a phase complete (Design = signed drawings/contract/estimate;
  Delivery = all parts on site). Still distinct from `PipelineStatus`, the
  sales pipeline.
- **Cost code** — an Operation (a named unit of shop work) that carries a
  short, unique `code` (e.g. `ASM-BASE`). The shared key that lets budgeted
  vs. actual labour be compared across the estimate, the live timers, and
  the job. Nests under a Phase.
- **Driver** — an optional **unit of measure** a cost code's time scales with
  (sheet, board foot, board, linear foot…). A code *with* a driver tracks
  **minutes per unit** and estimates as `quantity × min/unit`; a code *without*
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
  Wall-clock start→stop is *not* used. Banked across pause/resume; the full active
  total is fixed on Stop (ADR 0011).
- **Pause** — a within-sitting break in a Session (lunch, interruption); resumes
  the same Session and does not count toward active time. Switching to another
  cost code, or ending the day, is a **Stop** + a new Session later — never a pause.
- **Target quantity** — for a driven Cost code, the planned units entered on
  *Start* (the "Y" that yields a suggested time). Distinct from `quantity`, the
  actual units done, entered on *Stop*.
- **Suggested time** — the "should take about" target shown on a running timer:
  the outlier-trimmed historical average (per-unit × target quantity for driven
  codes) → else the Budget's bid estimate → else the operation's hand-set default.
  Drives the pace colour.
- **Pace** — active time ÷ suggested time, banded **on-track** (<80%), **at-risk**
  (80–100%), **over** (>100%); the timer's colour language (sage / amber / red),
  reusing the status tones.
- **Budget** — the planned cost frozen on a Job when an estimate is saved:
  per cost code for labour (budgeted minutes × phase rate), per phase for
  materials. The baseline actuals are measured against.
- **Cost-actual** — an incurred job cost as it lands: in-house labour (from
  timer Sessions), or a logged **Supplier** (material) or **Subtrade**
  payment, optionally attributed to the Partner paid. Distinct from the
  estimate's quoted cost and from the Budget.
- **Project** — the user-facing name for a **Job** (internal `Job` entity /
  `features/jobs`; QuickBooks calls it a project too). The durable container
  for one piece of work. Over its life a project can take **more than one
  estimate → invoice cycle** (the original plus change orders), so its Budget
  and revenue **accumulate**.
- **Change order** — added or changed scope partway through a project. Handled
  as a **new estimate + new invoice within the same project** — not an edit to
  the original — so the originals stay intact and both budget and revenue grow.
  An unbudgeted mid-job task that is *not* a change order (rework, scope creep)
  correctly shows as variance against the existing budget.
- **Estimate** — a light record of one budgeting cycle on a project (the original
  or a change order); owns its budget lines (per cost code + per phase). The
  durable summary the estimator emits on _Save as Job_ — not a re-editable
  document. Maps to a QuickBooks **Estimate** (see ADR 0010).
- **Invoice** — a light record of one revenue cycle on a project; its amount adds
  to the project's revenue. Maps to a QuickBooks **Invoice**. A project's total
  revenue = Σ its invoices.
- **QuickBooks mapping** — the costing model is shaped to map 1:1 onto QuickBooks
  for a future integration: Project→Project, Payer→Customer, Estimate→Estimate,
  Invoice→Invoice, **Phase→Class**, **Cost code→Item**, Worker→Employee,
  Session→Time Activity, Supplier/Subtrade→Vendor, cost-actual→Bill/Expense. Full
  table + rationale in ADR 0010.

## Add new terms here

When introducing a domain term in code, add it here first.
