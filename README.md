# World Cup 2026 — Prediction League (PWA)

Live site: **https://tz6m7n4sgh-ctrl.github.io/Wc2025/**
Preview (rebuild, live data): **https://tz6m7n4sgh-ctrl.github.io/Wc2025/preview/**

A mobile-first match center + prediction league for the FIFA World Cup 2026:
today's matches (live / upcoming / completed), match detail, a real scoring
engine, leaderboard, groups, bracket, and an admin area. Bilingual
(English / العربية with full RTL) and light/dark.

## Layout

GitHub Pages serves the repo **root** as a static site.

- `index.html` — **current production app** (unchanged). Served at the live URL.
- `preview/index.html` — the **React + Vite rebuild** with the real Supabase data
  layer, built to a single self-contained file. Served at `…/Wc2025/preview/`
  for testing **without affecting live users**. Promote it by copying it over
  the root `index.html` once verified.
- `preview/manifest.webmanifest`, `preview/icon-*.png` — preview PWA assets.
- `app/` — the React + Vite source the preview build is produced from.
- `.nojekyll` — disables Jekyll processing for the static output.

## Rebuilding the preview

```bash
cd app
npm ci
npm run build                       # -> app/dist/index.html (single file)
cp dist/index.html ../preview/index.html
```

The build uses `vite-plugin-singlefile` + `base: "./"`, so the output works
under any Pages path (root or `/preview/`) with no hardcoded URLs.

## Data

The rebuild reads/writes the same Supabase backend as production:

- `wc2026` (row `id='main'`, JSON `data` blob — players, predictions, settings,
  champion, schedule) and `wc2026_match_results` (normalized scores).
- On boot it loads real data (live mode, real clock) and polls every 60s;
  it falls back to a deterministic in-browser **sample** demo if Supabase is
  unreachable. A header badge shows **Live data** vs **Sample**.

Live in-progress scores and match events/lineups/stats (TheSportsDB) are the
remaining follow-up; the league data, predictions, results, and leaderboard run
on real data through the engine's `recomputeLive()` path.

## Promote preview to production

Once the preview checks out in a real browser (including an admin write-back
test), publish it:

```bash
cp preview/index.html index.html    # same URL, no other changes
```
