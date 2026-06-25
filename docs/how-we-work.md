# How We Work — plain-English cheat sheet

For Andrew. This is the human-facing guide to how we build the dashboard
together: the git workflow, who decides what, and how to stop & resume without
losing your place or burning credits. (The deep Claude-Code tooling lives in
`claude-code-playbook.md`; this file is the everyday one.)

---

## Git in 90 seconds

Three moves, smallest to biggest consequence:

| Move | What it does | Where it lives | Who triggers it |
|---|---|---|---|
| **commit** | saves a labelled checkpoint of the work | this computer | I do it when you ask |
| **push** | uploads those checkpoints to GitHub (backup) | the cloud | **your OK** (one-time login done? then I can) |
| **merge** | folds a branch's work into `main` — makes it official | `main` | **your call** (the "ship it" moment) |

**Branch** = a disposable side-workbench for one piece of work. It's just a
labelled tab, *not* the work itself. The work = the commits + the code, which
live permanently in the repo.

**Deleting a branch loses nothing** — as long as it was merged or pushed first
(so the work has a home). Merge → then delete is always safe.

**You can extend any feature anytime.** Features live in `main` forever. To add
to one you already built, you don't reopen an old branch — you start a fresh
little one off `main`, edit those files, and merge it back. Jump in as often as
you like; nothing is ever frozen.

---

## The branch lifecycle we follow

```
main  =  the STABLE, tested, "known-good" version.
         Nothing lands here until YOU'VE tested it in the running app.

Each new piece of work:
  1. branch off main, honest name      feat/<the-one-thing>
  2. build it — I commit as we go
  3. push                              backup + safety net
  4. you test it in the app
  5. merge into main                   it's official
  6. delete the branch                 done — next job starts fresh
```

One rule: **a branch holds one thing, then it's retired.** Don't let it
accumulate unrelated features.

### Never stack branches (the hard-won rule — ADR 0017)

When a feature is several **slices** that build on each other (Slice 3 → 4 → 5),
the tempting move is to base each branch on the one below it (a "stack"). **We
don't do that** — it bit us twice (the Drawings 3–5 stack on 2026-06-24 cost ~30
min of cleanup: merging the bottom slice auto-broke the ones above it).

Instead: **finish a slice, merge it to `main`, *then* start the next slice off the
fresh `main`.** Slice 4 branches from a `main` that already has Slice 3 — the
dependency is just *there*. Small diffs, each slice testable on its own, nothing
to break. Stacks are a tool for big teams of reviewers; for us they're all cost.

**If a slice isn't ready for you to use yet,** we hide it behind a simple on/off
switch (a "feature flag") and merge it anyway — so `main` always moves forward and
we never sit on a long-lived branch.

---

## How we work together (the rhythm)

**I default to action and tee up the next step.** You shouldn't have to spell out
every micro-task. I do the obvious next thing, then end with a clear
**"Next: X — say `go`"** so you can keep moving with one word instead of
re-explaining.

**I stop and ask only when it genuinely needs you:**
- a real decision (which direction, a trade-off only you can call)
- anything **outward-facing or hard to undo** — push, merge, deploy, deleting things, emailing
- a true blocker (like the GitHub login)

**I verify before I claim "done":** type-check + lint + build, and for anything
real, I run it in the app. If something failed, I say so plainly.

### On credits
- **No aimless spinning.** I won't run open-ended loops that burn credits while a
  task isn't actually progressing. The one deliberate exception is **`/cook`** (see
  below): it only spends while making real progress against a locked plan, never
  repeats a failing action, and stops to ask after a few honest tries.
- **Resuming is nearly free.** Your place is saved to a file the next session
  auto-loads (below) — no paying me to re-learn where we were.
- Want to know what's burning your limits? Type `/usage`.

---

## How we plan, decide, and test (the build loop)

**One big plan first, then heads-down building.** For a real feature we (1)
brainstorm it, (2) "grill" the design against what's already built, (3) write a
plan that breaks it into **slices** (small, shippable steps), each with a clear
"done when…" checklist. The first slice is always a thin end-to-end "tracer
bullet" that actually works, so we find integration problems early.

