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
accumulate unrelated features (that's how we ended up on the misnamed
`feat/crm-contacts` holding five of them).

**Current exception:** `feat/crm-contacts` is already a grab-bag of interdependent,
untested features (Catalog → Labour → Estimator are stacked). We keep it as the
*integration/testing branch*, you test, we merge the whole batch into `main` once
you're happy, then delete it — and start doing one-thing branches from there.

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
- **No autonomous spinning.** I won't run open-ended background loops that burn
  credits while a task isn't actually progressing. I work in focused bursts and
  stop at clean checkpoints.
- **Resuming is nearly free.** Your place is saved to a file the next session
  auto-loads (below) — no paying me to re-learn where we were.
- Want to know what's burning your limits? Type `/usage`.

---

## Stop & resume (for when you have to bolt)

You often have to stop suddenly. Two ways to bank your place:

- **Type `/save`** (or just say *"save my place"*). I write a tight resume note —
  what we're doing, the exact next step, any landmines — to `.remember/remember.md`.
  Takes one second, costs almost nothing, changes no code.
- **Add a reason if you have one:** `/save heading out, mid-way through testing reface`.

Next time you open a session, that note is **auto-loaded into my context** — so you
can just open up and say **"go"** (or *"where were we?"*) and I pick up exactly
where we left off. No re-explaining.

`.remember/` is local-only (gitignored), so these notes never clutter your repo.

---

## The handful of things you actually type

| You type | I do |
|---|---|
| `go` / `next` / `continue` | the next step I teed up |
| `/save` *(+ optional note)* | bank our place for next time |
| *"where were we?"* | read the resume note and re-orient |
| `push` | back the branch up to GitHub |
| `merge` | fold the tested branch into `main` (I'll confirm first) |
| *"explain like I'm not a dev"* | plain-English version of anything |
| `/usage` | what's using your credits |

That's the whole system. Build in bursts, save when you bolt, resume free,
merge to `main` only what you've tested.
