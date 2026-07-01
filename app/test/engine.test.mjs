// Regression tests for the scoring engine (the app's core).
// The engine is bundled from src/App.jsx by `node audit/build.mjs` into
// audit/engine.mjs; `npm test` builds it first, then runs this file with the
// node:test runner. These lock in the scoring rules and the trickier knockout
// logic (shootout resolution, still-alive potential, leader swing) so future
// UI work can't silently break the maths.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../audit/engine.mjs";

const {
  buildSampleData, recomputeLive, buildLeaderboard, calcPlayerPoints, computeGroupTable,
  GROUPS, GROUP_KEYS, RR, R32_TIES, KO_SEQ, koSlotId, koSlotActualWinner, koPointsFor,
  champPointsFor, canonTeam, teamKey, sameTeam, setLiveMode, koEliminatedSet, koPotential,
  koSwingVsLeader, matchOutcomeDeltas,
} = E;

setLiveMode(false);
const CLOCK = Date.UTC(2026, 7, 1); // past the final: whole tournament decided

// Build a minimal, fully-controlled tournament: real fixed R32 draw + a handful
// of decided knockout ties, and two players with known picks. This avoids the
// sample data's dynamic bracket and exercises the engine's fixed-bracket path.
function makeData(players, koWinners = {}, opts = {}) {
  const isReal = (t) => GROUP_KEYS.some((g) => GROUPS[g].some((x) => sameTeam(x, t)));
  const matches = [];
  // group matches (all finished, given scores) if provided
  const groupResults = opts.groupResults || {};
  for (const g of GROUP_KEYS) for (let i = 0; i < 6; i++) {
    const [hi, ai] = RR[i], home = GROUPS[g][hi], away = GROUPS[g][ai];
    const r = groupResults[g + "_" + i];
    matches.push({ id: g + "_" + i, stage: "group", group: g, idx: i, home, away, ko: 0, real: true, adminLocked: true, status: r ? "finished" : "scheduled", finalH: r ? r.home : null, finalA: r ? r.away : null });
  }
  // knockout ties from R32_TIES; a winner in koWinners marks that tie decided
  for (const [code, n] of KO_SEQ) {
    for (let i = 0; i < n; i++) {
      let home = null, away = null;
      if (code === "R32") [home, away] = R32_TIES[i];
      const id = koSlotId(code, i);
      const w = koWinners[id];
      const decided = code === "R32" && w != null;
      matches.push({
        id: `${code}_${i}`, mid: `${code}_${i}`, stage: "ko", round: code, idx: i,
        home: home ? canonTeam(home) : null, away: away ? canonTeam(away) : null, ko: 0, real: true, adminLocked: true,
        status: decided ? "finished" : "scheduled",
        finalH: decided ? (sameTeam(w, home) ? 2 : 1) : null, finalA: decided ? (sameTeam(w, home) ? 1 : 2) : null,
        penWinner: null,
      });
    }
  }
  return recomputeLive({ players, matches, groupResults: {}, knockoutResults: {}, champion: opts.champion || null, championOverride: opts.champion || null }, CLOCK);
}

test("group ranking: +1 for each team placed in its exact final position", () => {
  // Group A real order: derive the actual table, predict it exactly -> 4 points.
  const base = makeData({}, {}, { groupResults: groupResultsThatDecideA() });
  const table = computeGroupTable("A", base).map((r) => r.team);
  // predict only group A exactly; leave the rest unpredicted so they score 0
  const p = { groupPreds: { A: table.slice(0, 4) }, champion: null, knockout: {} };
  const data = makeData({ P: p }, {}, { groupResults: groupResultsThatDecideA() });
  const r = calcPlayerPoints(data.players.P, data);
  assert.equal(r.groupRank, 4, "exact group A prediction should score 4 (one per slot)");
});