**You answer all the questions for a slice up front — then I build till done.**
Before I write code for a slice, I put **every decision that slice needs into one
question prompt** (with my recommendation first). You answer them all at once, I
lock them into the plan, and then I build the whole slice without pestering you.
This is the rhythm you liked on the Drawings shapes/sketchpad slices.

**Set the "ship it" rule once per session.** Merging to `main` deploys to the
live site, so at the start just tell me which you want: *"merge is mine — ping me
when it's green"* or *"merge automatically once the tests pass."* That saves us
the back-and-forth we hit asking permission every time.

**How we test.** The computer checks types, lint, and the math/logic
automatically. **And now (done 2026-06-24):** on every pull request, a robot
**opens the real app in a browser, logs in, and checks that real data shows up**
— run against a fresh *copy* of the database, never the live one. So the
interactive bugs (a button that silently doesn't fire, an editor that flickers
closed) get caught automatically, the moment a change is pushed — not by hand at
the end. (Still to add later: a couple of compiler/lint guards and database
security tests.)

---

## Letting it cook (`/cook`) — building while you're away

The big upgrade: instead of you driving every step, you can **plan a feature once
with me, then let me build it to completion on its own** while you watch from your
phone. You type `/cook <the feature>`.

- **First we plan it together** (at the desk): I research, we "grill" the design,
  I write the slice plan, and I post each slice as a checklist item on a GitHub
  **milestone** — that's the to-do list the robot works through.
- **Then it cooks** (you can leave): for each slice it writes the code *and* its
  test, pushes it, opens a PR, and waits for the robot tests to go green.
- **Training wheels (on by default):** it does all that on its own, but **stops
  and pings you before every merge** — you tap "merge" from your phone. Once you've
  watched it work and trust it, we flip on auto-merge for the safe slices.
- **Always asks first** before anything touching **money, the database structure,
  or logins/security** — those never go live without your say-so.
- **The hard wall:** `/cook` is for **code only**. It will *never* touch your
  email, calendar, or business docs on its own. Those stay fully hands-on.
- **Two at once?** Yes — run a second one from a second window (`gwcode 2`).
  Before it starts, `/cook` checks for overlap and will stop you if two features
  would step on each other (same folder, shared files, or database changes).

If your laptop hiccups, a tiny background keeper restarts the phone-reachable
session automatically, and `/cook --resume` picks up the remaining slices.

---

## Stop & resume (for when you have to bolt)

You often have to stop suddenly. Two ways to bank your place:

- **Type `/save`** (or just say *"save my place"*). I write a tight resume note —
  what we're doing, the exact next step, any landmines — to `.remember/remember.md`.
  Takes one second, costs almost nothing, changes no code.
- **Add a reason if you have one:** `/save heading out, mid-way through testing reface`.

Next time you open a session, just type **`/resume`** — I re-read that note, re-check
the live state of the repo, give you a 3-line "here's where we are," and get moving.
(The note is also auto-loaded into my context at session start, so "go" or *"where
were we?"* work too — but `/resume` is the reliable one-word trigger.) No re-explaining.

`.remember/` is local-only (gitignored), so these notes never clutter your repo.

---

## The handful of things you actually type

| You type | I do |
|---|---|
| **`gwcode`** *(in a terminal)* | **open or re-attach your phone-mirrored session — this is how you get back in after a VS Code crash.** Same word whether it survived or not. Add `/resume` after if it was a full reboot. |
| `go` / `next` / `continue` | the next step I teed up |
| `/save` *(+ optional note)* | bank our place for next time |
| `/resume` *(or "where were we?")* | pick up exactly where we left off last session |
| `/cook <feature>` | plan a feature together, then I build + test it slice-by-slice (you tap merge) |
| `push` | back the branch up to GitHub |
| `merge` | fold the tested branch into `main` (I'll confirm first) |
| *"explain like I'm not a dev"* | plain-English version of anything |
| `/usage` | what's using your credits |

That's the whole system. Build in bursts, save when you bolt, resume free,
merge to `main` only what you've tested.
