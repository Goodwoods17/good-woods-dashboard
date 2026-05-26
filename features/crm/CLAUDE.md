# CRM

Thin shell around `features/contacts/`. The `/crm` route renders the
real Contacts table; the heavy lifting (store, list, detail, form,
combobox, warmth, role pills, aggregates) lives one folder over.

See `features/contacts/CLAUDE.md` for everything that matters.

## What's still here

```
features/crm/
├── CLAUDE.md
└── components/
    ├── CrmView.tsx        (thin: renders <ContactsList /> from features/contacts)
    └── EmptyState.tsx     (the "No contacts yet" empty state)
```

`CrmView` is the entry point for `src/app/crm/page.tsx`. It composes
`useJobs()` + `useContacts()`, computes contact rollups via
`features/contacts/lib/aggregate.ts`, and feeds them into
`ContactsList`. EmptyState is used when there are zero active contacts.

## What used to be here (removed 2026-05-25)

- `ClientsTable.tsx` — pre-CRM-feature derived-from-jobs table; replaced by
  `features/contacts/components/ContactsList.tsx`.
- `lib/aggregate.ts` — `ClientRow` + `computeClients`; replaced by
  `features/contacts/lib/aggregate.ts` (`ContactRollup` + `rollupContacts`).

The `/crm` URL is stable; only the implementation changed.