test("knockout: a pick scores the round's points only when its team wins the tie", () => {
  const koPts = koPointsFor({});
  // R32#2 is South Africa vs Canada -> Canada wins.
  const [a2] = R32_TIES[2];
  const winner = canonTeam(R32_TIES[2][1]); // Canada
  const right = { groupPreds: {}, champion: null, knockout: { [koSlotId("R32", 2)]: winner } };
  const wrong = { groupPreds: {}, champion: null, knockout: { [koSlotId("R32", 2)]: canonTeam(a2) } };
  const data = makeData({ R: right, W: wrong }, { [koSlotId("R32", 2)]: winner });
  assert.equal(calcPlayerPoints(data.players.R, data).knockout, koPts.R32, "correct R32 pick scores R32 points");
  assert.equal(calcPlayerPoints(data.players.W, data).knockout, 0, "wrong R32 pick scores 0");
});

test("champion: scores champ points only once the final is decided", () => {
  const champ = canonTeam(R32_TIES[0][0]); // Germany
  const p = { groupPreds: {}, champion: champ, knockout: {} };
  const undecided = makeData({ P: p });
  assert.equal(calcPlayerPoints(undecided.players.P, undecided).champ, 0, "no champ points before the final");
  const decided = makeData({ P: p }, {}, { champion: champ });
  assert.equal(calcPlayerPoints(decided.players.P, decided).champ, champPointsFor({}), "champ points once the champion matches");
});

test("buildLeaderboard: sorted by total desc, ranks assigned 1..n", () => {
  const data = recomputeLive(buildSampleData(), CLOCK);
  const lb = buildLeaderboard(data);
  assert.ok(lb.length > 1);
  for (let i = 1; i < lb.length; i++) assert.ok(lb[i - 1].total >= lb[i].total, "totals must be non-increasing");
  assert.deepEqual(lb.map((r) => r.rank), lb.map((_, i) => i + 1), "ranks must be 1..n in order");
});

test("shootout inference: a drawn KO tie resolves to whoever reached the next round", () => {
  // Netherlands 1-1 Morocco with no penWinner, but a real R16 fixture Canada vs
  // Morocco exists -> Morocco must have advanced, so recomputeLive credits it.
  const isReal = (t) => GROUP_KEYS.some((g) => GROUPS[g].some((x) => sameTeam(x, t)));
  const NED = canonTeam("Netherlands"), MAR = canonTeam("Morocco"), CAN = canonTeam("Canada");
  const matches = [
    { id: "R32_3", mid: "R32_3", stage: "ko", round: "R32", idx: 3, home: NED, away: MAR, ko: 0, real: true, adminLocked: true, status: "finished", finalH: 1, finalA: 1, penWinner: null },
    // downstream R16 fixture naming Morocco as a participant (it advanced)
    { id: "R16_1", mid: "R16_1", stage: "ko", round: "R16", idx: 1, home: CAN, away: MAR, ko: 0, real: true, adminLocked: true, status: "scheduled", finalH: null, finalA: null },
  ];
  const data = recomputeLive({ players: {}, matches, groupResults: {}, knockoutResults: {}, champion: null, championOverride: null }, CLOCK);
  assert.equal(canonTeam(koSlotActualWinner("R32", 3, data)), MAR, "drawn tie resolves to the team that appears in a later round");
});

test("koPotential: a pick counts toward the ceiling only while its team is alive", () => {
  const koPts = koPointsFor({});
  // R32#2 decided (Canada beats South Africa) -> South Africa eliminated.
  const winner = canonTeam(R32_TIES[2][1]);
  const data = makeData({}, { [koSlotId("R32", 2)]: winner });
  const elim = koEliminatedSet(data);
  assert.ok(elim.has(teamKey(R32_TIES[2][0])), "the loser of a decided tie is eliminated");
  // player who picked the eliminated team deep gets no potential from it
  const deadPick = { groupPreds: {}, champion: null, knockout: { [koSlotId("R16", 1)]: canonTeam(R32_TIES[2][0]) } };
  const pot = koPotential(deadPick, data, koPts, champPointsFor({}), elim);
  assert.equal(pot.potKO, 0, "an eliminated team contributes no still-winnable points");
  // player who picked an alive team keeps the potential
  const alivePick = { groupPreds: {}, champion: null, knockout: { [koSlotId("R16", 1)]: winner } };
  const pot2 = koPotential(alivePick, data, koPts, champPointsFor({}), elim);
  assert.equal(pot2.potKO, koPts.R16, "an alive pick keeps its round's potential");
});

