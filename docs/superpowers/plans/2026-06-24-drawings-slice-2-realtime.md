# Drawings — Slice 2 (Realtime piece sync) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** A piece status / pin change made on one device shows up on every other device within ~1s, no refresh — via Supabase Realtime on `job_pieces`.

**Architecture:** Add a `postgres_changes` subscription to `piecesStore` (Supabase backend only). INSERT/UPDATE → upsert the row by id; DELETE → remove by id. Patching is **idempotent by id**, so our own optimistic writes echo back harmlessly and other clients' writes merge in. Conflict policy = last-write-wins (decided in the grill). Markup/ink stays load-on-open (NOT realtime) per the bedtime decision.

**Tech Stack:** Supabase Realtime (`@supabase/supabase-js` channels) · the `job_pieces` table already has `ALTER PUBLICATION supabase_realtime ADD TABLE` from Slice 1.

## Global Constraints

- Same as Slice 1 (path aliases, tokens, RLS authenticated, gate before commit). No new deps.
- Subscription only when `hasSupabase()`; clean up on unmount. Idempotent patching (no double-add on INSERT echo).

---

### Task 1: Realtime subscription in `piecesStore`

**Files:**
- Modify: `features/drawings/lib/piecesStore.tsx`

**Interfaces:**
- Consumes: `getSupabase`, `JOB_PIECES_TABLE`, `rowToPiece`/`PieceRow`, the existing `piecesRef`.
- Produces: live `pieces` state that patches on remote changes. No API change to `usePieces`/`useProjectPieces`.

- [ ] **Step 1: Add the subscription effect** (after the load effect, before the mutators)

```tsx
useEffect(() => {
  if (backend !== "supabase") return;
  const sb = getSupabase();
  const channel = sb
    .channel("job_pieces_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: JOB_PIECES_TABLE },
      (payload) => {
        setPieces((cur) => {
          let next = cur;
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string })?.id;
            next = id ? cur.filter((x) => x.id !== id) : cur;
          } else {
            const piece = rowToPiece(payload.new as PieceRow);
            next = cur.some((x) => x.id === piece.id)
              ? cur.map((x) => (x.id === piece.id ? piece : x))
              : [...cur, piece];
          }
          piecesRef.current = next;
          return next;
        });
      }
    )
    .subscribe();
  return () => { sb.removeChannel(channel); };
}, [backend]);
```

- [ ] **Step 2: Gate** — `npx tsc --noEmit && npm run lint && npm test && npm run build`. Expected: green; 75 tests still pass (pure logic untouched).

- [ ] **Step 3: Commit**

```bash
git add features/drawings/lib/piecesStore.tsx
git commit -m "feat(drawings): realtime job_pieces subscription (Slice 2)"
```

---

### Task 2: Two-client realtime smoke + merge (DoD)

- [ ] **Step 1: Smoke** — `PORT=3003 npm run dev`; open the same job's `/drawings` in two browser contexts (both authed). Upload a drawing + add a piece in context A; confirm it appears in context B within ~1s. Advance status in B; confirm A reflects it without refresh. Delete in A; confirm it leaves B. Zero console errors. Clean up test data.
- [ ] **Step 2: Merge decision** — if gate + the two-client smoke pass: push, PR, auto-merge to main. Else: PR + a note on what blocked.

## Self-Review

- Realtime on `job_pieces` filtered by table (store holds all pieces; patch by id) → Task 1. ✅
- Idempotent INSERT/UPDATE/DELETE (own echo safe) → Task 1. ✅
- Ink stays non-realtime (untouched) → by omission. ✅
- DoD two-client < ~1s → Task 2. ✅
- **Assumption:** subscribe to the whole `job_pieces` table (not per-project filtered) since the store already holds all pieces and patches by id; fine at single-shop scale. A `project_id` server-side filter is a later optimization.
