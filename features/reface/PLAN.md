# Reface Studio — implementation plan (Phase 1)

Standalone tool under the **Build** sidebar section. Photograph a kitchen → count &
size doors / drawer fronts / end panels / toe kicks → reference each off the photo with
numbered pins → auto-populate New Surrey's **Wood Doors order form** (.xlsx) → **cost the
order** against New Surrey's per-sqft price book. Architected to grow into Andrew's
`door-sizer.html` (voice dictation, hinge logic, supplier order reconciliation).

> **Resume / source of truth:** the full approved plan is at
> `~/.claude/plans/i-want-to-make-snazzy-sifakis.md`, and the exact build state +
> extracted data (price book, order-form cell map, schema) live in the memory entry
> **`project-reface-studio-build.md`** (pinned under ⏰ Active in `MEMORY.md`). Read those
> first — they hold everything needed to continue without re-deriving anything.

## Status

- [x] **Supabase migration applied to the live (shared) project** — `reface_projects`,
      `reface_photos`, `reface_elements` + private `reface-photos` Storage bucket. Do not
      re-apply. Repo copy: `supabase/migrations/20260604_reface_studio.sql`.
- [x] **`lib/types.ts`** — ElementKind, RefaceElement, RefacePhoto, OrderSettings
      (+ defaultOrderSettings), RefaceProject, DetectedElement; ref prefixes D/DR/EP/TK.
- [ ] **Store + rowMap + provider** — `refaceStore.tsx` (mirror `features/contacts/lib/
    contactsStore.tsx`: Context, dual supabase/localStorage backend, optimistic +
      rollback, `refresh`), `refaceRowMap.ts`; mount `<RefaceProvider>` in `src/app/layout.tsx`.
- [ ] **Pure libs** — `dimensions.ts` (port parsing + fraction formatter from door-sizer.html),
      `sqft.ts` (w·h·qty/144 + rollups), `newSurreyPriceBook.ts` (seed), `pricing.ts` (cost),
      `storage.ts` (upload/sign + natural dims).
- [ ] **UI + route + nav** — RefaceView, ProjectList, PhotoAnnotator, ElementPin, ElementCard,
      ImportDetected, SummaryPanel, OrderSettingsForm, ExportMenu; `src/app/reface/page.tsx`;
      `{ href: "/reface", label: "Reface Studio" }` in the Build section of `Sidebar.tsx`.
- [ ] **Order-form export** — `npm i exceljs`; bundle `assets/wood-doors-order-form.xlsx`;
      `orderForm.ts` fills cells (doors → A16:E38, drawer fronts → H25:N37), overflow + log().
- [ ] **CLAUDE.md + verify** — spec/non-goals/roadmap; then tsc + lint + prettier + build + browser smoke test.

## Key decisions (locked)

- Manual pins are the always-on core; **AI auto-detect runs via Claude Code ($0), not the
  app API** — no `ANTHROPIC_API_KEY`, no metered spend. Ingest `DetectedElement[]` (Supabase
  MCP insert, or paste-JSON fallback); pins flagged `aiGuess` until confirmed.
- Per-element confirmed W×H drive sqft (AI only pre-fills guesses — it can't read true inches).
- Element types: door, drawer, end_panel, toe_kick. End panels + toe kicks count toward sqft
  but are **off** the Wood Doors form (separate form is a later phase).
- Standalone tool with an **optional** link to an existing Job (fills order-form customer info).
- Pricing: `cost = Σ(sqft × rate + add-ons)`, no minimum, + manual courier shipping (by weight).
  Price book home moves to **Catalog** next (P2), wired into the Estimator after.

## Non-goals (Phase 1)

No pricing UI in Catalog/Estimator yet, no voice dictation, no hinge logic, no order
reconciliation, no end-panel order form. See the roadmap (P2–P8) in the memory entry.
