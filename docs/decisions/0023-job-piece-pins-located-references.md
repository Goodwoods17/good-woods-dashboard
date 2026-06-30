# 23. `job_piece_pins` — located 1:N cabinet↔drawing references

Date: 2026-06-29
Status: Accepted (S8a, milestone #12 — `supabase/migrations/20260719000000_job_piece_pins.sql`)

## Context

A "piece" (`job_pieces`; a cabinet is a piece with `kind:"cabinet"`) is linked to
its drawing today by **four denormalized columns** on the piece row:
`pin_document_id` (bare `text`, no FK), `pin_page`, `pin_x`, `pin_y` — a single
_located_ pin (a marker at normalized x/y on a page of one document). This is the
project's standard "no junction tables — every link is a denormalized column"
posture (codified in the `job_status` home-table model: each trackable item lives
in exactly one home table, no junction, no duplication).

The relationship is **1:1**: a piece pins to exactly one drawing, set at creation
when the piece is placed onto the active drawing. But a real cabinet appears on
**multiple** drawing sheets — a plan, an elevation, a section/detail — each a
distinct located reference. The shop's `R#C#` code is the join key printed on the
sheet that ties a pin ↔ the checklist piece ↔ Mozaik data ↔ the piece's
components. There is no way today to record that one cabinet is documented across
several drawings.

The adjacent field names are already taken: `job_pieces.source` /`source_ref`
denote **import provenance** (`manual` / `mozaik`), not a drawing link — so the
cross-link cannot reuse them.

## Decision

Promote the single embedded pin into a dedicated **`job_piece_pins`** table —
**N located pins per piece** — accepting this as the **first deliberate deviation**
from the no-junction-tables pattern, because a located reference that is genuinely
many-per-piece is the one case the denormalized-column model can't express.

**Schema:** `id`, `job_piece_id` → `job_pieces(id)` cascade, `document_id` →
`documents(id)` cascade, `page`, `x`, `y`, `role` (e.g. plan / elevation / detail),
`is_primary` bool, `created_at` / `created_by`. A **partial unique index**
`(job_piece_id) WHERE is_primary` enforces exactly one primary pin per piece — the
primary preserves every current single-pin behavior (the checklist marker, the
"jump to it on the drawing" target). Realtime: register `job_piece_pins` on
`supabase_realtime` and add a pins subscription.

**Migration — strict order** (the pre-mortem found two CRITICALs that dictate it):

1. **Build + backfill, no drop.** Create the table; back-fill existing pins as
   `is_primary=true`, only `WHERE pin_document_id IS NOT NULL`. The FK can't be
   added naively: `documents.id` is **uuid** but `pin_document_id` is **text**, and
   orphans exist (documents are hard-deleted with no null-out of referencing
   pieces). So: cast `::uuid`, skip rows with no matching document, add the FK
   `NOT VALID` then `VALIDATE`. Add realtime + the pins store. Keep the old `pin_*`
   columns populated (dual-read).
2. **Refactor + deploy.** `pieceToRow` / `PieceRow` stop emitting `pin_*`, and the
   three full-row write sites (`piecesStore` create/update, **and the job-status
   board's `jobProgressStore.cyclePiece`**) switch to narrow column updates — a
   plain column DROP while `pieceToRow` still emits `pin_*` would 400 **every piece
   status change in both Drawings and the job-status board**. The pin overlay
   (`PiecePin`, `docPins`) iterates the pins collection; piece+primary-pin create
   becomes one atomic persist with combined rollback.
3. **Drop** the four `job_pieces.pin_*` columns — only after step 2 is deployed and
   verified.

## Consequences

- **Positive:** a cabinet can reference multiple drawings with per-sheet location;
  the bare-text `pin_document_id` becomes a real FK with cascade cleanup (closing
  a latent orphan-integrity gap); reverse navigation ("which cabinets reference
  this drawing") becomes a clean query, enabling the document→pieces reverse panel.
- **Cost:** first junction-shaped table in the codebase — a conscious exception to
  the no-junction rule, justified by the located-many-per-piece requirement that
  the denormalized model cannot hold. Future located N:M links should weigh this
  precedent, not treat it as license for junctions generally.
- **Risk:** refactors a **live** feature (Drawings) plus the job-status board
  write path; mitigated by the strict 3-step order, dual-read, atomic create, and
  realtime registration before the UI reads the new table. The localStorage
  fallback keeps the embedded-pin shape (or version-bumps its key).

## Related

- ADR 0016 — active drawings in Supabase (the drawing side of the link).
- `docs/domain.md` — Piece / Cabinet / R#C# / Pin glossary (Pin redefined here as a
  located reference, now N per piece).
- The `job_status` home-table architecture note (`20260628000000_job_status.sql`
  header) — the "no junction tables" posture this ADR deliberately excepts.
- ADR 0022 — `share_tokens` (the other Tier-2 schema decision).
