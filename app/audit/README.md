# Points audit harness

Independently verifies the scoring engine. It bundles the **real** engine out of
`src/App.jsx` (no retyping), runs the sample tournament at a fixed clock, then
**re-derives every player's points from scratch** using the league rules and
reconciles the two — line by line, per player.

```bash
cd app
node audit/build.mjs   # bundles the engine -> audit/engine.mjs (gitignored)
node audit/audit.mjs   # prints the per-player audit + PASS/FAIL
```

Rules verified:
- Group ranking: **+1 per team in its exact final group position** (all 4 places).
  No match-winner points, no right-team/wrong-slot partial credit.
- Knockout: **+1** per correct winner in R16/QF/SF/F. **R32 is never scored.**
  R16 is scored from the fixed candidate picker (`R16c_*` slots), reconciled to
  the real R16 result by team membership.
- Champion: **+1** if correct.
- `total = groupRank + knockout + champion` (group-match points are always 0).

The reconciliation passes at full-time, at the live anchor, and mid-groups
(partial tables) — confirming the live, recomputed-every-render scoring is correct.
