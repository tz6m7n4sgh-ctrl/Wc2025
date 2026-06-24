# Deep Investigation — Groups & Points Logic

**Project:** World Cup 2026 Prediction League
**Scope requested:** (1) Groups logic, (2) user point calculation — looking for *functional bugs* and *hardcoded rules*.
**Method:** full code trace of `app/src/App.jsx` + `thesportsdb.js` + `supabase.js`, cross-checked against the **live TheSportsDB feed** (`eventsseason`, league 4429, season 2026) and a 19-assertion engine harness.
**Date:** 2026-06-24

---

## 0. Executive verdict

**The group + points *logic* is correct and data-driven — it is not where the wrong tables came from.** Every problem you have seen on screen traces to **data in the database** (phantom "final" rows for matches that are actually *Not Started*), plus a **sample-data fallback** that activates when the app can't reach Supabase (this is the "different player names" you saw).

There *are* hardcoded elements. After auditing each one, **none of them corrupt the live group tables or the active points** — but several are real simplifications you should know about (knockout bracket, tiebreakers, synthetic match details, and the time-based match status). Full inventory in §3.

| Area | Status |
|---|---|
| Hardcoded group draw (A–L teams) | ✅ **Matches the official fixtures exactly** (verified: 0 cross-group games, every team plays exactly its 3 group-mates) |
| Fixture pairing / orientation | ✅ Correct (results re-paired by team name, not by feed order) |
| Standings computation | ✅ Correct math; ⚠️ tiebreak is simplified (no head-to-head) |
| Points engine (match-winner, ranking, KO, champion) | ✅ Correct (19/19 harness); **no hardcoded results in the live path** |
| What actually broke on screen | ⚠️ **Data** — phantom `final` rows (e.g. `C_2`, `A_4`) + sample-data fallback |

---

## REPORT A — Groups logic

### A1. Where the data comes from (hardcoded vs live)
- **Group draw** `GROUPS` — *hardcoded constant* (`App.jsx:14`). 48 teams, 12 groups.
  - **Verified against the live feed:** all 72 fixtures are intra-group, and every team faces exactly its 3 group-mates. The hardcoded draw is **correct**.
- **Fixtures** — derived from `GROUPS` × a hardcoded round-robin table `RR` (`App.jsx:29`). `RR` is a valid round-robin (all 6 unique pairings once; each of 3 matchdays plays every team once — harness-verified).
- **Kickoff times / dates** — come from **`blob.scheduleMatches`** in Supabase (`App.jsx:567,576`), *not* the API. ⚠️ See A5.
- **Scores** — come from the normalized `wc2026_match_results` table + `blob.groupResults` fallback + a live API fill (`mapBlobToData`, `App.jsx:538`). **No scores are hardcoded in the live path** (the only hardcoded scores live inside `buildSampleData`, the demo fallback — §3).

### A2. Fixture pairing & orientation — correct
`resolveRRByTeams` (`App.jsx:509`) matches each real result to its canonical fixture **by team names**, and **swaps home/away** when the feed's orientation is reversed. This is why a feed listing "Scotland v Brazil" still maps to the same slot as "Brazil v Scotland" with the score oriented correctly. ✅

### A3. Standings (`computeGroupTable`, `App.jsx:219`) — correct math
Builds P/W/D/L/GF/GA/GD/Pts from completed results and sorts by **Pts → GD → GF → alphabetical**. Re-verified: feeding the real Group C results yields **Brazil 4(+3) · Morocco 4(+1) · Scotland 3(0) · Haiti 0(−4)** — identical to the official table.

⚠️ **Tiebreak gap (real, low-frequency):** the comparator stops at GF and then falls back to **alphabetical**. FIFA uses **head-to-head** before that. Two teams equal on Pts/GD/GF would be ordered alphabetically here, which can differ from the official table — and would mis-assign exact-position points if it happens.

### A4. Qualification / bracket
- Top-2 highlighting in the Groups UI is correct.
- The knockout bracket (`buildBracket`, `App.jsx:294`) only builds once **all** groups are complete, and selects the **8 best third-placed teams** correctly. **But** it then pairs the 32 qualifiers **sequentially** (`pool[2k] vs pool[2k+1]`, `App.jsx:308`) — this is an **illustrative bracket, not the real WC2026 bracket structure**. The app discloses this. It does not affect group tables or current points (knockout scoring is dormant — see Report B).

### A5. ⚠️ Time-based match status (the most likely "looks wrong" in live mode)
`statusOf` (`App.jsx:655`) and `recomputeLive` (`App.jsx:442`) decide a match is **scheduled → live → finished purely from `kickoff` vs `now`**, *independently of the feed*:
- Before kickoff → `scheduled`.
- For ~150 min after kickoff → `live`.
- After that with no recorded score → **`finished` with no score (a dash)**.

Because kickoff comes from `blob.scheduleMatches`, **if those stored kickoff times are wrong or fictional, matches will show as live/finished at the wrong moments** — today (matchday 3) especially. This is **cosmetic** (it sets `status`, not `finalH`, so it does **not** change standings or points), but it can make the app "look" like games are underway/over when they aren't.
➡️ **Recommendation:** verify `blob.scheduleMatches` kickoff times against the API dates (the `eventsseason` feed has the real ones: group stage 13–24 June), or drive kickoff from the feed.

---

## REPORT B — User point calculation

### B1. Scoring rules (hardcoded *values*, by design — `App.jsx:30`)
| Category | Points |
|---|---|
| Match winner (your higher-ranked team wins its group game) | +1 |
| Group standing — exact position | +3 |
| Group standing — right group, wrong spot | +1 |
| Knockout winner | R32 +2 · R16 +3 · QF +5 · SF +8 · Final +12 |
| Champion | +10 |

