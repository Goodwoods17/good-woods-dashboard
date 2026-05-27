# Critique snapshot — /jobs/new, /projects, DocumentsCard

**Date:** 2026-05-27 overnight (Andrew asleep)
**Surfaces:** `src/app/jobs/new/page.tsx`, `features/projects/components/ProjectsView.tsx`, `features/documents/components/DocumentsCard.tsx`
**Context:** Self-critique against `PRODUCT.md` (sharp, quiet, focused) + `DESIGN.md` (Lit Workshop). Not a full `/impeccable critique` run (skipped the multi-pass + mock-gen workflow at this hour); this is the heuristic pass to surface obvious wins for morning review.

**Estimated score:** 30–33 / 40 across these surfaces. The recently-shipped `/` baseline scored ~33/40 after the polish pass; these new surfaces are slightly behind because they're rev-1 and haven't been through a polish cycle.

---

## P0 — design contract violations (none, but two near-misses)

- **None confirmed.** The 4 P0 contracts from the original CRM Contacts review (Payer-required progressive disclosure, inline mini-form not Modal, clay-soft warmth chip, no em dashes) are still honoured across the new surfaces.
- **Near-miss / verify in the morning:** the `/jobs/new` form is now LONG when in Full mode (8+ cards). It still works because each card has a single visual rhythm, but the "one primary action per surface" principle is getting stretched. Mitigation: the Quick-mode toggle reduces it to 1 card, which is the answer to that concern. Just keep an eye on it.

## P1 — visible cleanups (3)

1. **`/jobs/new` Identity card has a lot of optional buttons stacked.** Order is: phone lookup → project name → payer combobox → "Sold by designer" template button → source picker → optional contact slots (toggled) → Add-X chips → address. That's 5 distinct action types in one card. Could group into a clearer sub-rhythm with mini-headers ("Who", "Where they came from", "Who else", "Where") — same fields, less visual fatigue.

2. **DocumentsCard's two-column preview layout collapses awkwardly on tablet.** At `lg:grid-cols-5` it's list-2/preview-3 ratio on desktop. On md (tablet) it stacks list-above-preview, which is correct but the preview iframe is full-width and pushes the page very long. Consider a "Hide preview" toggle when on smaller screens, or default to closed-preview state on first load (user clicks a row to expand). 

3. **ProjectsView search now matches source text** (just added) — but the placeholder still reads `"Search code, name, or payer"`. Update to `"Search code, name, payer, or source"` so users discover the new behaviour.

## P2 — copy + microcopy (4)

4. **"How did they find us?" field hint should clarify it's required and feeds attribution.** Currently the label has a required asterisk but no explanation of WHY. One-line caption: *"Tells the dashboard which anchor designer or channel sent them. Powers the daily briefing's stale-anchor nudges."*

5. **"Sold by designer" button copy is long for what it is** ("Sold by a designer? Pre-fill from their last project"). Shorten to *"Pre-fill from a designer"* once the user has seen it once. Could add `useState` to track "first visit" → show the long version once, then collapse to the short one.

6. **Quick mode hint feels apologetic** (*"Saves with sensible defaults..."*). Reframe as a positive — *"Quick capture. Payer + name + source. Everything else fills in from the project page later."*

7. **Document type chip "Toolpath CNC" wraps awkwardly on narrow viewports** because it's two words. Consider `"CNC"` short label for the chip itself, full label as the title attribute. Or `whitespace-nowrap` on the chips so they overflow horizontally rather than wrap.

## P3 — small polish (5)

8. **The phone-lookup suggestion bar appears with clay-soft background** — but only fires when there's a match. Empty state (no match found after typing 6+ digits) currently shows nothing, which can feel broken. Tiny caption when query > 5 digits + no match: *"No returning client matches. Continue with a new payer below."*

9. **Estimated vs Final revenue caption** ("Estimated stays fixed for quote-accuracy tracking. Final revenue updates as costs land.") is dense. Could split into two field hints, one per input, so each field carries its own explanation.

10. **DocumentsCard empty state CTA reads "Add the first document"** — good. But the explanatory paragraph above lists 6 doc types in one breath; could break to a small inline list for scannability.

11. **DocumentsCard delete button is a quiet trash icon in the preview header — easy to fumble.** Consider a hover-reveal pattern (delete only appears when user hovers the document row in the list, not always-visible in the preview pane).

12. **Source picker presets show "Other" as a chip that triggers a text input.** Once typed, the chip + input both stay visible. Could collapse the chip row to just "Other: <value>" once a custom source is entered, with an "Edit" affordance to swap back.

## Pass — already on-brand

- Ghost-Border Rule honoured throughout: cards use `bg-white` + `shadow-resting`, no full borders on cards.
- Rare-Accent Rule honoured: clay used only on phone-lookup suggestion + "Sold by designer" CTA + pet warmth pill + sub-chip. Surfaces stay neutral.
- Eight-feet glance pattern reused: clay dot on anchor contacts surfaces in DocumentsCard, ContactsList, JobDetail Parties card. Consistent.
- Mode toggle at top of /jobs/new is a clean affordance, segmented-pill vocabulary matching ViewToggle on `/`.
- DocumentsCard's two-column inline preview is a strong UX move — saves the round-trip to Drive + back.
- Em-dash discipline maintained across the new copy (periods, commas, parentheses used throughout).

## Schema + architecture notes (not visual, but flagged for completeness)

- `briefings` RLS was relaxed to anon-CRUD (matches `jobs` / `contacts` / `documents`). Single-user posture; revisit when multi-user auth lands.
- The remote routine `trig_01R3cjtz9H7kPdThjtGxTNHX` is the new source of truth for daily briefings. Vercel cron disabled. The manual regenerate button still uses the Anthropic API — could be switched to call the routine via API for full parity, but that's polish-tier work.
- `Job.payerId` still optional in TS while DB enforces NOT NULL — flagged in earlier commits, still the right call until SEED_JOBS retires.

## Recommended morning sequence (if you want to act on this)

1. Run the 5-minute test plan from the feature-tour PDF (page 13) — confirm the 7 features still work as expected.
2. Pick 2-3 P2/P3 items above and ask me to ship as one cleanup commit.
3. Decide push-vs-merge for the branch (12 commits ahead of main).
4. Top up Anthropic API credits ($10) only if you want the manual regenerate button to stay live alongside the routine — otherwise the routine is the sole source.
