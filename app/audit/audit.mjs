// Independent audit of the points engine.
//  1. Builds the sample tournament with the REAL engine, at a fixed clock so
//     every match is finished and totals are stable.
//  2. Re-derives every player's points FROM SCRATCH using the league rules,
//     with no reuse of the engine's scoring path.
//  3. Reconciles the two, line by line, and prints a per-player audit.
import * as E from "./engine.mjs";

const { buildSampleData, recomputeLive, buildLeaderboard, GROUPS, GROUP_KEYS, RR, SCORING, canonTeam, teamKey, sameTeam, setLiveMode } = E;

setLiveMode(false);
// Freeze "now" well past the Final so the whole tournament is decided and
// nothing depends on wall-clock timing — a fully determined, repeatable audit.
const NOW = Date.UTC(2026, 7, 1, 0, 0); // 1 Aug 2026
const data = recomputeLive(buildSampleData(), NOW);

// ---- independent rule implementation (does NOT call the engine) ------------
const norm = (t) => teamKey(t); // canonical key for team-name comparison

// Re-derive a group's final table straight from the raw results.
function myTable(g) {
  const T = {};
  GROUPS[g].forEach((t) => (T[norm(t)] = { team: canonTeam(t), Pts: 0, GF: 0, GA: 0, GD: 0 }));
  const played = [];
  for (let i = 0; i < 6; i++) {
    const [hi, ai] = RR[i];
    const home = GROUPS[g][hi], away = GROUPS[g][ai];
    const r = data.groupResults[g + "_" + i];
    if (!r || r.home == null || r.away == null) continue;
    played.push({ home, away, hs: +r.home, as: +r.away });
    const H = T[norm(home)], A = T[norm(away)];
    H.GF += +r.home; H.GA += +r.away; A.GF += +r.away; A.GA += +r.home;
    if (+r.home > +r.away) H.Pts += 3; else if (+r.away > +r.home) A.Pts += 3; else { H.Pts++; A.Pts++; }
  }
  Object.values(T).forEach((x) => (x.GD = x.GF - x.GA));
  const rows = Object.values(T).sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF || 0);
  // resolve ties by head-to-head among the still-level block, then alphabetical
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].Pts === rows[i].Pts && rows[j].GD === rows[i].GD && rows[j].GF === rows[i].GF) j++;
    if (j - i > 1) {
      const block = new Set(rows.slice(i, j).map((r) => norm(r.team)));
      const h = {}; block.forEach((k) => (h[k] = { Pts: 0, GF: 0, GA: 0 }));
      played.forEach((p) => {
        const hk = norm(p.home), ak = norm(p.away);
        if (!block.has(hk) || !block.has(ak)) return;
        h[hk].GF += p.hs; h[hk].GA += p.as; h[ak].GF += p.as; h[ak].GA += p.hs;
        if (p.hs > p.as) h[hk].Pts += 3; else if (p.as > p.hs) h[ak].Pts += 3; else { h[hk].Pts++; h[ak].Pts++; }
      });
      const sub = rows.slice(i, j).sort((a, b) => {
        const ha = h[norm(a.team)], hb = h[norm(b.team)];
        return (hb.Pts - ha.Pts) || ((hb.GF - hb.GA) - (ha.GF - ha.GA)) || (hb.GF - ha.GF) || a.team.localeCompare(b.team);
      });
      for (let k = 0; k < sub.length; k++) rows[i + k] = sub[k];
    }
    i = j;
  }
  return rows.map((r) => r.team);
}

const predOf = (p, g) => {
  const src = (p && (p.groupPreds || p.groups || p.predictions)) || {};
  const arr = src[g] || [];
  return (Array.isArray(arr) ? arr.slice(0, 4) : [1, 2, 3, 4].map((k) => arr[k])).map(canonTeam);
};

