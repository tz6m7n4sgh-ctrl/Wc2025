# Audit Report — Point Calculation Engine

**Project:** World Cup 2026 Prediction League
**Scope:** Scoring/points logic in `app/src/App.jsx` (React rebuild)
**Date:** 2026-06-23
**Status:** Engine logic ✅ correct · Data integrity ⚠️ one high-severity issue found & fixed

---

## 1. Executive summary

The points engine was audited end to end: the scoring constants, the per-player
calculation, the group-table computation that feeds it, the leaderboard, the
knockout/champion logic, and the live/timeline projections.

**Conclusion:** the calculation logic is **correct and internally consistent**.
A worked example against live Group C data reproduces the app's output exactly
(including the `3/5 correct · +3` figure seen on screen).

The one material problem is **not in the math** — it is a **data-integrity
issue**: a match that has not been played yet (`C_2`, Brazil v Scotland, kicks
off 2026‑06‑24) was stored as `status:"final"` with a score from the live feed.
That phantom result corrupts the computed standings and, if left until the group
completes, would corrupt **ranking points** and the **bracket**. It has been
identified, a fix script issued, and a root-cause code hardening proposed.

---

## 2. Scoring rules (as implemented)

Source: `app/src/App.jsx:30` (`SCORING`)

| Category | Rule | Points | Code |
|---|---|---|---|
| Match winner ("edge") | Your higher-ranked team in a group wins that group match | **+1** each | `edgeCorrect` |
| Group standing — exact | A team finishes in the **exact** position you predicted | **+3** each | `exactPosition` |
| Group standing — in group | The team is in the group but a **different** position | **+1** each | `teamInGroupWrongPos` |
| Knockout winner | Pick the team that advances | **R32 +2, R16 +3, QF +5, SF +8, Final +12** | `knockout` |
| Champion | Correctly pick the tournament winner | **+10** | `champion` |

**Player total** = group-match + group-rank + knockout + champion
(`app/src/App.jsx:276`).

---

## 3. Calculation pipeline

```
Supabase blob + wc2026_match_results
        │  mapBlobToData()         App.jsx:538   ← results re-paired BY TEAMS,
        ▼                                          oriented to canonical home/away
   data.groupResults  ──► matchResult()  App.jsx:207  (winner / draw / complete)
        │                      │
        │                      ├──► computeGroupTable()  App.jsx:219  (ACTUAL standings)
        │                      └──► predictedEdge()      App.jsx:236  (who you backed)
        ▼
   calcPlayerPoints(p, data)   App.jsx:243
        ├─ group match winners  (loops 6 matches/group, decided only)
        ├─ group ranking        (only when groupComplete — all 6 played)
        ├─ knockout             (per recorded knockout result)
        └─ champion             (+10)
        ▼
   buildLeaderboard()  App.jsx:278   (sort by total desc, then name)
```

Key dependency: **every points category is downstream of `data.groupResults`.**
If a single match score is wrong or mis-oriented, it propagates into match-winner
points, standings, ranking points, and the bracket.

---

## 4. Per-category findings

### 4.1 Match-winner points — ✅ correct
`calcPlayerPoints` (`:247-253`) loops all 6 group matches, scores only **decided**
matches (`r.outcome !== "draw"`), and awards `+1` when the player's higher-ranked
team (`predictedEdge`, `:236`) is the actual winner. Draws and matches where the
player has no valid edge correctly score 0.

> **Display note (cosmetic):** the "X/Y correct" label (`GroupCompare`, `:1772`)
> counts **all** played matches in `Y`, including draws and no-edge matches, so the
> ratio can look lower than the points imply. Points are unaffected.

### 4.2 Group-ranking points — ✅ correct, gated on completeness
`calcPlayerPoints` (`:255-265`) awards ranking points **only when
`groupComplete`** (all 6 matches played — `:218`). `+3` for an exact-position hit,
else `+1` if the team is anywhere in the group, else `0`.

> **Design characteristic (not a bug):** because all four named teams are always
> in the group, any prediction listing the correct four teams in *any* order earns
> a floor of **+4** (4 × in-group). This matches the stated rule but is worth
> knowing for prize-spread expectations.

### 4.3 Knockout points — ✅ correct
`:267-274` scores each recorded knockout result by round value
(`SCORING.knockout[round]`). Internally consistent: predictions and results are
keyed by the same match id (`mid`). Note the R32 bracket pairing is **illustrative
/ sequential** (`buildBracket`, `:301`, `:308`) and the app discloses this to
users — knockout scoring stays consistent as long as the same `mid` keys are used
for both picks and results.

### 4.4 Champion points — ✅ correct (intentional stacking)
`:275` awards `+10` if the pick equals `data.champion`. This is **in addition to**
the Final knockout points (`+12`), so a correctly predicted champion who wins the
final yields **+22** on one team. This appears intentional (separate bonus) but is
the single largest points concentration — flagged for product awareness.