test("koSwingVsLeader: only picks that differ from the leader can close the gap", () => {
  const koPts = koPointsFor({}), champPts = champPointsFor({});
  const data = makeData({});
  const elim = koEliminatedSet(data);
  const slot = koSlotId("QF", 0);
  const teamA = canonTeam(R32_TIES[0][0]);
  const leader = { groupPreds: {}, champion: null, knockout: { [slot]: teamA } };
  const sameChaser = { groupPreds: {}, champion: null, knockout: { [slot]: teamA } };
  const diffChaser = { groupPreds: {}, champion: null, knockout: { [slot]: canonTeam(R32_TIES[1][0]) } };
  assert.equal(koSwingVsLeader(sameChaser, leader, data, koPts, champPts, elim).swing, 0, "a shared pick yields no swing on the leader");
  assert.equal(koSwingVsLeader(diffChaser, leader, data, koPts, champPts, elim).swing, koPts.QF, "a differing, alive pick yields the round's swing");
});

test("matchOutcomeDeltas: an undecided KO tie moves only the backers of the winner", () => {
  const NED = canonTeam("Netherlands"), MAR = canonTeam("Morocco");
  const backsNed = { groupPreds: {}, champion: null, knockout: { [koSlotId("R32", 3)]: NED } };
  const backsMar = { groupPreds: {}, champion: null, knockout: { [koSlotId("R32", 3)]: MAR } };
  const data = makeData({ N: backsNed, M: backsMar });
  const m = data.matches.find((x) => x.stage === "ko" && x.round === "R32" && x.idx === 3);
  const d = matchOutcomeDeltas(data, m, ["N", "M"]);
  const koPts = koPointsFor({});
  assert.equal(d.home.N, koPts.R32, "if the home team wins, its backer gains the round points");
  assert.equal(d.home.M, 0, "the other backer gains nothing on a home win");
  assert.equal(d.away.M, koPts.R32, "if the away team wins, its backer gains the round points");
  assert.equal(d.away.N, 0, "the home backer gains nothing on an away win");
});

test("koPointsFor / champPointsFor honour admin-configured points", () => {
  const data = { settings: { koPoints: { R32: 2, R16: 3, QF: 4, SF: 5, F: 6 }, champPoints: 10 } };
  const ko = koPointsFor(data);
  assert.equal(ko.R32, 2, "configured R32 points"); assert.equal(ko.F, 6, "configured final points");
  assert.equal(champPointsFor(data), 10, "configured champion points");
  // partial override merges over the defaults
  const partial = koPointsFor({ settings: { koPoints: { F: 6 } } });
  assert.equal(partial.F, 6, "overridden round"); assert.ok(Number.isFinite(partial.R32), "unset rounds keep a default");
});

// --- helpers ---------------------------------------------------------------
// A set of group-A results that fully decide the table (each team a distinct
// points total), reused by the group-ranking tests.
function groupResultsThatDecideA() {
  // team indices 0..3 in GROUPS.A; make 0>1>2>3 by wins.
  return {
    A_0: { home: 3, away: 0 }, A_1: { home: 3, away: 0 }, A_2: { home: 3, away: 0 },
    A_3: { home: 3, away: 0 }, A_4: { home: 3, away: 0 }, A_5: { home: 3, away: 0 },
  };
}
