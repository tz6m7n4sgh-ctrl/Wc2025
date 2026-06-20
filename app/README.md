# World Cup 2026 — Prediction League

A mobile-first **match center + prediction league** for the FIFA World Cup 2026, built with **React + Vite**. People open it to follow **today's matches (live, upcoming, completed)**, drill into a **match detail page** (events, lineups, stats), and see how every player's **predictions** score on a shared **leaderboard**.

Bilingual (English / العربية with full RTL) and light/dark themed.

> **Note:** this build runs on **deterministic sample data** generated in the browser — squads, events, lineups and stats are synthetic (clearly labelled in the UI). The real scoring engine is live and computes everything from results. Wiring real data (TheSportsDB for fixtures/live scores/match details, Supabase for players & predictions) is the next step — see "Connecting real data" below.

## Features

- **Home** — focused on today: the next/live match, today's coming-up fixtures, today's completed results, and latest results.
- **Today (match center)** — a date strip (Yesterday / Today / Tomorrow / every tournament day) with matches grouped by stage, live status, and a per-match "who backed whom" bar.
- **Match detail** — tabs for Events (timeline), Lineups (formation pitch + bench), Stats (possession, shots, etc.), and Predictions (consensus + who earned points).
- **Leaderboard, Groups, Bracket, Profiles, Predictions grid, Consensus, Trends, Goals, Help.**
- **Real scoring engine** — group-match edge points, exact/in-group ranking points, knockout-round points, champion points.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs static site to dist/
npm run preview  # preview the production build
```

Requires Node 18+ (20 recommended).

## Deploy to GitHub Pages

This repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and publishes to Pages on every push to `main`.

1. Push the project to a GitHub repository.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site publishes at
   `https://<your-username>.github.io/<repo-name>/`.

`vite.config.js` uses `base: "./"`, so the build works under any repo path without hardcoding the repo name. (No router is used — navigation is in-app state — so relative asset paths are all that's needed.)

### Alternative: one-off manual deploy

```bash
npm run build
npx gh-pages -d dist     # publishes dist/ to the gh-pages branch
```

## Project structure

```
index.html               # Vite entry
vite.config.js           # base: "./" for Pages
src/
  main.jsx               # React bootstrap
  App.jsx                # the whole app: data engine, views, styles
.github/workflows/
  deploy.yml             # build + deploy to GitHub Pages
```

`App.jsx` is organized into clear sections: tournament constants, the scoring engine (pure functions), the sample-data + match generator, UI primitives, animated diagrams, views, and the shell. Styles live in a single injected `<style>` block for portability; they can be extracted to `src/index.css` if preferred.

## Connecting real data (next step)

- **Matches / live / details** → replace `buildSampleData()` with [TheSportsDB](https://www.thesportsdb.com/) calls (eventsday for the schedule, livescore for in-progress games, and the timeline/lineups/stats endpoints for the match page). Keep the rule that live scores are **display-only** until full-time, then feed final scores into the engine.
- **Players & predictions** → store the shared dataset in **Supabase** (one JSON blob or a normalized schema) and load it on boot; gate result entry behind real auth (the demo's admin password is UI-only and must not be the security boundary).

The scoring engine (`calcPlayerPoints`, `computeGroupTable`, `buildLeaderboard`, `buildBracket`, …) is already pure and data-source-agnostic, so swapping the data layer doesn't touch the scoring logic.
