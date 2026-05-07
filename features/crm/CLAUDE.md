# CRM

Client list derived from jobs — no separate clients table.

## What it does

Single page (`/crm`) listing every distinct `client` string seen across
jobs. For each client it shows:

- Number of jobs (active + completed)
- Lifetime revenue
- Lifetime margin
- Most recent install date

Click a client → links to a filtered jobs view for that client.

## Where things live

Page logic in `src/app/crm/page.tsx` — pure derivation from
`useJobs()`. No feature-specific lib code, no separate clients store.

## Domain notes

- A "client" is identified by exact string match on `job.client`. There's
  no fuzzy matching, no aliasing — "Raubyn Studio" and "Raubyn studio"
  would split. If that becomes a problem, normalise on save.
- "Lifetime margin" uses `computeMargin` (revenue − cost) summed across
  all the client's jobs.

## When to revisit

- A real contacts schema is needed (multiple contacts per client, phone,
  email, address book) → `client` becomes a foreign key to a real
  `clients` table; this page becomes a list view of that table.
- Per-client communication history (calls, emails, notes) → that's
  proper CRM territory, plan it as a real feature.
