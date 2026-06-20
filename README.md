# World Cup 2026 — Prediction League (PWA)

Live site: **https://tz6m7n4sgh-ctrl.github.io/Wc2025/**

A mobile-first match center + prediction league for the FIFA World Cup 2026:
today's matches (live / upcoming / completed), match detail (events, lineups,
stats, predictions), a real scoring engine, leaderboard, groups, bracket, and
an admin area. Bilingual (English / العربية with full RTL) and light/dark.

## How this repo is deployed

GitHub Pages serves the repo **root** as a static site, so the deployable app
is a single self-contained file: **`index.html`** (all JS + CSS inlined),
alongside the PWA assets (`manifest.webmanifest`, icons). The URL above never
changes regardless of how the app is built.

- `index.html` — the built, deployed app (generated from `app/`).
- `legacy.html` / `backup-index-*.html` — the previous production page, kept as
  a one-click rollback (reachable at `…/Wc2025/legacy.html`).
- `app/` — the React + Vite source the deployed file is built from.
- `.nojekyll` — disables Jekyll processing for the static output.

## Rebuilding and redeploying

```bash
cd app
npm ci
npm run build          # -> app/dist/index.html (single self-contained file)
cp dist/index.html ../index.html   # publish to the repo root
```

The build uses `vite-plugin-singlefile` + `base: "./"`, so the output works
under the `/Wc2025/` Pages path with no hardcoded URLs.

## Live updates & data

The match clock is **real**: the app advances the tournament in real time, so
live matches tick, fixtures kick off, and results reveal on their own — then
the scoring engine, leaderboard, standings and bracket recompute reactively.
The current build runs on a deterministic in-browser sample tournament (clearly
labelled in the UI); the scoring engine is data-source-agnostic.

**Connecting real data (next step):** swap the sample generator for live
fixtures/scores (e.g. TheSportsDB) and persist players & predictions (e.g.
Supabase), feeding both through the same `recomputeLive()` path. Live scores
stay display-only until full-time, then flow into the engine. Real data wiring
requires API credentials and is intentionally not bundled into this static
build.
