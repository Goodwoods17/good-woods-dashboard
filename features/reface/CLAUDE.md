# Reface Studio — feature spec

Standalone tool under the **Build** sidebar section (`/reface`). Photograph a
kitchen → pin & size every door, drawer front, end panel and toe kick → reference
each off the photo with numbered pins → cost the door order against New Surrey
Cabinet Doors' per-sqft price book → export the filled **Wood Doors order form**
(.xlsx). Architected to grow into Andrew's `door-sizer.html` (voice dictation,
hinge logic, supplier order reconciliation).

> Canonical plan + extracted data (price book, order-form cell map, schema) live
> in `PLAN.md` (this folder) and `~/.claude/plans/i-want-to-make-snazzy-sifakis.md`.

## How it works

- **Manual pins are the always-on core.** Tap the photo to drop a pin of the
  active kind; tap a pin to edit kind / location / real W×H / qty / add-ons. Ref
  labels auto-assign per kind, project-wide: `D1, D2…` / `DR1…` / `EP1…` / `TK1…`.
- **AI auto-detect runs through Claude Code ($0), not the app API.** No
  `ANTHROPIC_API_KEY`, no metered spend. Claude Code reads the photo, emits a
  `DetectedElement[]` JSON, and either (primary) `INSERT`s into `reface_elements`
  via the Supabase MCP — Andrew taps **Refresh** — or (fallback) Andrew pastes the
  JSON into **Import AI detection**. Detected pins are `aiGuess` (unconfirmed
  badge) until edited/confirmed, because dimensions are standard-sizing guesses,
  not true inches read off a photo. Confirmed W×H drive sqft and cost.
- **Square footage** = `widthIn × heightIn × qty / 144` per element (`sqft.ts`),
  rolled up per kind + total across all photos.
- **Door-order cost** (`pricing.ts` + `newSurreyPriceBook.ts`): per orderable line
  `sqft × baseRate + finishSurcharge×sqft + perSqftAddons×sqft + perUnitAddons`,
  **no per-door minimum**, + a manual courier `shippingCost` (billed by weight).
  Only **doors + drawer fronts** are costed/ordered (the Wood Doors form scope).
- **Order-form export** (`orderForm.ts`, `exceljs`): loads the bundled blank
  template, fills cells preserving branding/merges, downloads client-side. Doors
  → left table (Sr 1–23), drawer fronts → right table (Sr 24–36). Overflow spills
  onto extra forms (logged, never truncated). Plus CSV + plain-text export
  (`exporters.ts`).

## Data model

- TypeScript: `lib/types.ts` (`RefaceProject` → `RefacePhoto[]` → `RefaceElement[]`,
  `OrderSettings`, `DetectedElement`, `ElementKind`).
- Supabase: `reface_projects` / `reface_photos` / `reface_elements` (+ private
  `reface-photos` Storage bucket). Migration `supabase/migrations/20260604_reface_studio.sql`,
  applied to the live project. Store: `lib/refaceStore.tsx` (dual Supabase /
  localStorage backend, optimistic + rollback, `refresh`), rows↔types in
  `lib/refaceRowMap.ts`. Elements live in their own table (not embedded jsonb) so
  the door-sizer roadmap can query/update individual elements.

## Order-form template

Bundled at `public/reface/wood-doors-order-form.xlsx` (fetched client-side at
export time) with a provenance copy at `assets/wood-doors-order-form.xlsx`. Cell
map is **verified against the file** (sheet `Wood`, see `orderForm.ts` header):
product spec → `C6:C13`, customer PO/name/address → `K6/K8/K9`, order date `I3`,
grain `K16/K17` + `N16/N17`, boring `M20:M22`; doors `B/C/D/E` rows 16–38, drawer
fronts `I/J/L/M` rows 25–37. Company/phone/email are template constants.

## Non-goals (Phase 1)

No pricing UI in Catalog/Estimator yet · no voice dictation · no hinge logic · no
supplier order reconciliation · no end-panel / toe-kick order form (those count
toward sqft only). Roadmap P2–P8 in `PLAN.md`.

## Known seed caveat

The New Surrey price PDF is image-only (no text layer), so `newSurreyPriceBook.ts`
figures come from the build memo. One unverified detail is flagged inline: PVC has
5 price columns but only 4 named finishes; the 5th (slab-only, $14) is labelled
"Super Gloss" pending confirmation when the book moves to the Catalog (P2).
