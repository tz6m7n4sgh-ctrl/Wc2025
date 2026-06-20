# World Cup 2026 — Prediction League (PWA)

Live site: **https://tz6m7n4sgh-ctrl.github.io/Wc2025/**

A mobile-first match center + prediction league for the FIFA World Cup 2026:
today's matches (live / upcoming / completed), match detail, a real scoring
engine, leaderboard, groups, bracket, and an admin area. Bilingual
(English / العربية with full RTL) and light/dark. Runs on live Supabase data
with TheSportsDB live scores + results.

## Layout

GitHub Pages serves the repo **root** as a static site.

- `index.html` — the **production app** (React + Vite, built to a single
  self-contained file). Served at the live URL.
- `legacy.html` — the previous (vanilla) production page, kept as a one-click
  rollback (reachable at `…/Wc2025/legacy.html`).
- `preview/index.html` — staging copy of the latest build, for testing changes
  before promoting them to the root.
- `app/` — the React + Vite source the build is produced from.
- `.nojekyll` — disables Jekyll processing for the static output.

## Rebuild & deploy

```bash
cd app
npm ci
npm run build                       # -> app/dist/index.html (single file)
cp dist/index.html ../preview/index.html   # test at /Wc2025/preview/
cp dist/index.html ../index.html           # promote to production (same URL)
```

The build uses `vite-plugin-singlefile` + `base: "./"`, so the output works at
the root or under `/preview/` with no hardcoded URLs.

## Data

- **Supabase** (`wc2026` blob + `wc2026_match_results`) — players, predictions,
  results, settings, champion. Loaded on boot (real clock) and polled; falls
  back to a sample demo if unreachable. Header badge shows **Live data** vs
  **Sample**.
- **TheSportsDB** — live in-progress scores (premium V2 `/livescore/soccer`)
  and a completed-results feed (V1 `eventsday`). Results are resolved to the
  canonical round-robin fixture **by team** and oriented correctly, then feed
  standings + display. Live scores stay display-only until full-time.
- **Admin → Sync results** pulls finished scores from TheSportsDB and upserts
  them into the database (with a reachability diagnostic), so every client sees
  them.

## Rollback

If needed, restore the previous page:

```bash
cp legacy.html index.html
```