These constants encode the league rules; that's legitimate hardcoding, not a bug.

### B2. The engine is data-driven and correct
`calcPlayerPoints` (`App.jsx:243`) computes everything from **results + predictions** — there are **no hardcoded outcomes** in this path. Re-verified with a 19-assertion harness (round-robin structure, real Group C standings, phantom reproduction, match-winner points, exact/in-group ranking, alias handling, knockout + champion): **19/19 pass.**

### B3. What is actually *active* right now
From the live data, **all players have `champion: null` and empty knockout picks**. Therefore:
- **Knockout points = 0** for everyone (no picks; bracket also not built yet).
- **Champion points = 0** for everyone (no pick set).
- The **only live-scoring categories are group match-winners and group ranking.** So the totals you see (`+4 / +2 / +3`) are purely group-stage match-winner points.

### B4. Why the on-screen points looked off
Not the engine — the **phantom data**. A phantom `final` (e.g. `C_2` Brazil 0–1 Scotland, a match that is **Not Started**) does two things:
1. Inflates the **match-winner denominator** ("3/**5** correct" instead of "3/4").
2. Corrupts the **actual standings** the points compare against (Scotland wrongly 1st).
The harness reproduces this exactly: with the phantom, Group C computes Scotland-1st; without it, Brazil-1st. **The fix is to clear the phantom rows, not to change the engine.**

### B5. Latent edge cases (not currently biting)
- **Knockout bracket pairing is illustrative** (A4) — if you ever collect knockout matchup predictions, they won't line up with the real bracket.
- **`normalizePrediction` gap bug** (`App.jsx:196`): if a prediction is ever stored as an object with a *missing* rank, `filter(Boolean)` compacts the list and shifts later teams up a position. Complete predictions (the normal case) are unaffected.
- **Tiebreak** (A3) feeds exact-position points; same caveat.
- **Champion bonus stacks** with the Final knockout points (+22 on one team) — intentional, but worth confirming as policy.

---

## 3. Hardcoded-rules inventory (your explicit concern)

| # | Hardcoded thing | Location | Affects live results/points? | Verdict |
|---|---|---|---|---|
| 1 | Group draw `GROUPS` | `App.jsx:14` | — | ✅ Correct (matches official) |
| 2 | Round-robin `RR` + matchday map | `App.jsx:29,333` | Internal indexing only (re-paired by team) | ✅ Safe |
| 3 | Scoring values `SCORING` | `App.jsx:30` | Defines the rules | ✅ By design |
| 4 | Tiebreak Pts→GD→GF→**alphabetical** | `App.jsx:233` | Standings order on exact ties | ⚠️ No head-to-head |
| 5 | **Sample/demo data** (fake players, **seeded scores**, fake champion) | `buildSampleData` `App.jsx:696`; scores `728,754`; `champPool 698` | **Only when Supabase load fails** | ⚠️ This is the "different names" you saw |
| 6 | Synthetic match **details** (lineups/events/stats) from a hash seed | `genEvents/genStats/applyAdminScore` `App.jsx:599,665,679` | Display only (never points) | ⚠️ Not real data |
| 7 | Knockout bracket **sequential pairing** | `App.jsx:308` | Bracket display; KO scoring dormant | ⚠️ Illustrative, not real bracket |
| 8 | Demo clock `TOURNAMENT_ANCHOR` + `groupKO` schedule | `App.jsx:624,688` | **Sample mode only** (live uses real `Date.now()`) | ✅ Safe in live |
| 9 | Settings defaults (currency `AED`, fee `200`) | `App.jsx:773` | Cosmetic | ✅ Default only |

**Bottom line on hardcoding:** the only hardcoded things that touch *outcomes* are the scoring values (intentional) and the simplified tiebreak (#4). Everything else hardcoded is either correct (the draw), internal (RR), display-only (#6), or active **only in demo mode** (#5, #8). **No hardcoded match result is used when the app is in live mode.**

---

## 4. "Does the app function as expected?" — root causes

1. **Phantom standings / wrong match-winner counts** → **DATA**: future matches stored as `final` (`C_2`, `A_4`, …). Engine is faithful to bad input. *Fix: clear them (targeted SQL or the new Sync). The deployed sync now prevents recurrence.*
2. **"Different player names"** → **sample-data fallback** (#5): the app couldn't reach Supabase that moment and rendered demo data. Your real blob is intact (you confirmed the names). *Fix: it self-recovers on a successful load/refresh.*
3. **Matches appearing live/finished at odd times** → **time-based status** (A5) driven by `blob.scheduleMatches`. Cosmetic, but verify those kickoff times.

## 5. Recommendations (in priority order)
1. **Clear the phantom rows** (you have the targeted SQL) — restores every live table immediately.
2. **Verify `blob.scheduleMatches` kickoff times** against the feed dates, or switch kickoff to the feed — removes the time-based status weirdness.
3. **Add head-to-head** to the tiebreak (`computeGroupTable`) if exact-position points must match the official table on ties.
4. **Make `normalizePrediction` position-preserving** (map ranks 1–4 by index, don't `filter` gaps).
5. If knockout/champion scoring will be used: collect those picks and replace the **illustrative bracket** with the real WC2026 structure.
6. Consider labelling synthetic match details (#6) in the UI so they're not mistaken for real lineups/stats.

*Engine logic: verified correct (19/19). The live group tables and active points are data-driven and depend only on the stored results being accurate — which is the one thing to fix (the phantoms).*