### 4.5 Leaderboard & timeline — ✅ correct, minor notes
- `buildLeaderboard` (`:278`) sorts by total then **name** — ties are broken
  alphabetically, with **no sporting tiebreak**. Acceptable, but worth a deliberate
  decision if prizes hinge on ties.
- `pointsTimeline` (`:344`) buckets group results by **RR index → synthetic
  matchday** (`:333`). This is display-only (Trends) and does not affect official
  totals.

---

## 5. Verification — worked example (live Group C)

Using the real `wc2026_match_results` rows and Kamal's prediction
`[Brazil, Morocco, Scotland, Haiti]`:

| Match | Score | Kamal's edge | Result | Pts |
|---|---|---|---|---|
| C_0 Brazil–Morocco | 1–1 | Brazil (1>2) | draw | 0 |
| C_1 Scotland–Haiti | 1–0 | Scotland (3>4) | Scotland won | **+1** |
| C_4 Brazil–Haiti | 3–0 | Brazil (1>4) | Brazil won | **+1** |
| C_5 Morocco–Scotland | 1–0 | Morocco (2>3) | Morocco won | **+1** |
| **C_2 Brazil–Scotland** ⚠️ | **0–1 (phantom)** | Brazil (1>3) | Scotland "won" | 0 |

- **Engine output with phantom C_2:** group-match = **+3**, shown as **"3/5 correct"**
  → **exactly matches the on-screen value**, confirming the math is right.
- **After removing phantom C_2:** group-match = **+3**, shown as **"3/4 correct"**;
  and crucially `computeGroupTable` returns **Brazil, Morocco, Scotland, Haiti** —
  matching the official table.

Ranking points are correctly **0** in both cases (group not complete), which is why
totals "looked fine" while the **ACTUAL column** was visibly wrong. The engine is
faithful to its inputs; the input was bad.

---

## 6. Findings & severity

| # | Finding | Severity | Status |
|---|---|---|---|
| F1 | **Phantom future match stored as `final`** (`C_2`) corrupts standings; would corrupt ranking points + bracket once the group "completes" | **High** | Fix script issued; code hardening proposed |
| F2 | `computeGroupTable` tiebreakers are Pts → GD → GF → **alphabetical** (`:233`); no head-to-head / fair-play. Tied teams may rank differently from the official table, mis-awarding exact-position points | **Medium** | Open — confirm desired tiebreak rules |
| F3 | Champion bonus **stacks** with Final knockout points (+22 on one team) | **Low (design)** | Confirm intended |
| F4 | Leaderboard ties broken **alphabetically**, no sporting tiebreak | **Low (design)** | Confirm intended |
| F5 | "X/Y correct" denominator includes draws/no-edge matches — display only | **Cosmetic** | Optional polish |

---

## 7. Recommendations

1. **F1 (do now):** run the corrective SQL to reset `C_2`, then run the read-only
   detection query to clear any other future-dated `final` results across all
   groups.
2. **F1 (permanent):** harden the sync so it **never writes or retains a `final`
   result for a fixture whose kickoff is in the future**, and ignores feed
   "finished" flags for not-yet-started matches. This is the root cause and the
   highest-value code change. *(Can be implemented on the working branch + draft PR.)*
3. **F2:** decide and document the official tiebreaker policy; if head-to-head is
   required, extend `computeGroupTable`’s comparator. This matters for ranking
   points whenever two teams tie on Pts/GD/GF.
4. **F3/F4:** confirm the champion-stacking and alphabetical-tie behaviours are
   intended; if so, document them in the rules screen for transparency.
5. Add a lightweight **engine self-check** (already scaffolded in the Admin
   "reconcile" health item) that flags any group whose completed-match count is
   inconsistent with the fixture calendar — this would have surfaced F1 automatically.

---

## 8. Appendix — code references

| Symbol | Location |
|---|---|
| `SCORING` constants | `app/src/App.jsx:30` |
| `calcPlayerPoints` | `app/src/App.jsx:243` |
| `predictedEdge` | `app/src/App.jsx:236` |
| `computeGroupTable` | `app/src/App.jsx:219` |
| `matchResult` / `groupComplete` | `app/src/App.jsx:207` / `:218` |
| `buildLeaderboard` | `app/src/App.jsx:278` |
| `buildBracket` | `app/src/App.jsx:294` |
| `mapBlobToData` (ingestion/orientation) | `app/src/App.jsx:538` |
| `resolveRRByTeams` (pairing/orientation) | `app/src/App.jsx:509` |
| `GroupCompare` (per-group display) | `app/src/App.jsx:1731` |

*Engine logic verified correct against live data. Primary action: resolve the
data-integrity issue (F1) and harden the sync against future-dated finals.*
