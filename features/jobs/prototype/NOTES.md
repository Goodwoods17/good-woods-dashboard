# Jobs Pipeline — UI Prototype

**Question:** What's the right primary lens for the Jobs Pipeline view at `/`?
The current ship (list ↔ kanban toggle) leads with **status as a category**.
What if the lead axis were **time**, **money**, or **process flow** instead?

**Sub-shape:** A (variants live inside the existing `/` route, swapped by `?variant=`).
Default with no param = current production view (list/kanban toggle).
Switcher is dev-only (hidden when `NODE_ENV === 'production'`).

## Variants

| Key | Name             | Lead axis                | Best at answering…                              |
|-----|------------------|--------------------------|-------------------------------------------------|
| A   | Schedule         | Time (install date)      | "What's coming out the door, and when?"         |
| B   | Cashflow         | Money (rev/margin)       | "How does the next 90 days of cash look?"       |
| C   | WIP / Funnel     | Process stage occupancy  | "Where's work piling up? What's stuck?"         |

## How to run

```
cd "C:\Users\andre\Desktop\Andrew Vibes\good-woods-dashboard"
npm run dev
```

Then visit:
- `http://localhost:3000/` — current view (baseline)
- `http://localhost:3000/?variant=A` — Schedule
- `http://localhost:3000/?variant=B` — Cashflow
- `http://localhost:3000/?variant=C` — WIP / Funnel

Floating switcher at the bottom-centre cycles between Current ↔ A ↔ B ↔ C. `←` / `→` keys also cycle (unless typing in an input).

## Verdict (fill in when picked)

- **Winner:** _TBD_
- **Why:** _TBD_
- **Bits to steal from losers:** _TBD_

When a winner is picked, fold it into the existing page and delete this folder.
