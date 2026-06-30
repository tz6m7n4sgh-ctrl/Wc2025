// Score the real JSON exports (predictions + GROUP results only) with the real engine.
import * as E from "./engine.mjs";
import fs from "fs";

const { GROUPS, GROUP_KEYS, RR, computeGroupTable, buildLeaderboard, calcPlayerPoints, sameTeam } = E;

const PRED = process.argv[2];
const RES = process.argv[3];
const KO = process.argv[4]; // optional knockout-results export (champion + knockout[])
const preds = JSON.parse(fs.readFileSync(PRED, "utf8"));
const res = JSON.parse(fs.readFileSync(RES, "utf8"));

const players = {};
for (const p of preds) {
  players[p.player] = {
    groupPreds: p.groupPreds || {},
    champion: p.champion || null,
    knockout: p.knockout || {},
  };
}

// group results, oriented to engine fixture
const groupResults = {};
let orientBad = 0;
for (const r of res) {
  const key = r.matchKey;
  const g = r.group, idx = Number(key.split("_")[1]);
  const [hi, ai] = RR[idx];
  const engHome = GROUPS[g][hi], engAway = GROUPS[g][ai];
  let hs = Number(r.homeScore), as = Number(r.awayScore);
  if (sameTeam(r.home, engHome) && sameTeam(r.away, engAway)) { /* ok */ }
  else if (sameTeam(r.home, engAway) && sameTeam(r.away, engHome)) { [hs, as] = [as, hs]; }
  else { orientBad++; console.log("ORIENT MISMATCH", key, r.home, r.away, "vs eng", engHome, engAway); }
  groupResults[g + "_" + idx] = { home: hs, away: as };
}
console.log("orientation mismatches:", orientBad, "| group results:", Object.keys(groupResults).length + "/72");

// knockout: rebuild synthetic ko matches keyed by slot so the engine's
// membership-based koSlotActualWinner resolves each slot to its real winner.
const matches = [];
const knockoutResults = {};
let champion = null;
if (KO) {
  const ko = JSON.parse(fs.readFileSync(KO, "utf8"));
  champion = ko.champion || null;
  let decided = 0;
  for (const r of ko.knockout || []) {
    if (r.home && r.away) matches.push({ stage: "ko", round: r.round, home: r.home, away: r.away, mid: r.slot });
    if (r.winner) { knockoutResults[r.slot] = r.winner; decided++; }
  }
  console.log("knockout results:", decided, "decided | champion:", champion || "(pending)", "\n");
} else {
  console.log("knockout results in export: NONE (group-only export)\n");
}

const data = { players, groupResults, knockoutResults, champion, matches };

// actual final tables
const tables = {};
for (const g of GROUP_KEYS) tables[g] = computeGroupTable(g, data);

// per-player breakdown
console.log("player".padEnd(18), "tot", "grpM", "grpR", "KO", "champ");
const rows = [];
for (const name of Object.keys(players)) {
  const r = calcPlayerPoints(players[name], data);
  rows.push({ name, ...r });
}
rows.sort((a, b) => b.total - a.total);
for (const r of rows) {
  console.log(
    r.name.padEnd(18),
    String(r.total).padStart(3),
    String(r.groupMatch).padStart(4),
    String(r.groupRank).padStart(4),
    String(r.knockout).padStart(3),
    String(r.champ).padStart(5),
  );
}
