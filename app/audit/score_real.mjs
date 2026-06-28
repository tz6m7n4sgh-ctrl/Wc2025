// Score the REAL league data (predictions + group results exported 28 Jun)
// using the actual shipped engine, and compare to the manually-counted totals.
import * as E from "./engine.mjs";
import fs from "fs";

const { GROUPS, GROUP_KEYS, RR, computeGroupTable, buildLeaderboard, canonTeam, teamKey, sameTeam, matchResult } = E;

function parseCsv(txt) {
  const lines = txt.trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => {
    // naive split is fine — no quoted commas in this data
    const cells = l.split(",");
    const o = {}; head.forEach((h, i) => (o[h] = cells[i]));
    return o;
  });
}

// ---- predictions ----
const preds = parseCsv(fs.readFileSync("./audit/predictions.csv", "utf8"));
const players = {};
for (const r of preds) {
  const name = r.Player;
  if (!players[name]) players[name] = { groupPreds: {}, champion: r.Champion || null, knockout: {} };
  players[name].groupPreds[r.Group] = [r["1st"], r["2nd"], r["3rd"], r["4th"]].map((x) => x && x.trim());
}

// ---- group results ----
const res = parseCsv(fs.readFileSync("./audit/groupresults.csv", "utf8"));
const groupResults = {};
let orientBad = 0;
for (const r of res) {
  const g = r.Group, key = r.MatchKey;
  const idx = Number(key.split("_")[1]);
  const [hi, ai] = RR[idx];
  const engHome = GROUPS[g][hi], engAway = GROUPS[g][ai];
  // verify the CSV orientation matches the engine fixture; swap the score if reversed
  let hs = Number(r.HomeScore), as = Number(r.AwayScore);
  if (sameTeam(r.Home, engHome) && sameTeam(r.Away, engAway)) { /* ok */ }
  else if (sameTeam(r.Home, engAway) && sameTeam(r.Away, engHome)) { [hs, as] = [as, hs]; }
  else { orientBad++; console.log("ORIENT MISMATCH", key, r.Home, r.Away, "vs eng", engHome, engAway); }
  groupResults[g + "_" + idx] = { home: hs, away: as };
}
console.log("orientation mismatches:", orientBad, "| results:", Object.keys(groupResults).length + "/72\n");

const data = { players, groupResults, knockoutResults: {}, champion: null, matches: [] };

// ---- actual final tables (engine logic) ----
const tables = {};
for (const g of GROUP_KEYS) tables[g] = computeGroupTable(g, data).map((r) => r.team);

// ---- app score (authoritative engine) ----
const lb = buildLeaderboard(data);
const byName = Object.fromEntries(lb.map((r) => [r.name, r]));

// manual totals provided by the user (mapped to full names)
const manual = {
  "Majdi Haddad": 36, "Kamal": 35, "Dani Haddad": 34, "Qais M Haddad": 31, "Alaa Madain": 31,
  "Khader": 28, "Odai Haddad": 25, "Muhannad Haddad": 24, "Nadi zawaydeh": 23, "Qusai Haddad": 20, "Moaid Haddad": 16,
};

// alternative scoring rules to identify which one the manual count used
function scoreVariant(name, mode) {
  const p = players[name]; let pts = 0;
  for (const g of GROUP_KEYS) {
    const table = tables[g], pred = (p.groupPreds[g] || []).map(canonTeam);
    const top2 = new Set(table.slice(0, 2).map(teamKey));
    for (let pos = 0; pos < 4; pos++) {
      const actual = table[pos], pick = pred[pos];
      if (!pick) continue;
      const exact = actual && sameTeam(pick, actual);
      if (mode === "exact4") { if (exact) pts += 1; }
      else if (mode === "exact_plus_qualifier") { if (exact) pts += 1; else if (pos < 2 && top2.has(teamKey(pick))) pts += 1; }
      else if (mode === "top2set") { if (pos < 2 && top2.has(teamKey(pick))) pts += 1; }
      else if (mode === "exact_top2only") { if (pos < 2 && exact) pts += 1; }
    }
  }
  return pts;
}

const names = Object.keys(players).sort((a, b) => (manual[b] || 0) - (manual[a] || 0));
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("Player", 17) + pad("Manual", 8) + pad("App(exact4)", 13) + pad("exact+qual", 12) + pad("top2set", 9) + pad("exactTop2", 10));
console.log("-".repeat(70));
for (const n of names) {
  console.log(
    pad(n, 17) + pad(manual[n] ?? "?", 8) +
    pad(byName[n] ? byName[n].total : "?", 13) +
    pad(scoreVariant(n, "exact_plus_qualifier"), 12) +
    pad(scoreVariant(n, "top2set"), 9) +
    pad(scoreVariant(n, "exact_top2only"), 10)
  );
}

// which variant reproduces the manual totals exactly?
const variants = ["exact4", "exact_plus_qualifier", "top2set", "exact_top2only"];
console.log("\nWhich rule matches the manual totals?");
for (const v of variants) {
  const ok = names.every((n) => manual[n] != null && scoreVariant(n, v) === manual[n]);
  const diffs = names.filter((n) => manual[n] != null && scoreVariant(n, v) !== manual[n]).length;
  console.log(`  ${pad(v, 22)} ${ok ? "EXACT MATCH ✅" : diffs + " players differ"}`);
}

// per-player, per-group worked breakdown vs the APP (exact4) rule
console.log("\n=== Per-group detail (actual final order | your pick | hits) ===");
for (const n of names) {
  const p = players[n];
  let tot = 0; const groupHits = [];
  for (const g of GROUP_KEYS) {
    const table = tables[g], pred = (p.groupPreds[g] || []).map(canonTeam);
    let h = 0; for (let pos = 0; pos < 4; pos++) if (pred[pos] && table[pos] && sameTeam(pred[pos], table[pos])) h++;
    tot += h; groupHits.push(`${g}:${h}`);
  }
  console.log(`\n${n} — app ${tot}, manual ${manual[n] ?? "?"}  (${tot === manual[n] ? "match" : "DIFF " + (manual[n] - tot)})`);
  console.log("  " + groupHits.join("  "));
}
