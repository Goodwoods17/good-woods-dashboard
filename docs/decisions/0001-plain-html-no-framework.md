# 0001. Plain HTML/CSS/JS, no framework, no build step

Date: 2026-05-07

## Status
Accepted

## Context

This is an internal shop tool used by 1–3 non-technical people on
desktop and mobile devices. It needs to run reliably, be easy to
maintain by a cabinetmaker (not a software engineer), and survive
long stretches without active development.

## Decision

Build with plain HTML, CSS, and vanilla JavaScript. No framework
(React/Vue/Svelte). No build step (no Webpack/Vite/npm scripts).
The app must run by double-clicking `index.html`.

## Alternatives considered

- **React + Vite** — Rejected. Adds a build step, requires Node.js
  installed on every machine that runs it, and introduces dependency
  churn that distracts from shop work.
- **Static site generator (11ty, Astro)** — Rejected. Same build-step
  problem; benefits don't justify complexity at this scale.
- **Google Apps Script web app** — Considered for tight Sheets
  integration. Parked — may revisit when/if Sheets sync becomes a
  must-have. Limits offline use.

## Consequences

**Positive:**
- Zero install. Anyone can run the app by opening a file.
- Works offline by default.
- Code is fully visible and editable in any text editor.
- No dependency tree to maintain or audit.
- Easy to back up — just copy the folder.

**Negative:**
- No automatic component reuse — must use plain JS modules and
  custom elements or careful templating.
- Manually manage browser compatibility (acceptable; modern browsers
  only).
- Some patterns (state management, routing) require slightly more
  hand-rolled code.
- Cannot easily use NPM ecosystem libraries — must use CDN-hosted
  scripts or write our own.

## Revisit when

- The app exceeds ~5,000 lines of JavaScript and starts feeling
  unmanageable
- We add multi-user state syncing that requires real reactivity
- A framework's specific feature becomes the cleanest solution to
  a real problem (not a speculative one)
