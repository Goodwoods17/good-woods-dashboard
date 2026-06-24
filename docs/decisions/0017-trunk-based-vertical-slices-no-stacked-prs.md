# 17. Trunk-based vertical slices: land each slice to `main`, no stacked PRs

Date: 2026-06-24
Status: Accepted

## Context

We build features as a chain of **vertical slices** (e.g. Drawings Slices 0–5).
Slice N+1 usually depends on Slice N. Twice now we have tried to ship a
dependency chain as **stacked PRs** — each slice on a branch based on the slice
below it (`slice-3 ← slice-4 ← slice-5`) — and both times it caused avoidable
pain:

- **2026-06-22:** a 4-deep stack; deleting a base branch auto-closed the PR above
  it. Recorded in `build-workflow-standard` memory as "don't deep-stack."
- **2026-06-24 (Drawings 3–5):** a 3-deep stack. Squash-merging the bottom PR
  (#24) **deleted its branch, which auto-closed the next PR (#25)**. Squash also
  rewrites history, so the upper branches still carried the original pre-squash
  commits and showed phantom conflicts against `main`; each had to have `main`
  merged back in and conflicts resolved by taking `--ours`. A `git add -A` during
  that recovery swept an untracked root file into a commit. CI did not re-trigger
  when a PR was retargeted. ~30 minutes of pure overhead on an otherwise clean build.

The mechanics are well understood industry-wide: **squash and rebase rewrite
commit hashes**, which breaks the identity links a stack relies on; deleting a
merged base branch closes downstream PRs; `pull_request` CI fires on
opened/synchronize, **not** on a base-change (retarget). Stacked PRs exist to
enable **parallel review by a team of humans**. We are a **solo dev + AI agent** —
we pay every cost of stacking and get none of its benefit.

The earlier "don't deep-stack" rule was too soft: it implied a 2-deep stack was
fine. It is not, for us. The sharper rule:

## Decision

**Never stack PRs. Land each vertical slice to `main` before starting the next.**

- Each slice is a **short-lived branch off the latest `main`** (`feat/<feature>-slice-N`).
  The dependency on the previous slice is satisfied **by history** (it's already in
  `main`), not by a fragile branch chain.
- **One PR per slice → squash-merge to `main` → auto-delete the branch.** With one
  branch per slice off `main`, squash is *safe* and gives a clean linear history —
  the squash problem only exists *for stacks*.
- If a slice is **not user-ready**, merge it **behind a feature flag** rather than
  holding it out of `main`. A flag can be a one-line env var or constant — no new
  dependency, no SaaS. This is what makes "always land to main" work even for
  half-finished work. Govern flag lifecycle (delete dead flags).
- **Branch-delete timing:** only ever delete a branch *after* its PR is merged, and
  only when nothing else is based on it. (Moot once we stop stacking.)
- If we are ever *forced* to stack (we shouldn't be): use **merge commits, not
  squash**, for intermediate PRs; don't delete base branches until the whole stack
  lands; and use a stack tool (Graphite / `git town`) so retargeting is automated.

This is standard **trunk-based development** with vertical slices: integration
becomes a non-event, diffs stay small and reviewable, each slice gets its own
working browser smoke, and revert is trivial.

## Consequences

- **Positive:** removes the squash-cascade recovery entirely; smaller reviewable
  diffs; trivial revert; CI behaves (no retarget gap); less work, not more.
- **Cost:** slices that aren't independently shippable need a feature flag. Cheap;
  worth it.
- **Process:** `build-workflow-standard` memory step 7 ("integration hygiene")
  upgraded from "don't deep-stack" to this rule. `docs/how-we-work.md` updated to
  describe the per-slice-to-`main` cadence. The `parallel-dev-playbook` memory
  (worktrees, serialize shared-file edits first) still applies for parallel work
  *across* independent features.

## Related

- `build-workflow-standard` memory (the build loop), `parallel-dev-playbook` memory.
- ADR 0012/0013 (prior multi-slice features). The Drawings retro (2026-06-24) also
  produced a **testing upgrade** (Playwright E2E in CI against a seeded Supabase
  branch DB; React Compiler + `react-hooks/unsupported-syntax` lint; pgTAP RLS) —
  tracked in `docs/how-we-work.md` and the workflow memory, to be implemented as
  its own slice.
