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
- [x] **Store + rowMap + provider** — `refaceStore.tsx` (dual supabase/localStorage backend,
      optimistic + rollback, `refresh`), `refaceRowMap.ts`; `<RefaceProvider>` mounted in
      `src/app/layout.tsx` inside `<ShopProvider>`.
- [x] **Pure libs** — `dimensions.ts` (ported parsing + `formatFraction`), `sqft.ts`
      (w·h·qty/144 + rollups), `newSurreyPriceBook.ts` (seed + lookup), `pricing.ts` (cost,
      doors+drawers only, no minimum), `storage.ts` (upload/sign + natural dims, data-URL
      fallback offline). Plus `importElements.ts` (labeler, manual-pin factory, DetectedElement
      validation) and `exporters.ts` (CSV / text).
- [x] **UI + route + nav** — RefaceView, ProjectList, ProjectWorkspace, PhotoAnnotator,
      ElementPin, ElementCard, ImportDetected, SummaryPanel, OrderSettingsForm, ExportMenu;
      `src/app/reface/page.tsx`; `{ href: "/reface", label: "Reface Studio", icon: ScanLine }`
      in the Build section of `Sidebar.tsx`.
- [x] **Order-form export** — `exceljs` installed; template at `public/reface/wood-doors-order-form.xlsx`
      (provenance copy in `assets/`); `orderForm.ts` fills the **verified** cell map (doors B/C/D/E
      rows 16–38, drawer fronts I/J/L/M rows 25–37, header C6:C13 / K6/K8/K9 / I3 / grain / boring),
      overflow → extra forms + `console.warn`. Round-trip smoke-tested against the real file.
- [x] **CLAUDE.md + verify** — `features/reface/CLAUDE.md` written. Gate green: `npx tsc --noEmit`,
      `npm run lint`, `npx prettier --check`, `npm run build` all pass. Browser smoke test pending
      (Claude-in-Chrome can't bridge into WSL — run manually at `/reface`).

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