function myPoints(name) {
  const p = data.players[name];
  let groupRank = 0, knockout = 0, champ = 0;
  const lines = [];
  for (const g of GROUP_KEYS) {
    const table = myTable(g), pred = predOf(p, g);
    for (let pos = 0; pos < 4; pos++) {
      const hit = pred[pos] && table[pos] && sameTeam(pred[pos], table[pos]);
      if (hit) { groupRank += 1; lines.push(`  ${g}${pos + 1}: predicted ${pred[pos]} = actual ${table[pos]}  +1`); }
    }
  }
  // knockout: only R16/QF/SF/F score, +1 each, R32 ignored
  const kp = (p && p.knockout) || {};
  for (const mid in data.knockoutResults) {
    const round = (mid.split("_")[0] || "").toUpperCase();
    if (round === "R16" || round === "R32" || !["R16", "QF", "SF", "F"].includes(round)) continue;
    if (kp[mid] && sameTeam(kp[mid], data.knockoutResults[mid])) { knockout += 1; lines.push(`  ${mid}: ${kp[mid]} ✓  +1`); }
  }
  // R16 candidate slots (none picked in sample data, but score them if present)
  for (const slot of E.R16_BRACKET) {
    const pick = kp[slot.id]; if (!pick) continue;
    const set = new Set(slot.teams.map(norm));
    const m = (data.matches || []).find((x) => x.stage === "ko" && x.round === "R16" && x.home && x.away && set.has(norm(x.home)) && set.has(norm(x.away)));
    const w = m ? data.knockoutResults[m.mid] : null;
    if (w && sameTeam(pick, w)) { knockout += 1; lines.push(`  ${slot.id}: ${pick} ✓  +1`); }
  }
  if (data.champion && p && sameTeam(p.champion, data.champion)) { champ = 1; lines.push(`  champion: ${p.champion} ✓  +1`); }
  return { total: groupRank + knockout + champ, groupRank, knockout, champ, lines };
}

// ---- reconcile ------------------------------------------------------------
const engine = buildLeaderboard(data); // [{name, total, groupRank, knockout, champ, ...}]
const byName = Object.fromEntries(engine.map((r) => [r.name, r]));

console.log(`Audit clock: ${new Date(NOW).toISOString()} (all matches finished)`);
console.log(`Champion (decided): ${data.champion}`);
console.log(`Group results recorded: ${Object.keys(data.groupResults).length}/72   Knockout results: ${Object.keys(data.knockoutResults).length}\n`);

let allMatch = true;
const table = [];
for (const name of Object.keys(data.players).sort((a, b) => byName[b].total - byName[a].total)) {
  const mine = myPoints(name);
  const eng = byName[name];
  const ok = mine.total === eng.total && mine.groupRank === eng.groupRank && mine.knockout === eng.knockout && mine.champ === eng.champ;
  if (!ok) allMatch = false;
  table.push({ name, eng_total: eng.total, my_total: mine.total, gRank: eng.groupRank, ko: eng.knockout, champ: eng.champ, match: ok ? "OK" : "MISMATCH" });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("Player", 9) + pad("Engine", 8) + pad("Indep.", 8) + pad("GrpRank", 9) + pad("KO", 4) + pad("Champ", 7) + "Reconcile");
console.log("-".repeat(60));
for (const r of table) console.log(pad(r.name, 9) + pad(r.eng_total, 8) + pad(r.my_total, 8) + pad(r.gRank, 9) + pad(r.ko, 4) + pad(r.champ, 7) + r.match);

console.log("\n=== Worked breakdown (independent derivation) ===");
for (const r of table) {
  const mine = myPoints(r.name);
  console.log(`\n${r.name} — total ${mine.total}`);
  if (mine.lines.length) mine.lines.forEach((l) => console.log(l));
  else console.log("  (no scoring picks landed)");
}

console.log("\n" + (allMatch ? "✅ AUDIT PASSED — independent re-derivation matches the engine for every player." : "❌ AUDIT FAILED — see MISMATCH rows above."));
process.exit(allMatch ? 0 : 1);
