// Bundle the REAL engine out of src/App.jsx for headless Node use.
// We append exports of the pure functions and stub the side-effecting local
// modules (network/analytics) so nothing reaches out. React/recharts are
// bundled but never invoked (we don't render the component).
import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const src = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const entry = path.join(root, "audit", "_engine_entry.jsx");
fs.writeFileSync(entry,
  src +
  "\nexport { buildSampleData, recomputeLive, buildLeaderboard, calcPlayerPoints, computeGroupTable, matchResult, GROUPS, GROUP_KEYS, RR, SCORING, R32_TIES, KO_SEQ, KO_SPAN, koSlotId, koSlotLeaves, koSlotContenders, koSlotActualWinner, koPrune, canonTeam, teamKey, sameTeam, setLiveMode, koPointsFor, champPointsFor, koMatchForSlot, koEliminatedSet, koTeamReached, koPotential, koSwingVsLeader, matchOutcomeDeltas };\n");

const stub = (names, extra = "") => ({
  contents: extra + names.map((n) => `export const ${n} = ${/URL$/.test(n) ? '""' : "(()=>{})"};`).join("\n"),
  loader: "js",
});

const stubPlugin = {
  name: "stub-local",
  setup(b) {
    const map = {
      "./supabase.js": stub(["loadFromSupabase", "saveBlob", "upsertResult", "upsertResults"], 'export const SB_URL="";export const SB_KEY="";\n'),
      "./secureAuth.js": stub(["secureAuthOn", "secureLogin", "secureSave", "loadPlayerRows"], 'export const SECURE_AUTH_URL="";\n'),
      "./thesportsdb.js": stub(["fetchLivescore", "fetchCompletedResults", "fetchResultsRange", "fetchSeasonEvents", "getFeedStatus", "fetchMatchDetail", "fetchEventFinals"]),
      "./analytics.js": stub(["trackEvent", "trackPageView", "setAnalyticsContext"]),
    };
    b.onResolve({ filter: /\.\/(supabase|secureAuth|thesportsdb|analytics)\.js$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => map[a.path]);
  },
};

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: path.join(root, "audit", "engine.mjs"),
  plugins: [stubPlugin],
  logLevel: "warning",
  jsx: "automatic",
});
fs.unlinkSync(entry);
console.log("built audit/engine.mjs");
