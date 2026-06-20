import React, { useState, useMemo, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, CartesianGrid, Legend, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { loadFromSupabase, saveBlob, upsertResult, upsertResults } from "./supabase.js";
import { fetchLivescore, fetchCompletedResults, fetchResultsRange, getFeedStatus, fetchMatchDetail } from "./thesportsdb.js";

/* =====================================================================
   WORLD CUP 2026 — Prediction League (React rebuild, foundation)
   Ports the real scoring engine from the rebuild guide. All diagrams are
   driven by seeded sample data so the engine produces live, varied output.
   ===================================================================== */

/* ---------------- 1. Tournament constants (verbatim from guide) -------- */
const GROUPS = {
  A: ["Mexico", "South Africa", "South Korea", "Czechia"],
  B: ["Canada", "Switzerland", "Qatar", "Bosnia-Herzegovina"],
  C: ["Brazil", "Morocco", "Scotland", "Haiti"],
  D: ["USA", "Paraguay", "Australia", "Turkey"],
  E: ["Germany", "Curacao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Tunisia", "Sweden"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
  I: ["France", "Senegal", "Norway", "Iraq"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "Colombia", "Uzbekistan", "DR Congo"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};
const GROUP_KEYS = Object.keys(GROUPS);
const RR = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
const SCORING = {
  edgeCorrect: 1,
  exactPosition: 3,
  teamInGroupWrongPos: 1,
  champion: 10,
  knockout: { R32: 2, R16: 3, QF: 5, SF: 8, F: 12 },
};
const TEAM_ALIASES = {
  "Bosnia-Herzegovina": ["bosnia and herzegovina", "bosnia", "bosnia herzegovina"],
  USA: ["united states", "us", "america", "usmnt"],
  "South Korea": ["korea republic", "korea", "republic of korea"],
  Czechia: ["czech republic", "czech"],
  "Cape Verde": ["cabo verde"],
  "Ivory Coast": ["cote d'ivoire", "côte d'ivoire"],
  Curacao: ["curaçao"],
  "Saudi Arabia": ["ksa", "saudi"],
  Turkey: ["türkiye", "turkiye"],
  Iran: ["ir iran", "i.r. iran"],
  "DR Congo": ["congo dr", "drc", "democratic republic of the congo"],
};
const TEAM_FLAGS = {
  Mexico: "🇲🇽", "South Africa": "🇿🇦", "South Korea": "🇰🇷", Czechia: "🇨🇿",
  Canada: "🇨🇦", Switzerland: "🇨🇭", "Bosnia-Herzegovina": "🇧🇦", Qatar: "🇶🇦",
  Brazil: "🇧🇷", Morocco: "🇲🇦", Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", Haiti: "🇭🇹",
  Turkey: "🇹🇷", USA: "🇺🇸", Australia: "🇦🇺", Paraguay: "🇵🇾",
  Germany: "🇩🇪", "Ivory Coast": "🇨🇮", Ecuador: "🇪🇨", Curacao: "🇨🇼",
  Netherlands: "🇳🇱", Japan: "🇯🇵", Sweden: "🇸🇪", Tunisia: "🇹🇳",
  Belgium: "🇧🇪", Egypt: "🇪🇬", Iran: "🇮🇷", "New Zealand": "🇳🇿",
  Spain: "🇪🇸", Uruguay: "🇺🇾", "Saudi Arabia": "🇸🇦", "Cape Verde": "🇨🇻",
  France: "🇫🇷", Norway: "🇳🇴", Senegal: "🇸🇳", Iraq: "🇮🇶",
  Argentina: "🇦🇷", Austria: "🇦🇹", Algeria: "🇩🇿", Jordan: "🇯🇴",
  Portugal: "🇵🇹", Colombia: "🇨🇴", "DR Congo": "🇨🇩", Uzbekistan: "🇺🇿",
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Panama: "🇵🇦", Ghana: "🇬🇭", Croatia: "🇭🇷",
};

/* ---------------- 2. i18n ------------------------------------------------ */
const I18N = {
  en: {
    brand: "World Cup 2026", dir: "ltr",
    nav_home: "Home", nav_table: "Table", nav_groups: "Groups", nav_bracket: "Bracket", nav_profile: "Profile",
    leader: "Current leader", phase_group: "Group stage", phase_ko: "Knockout stage", phase_done: "Complete", phase_pre: "Pre-tournament",
    matchesDone: "Group matches played", pts: "pts", rank: "Rank", player: "Player", points: "Points",
    breakdown: "Points breakdown", groupMatch: "Group matches", groupRank: "Group ranking", knockout: "Knockout", champion: "Champion",
    pos1: "1st", pos2: "2nd", pos3: "3rd", pos4: "4th",
    P: "P", W: "W", D: "D", L: "L", GD: "GD", GF: "GF", Pts: "Pts",
    pending: "Pending", spread: "Points spread", movers: "Biggest movers", standings: "Standings",
    predicted: "Your pick", actual: "Actual", champPick: "Champion pick", qualified: "Qualified",
    howScoring: "How scoring works", tapPlayer: "Tap a player for their breakdown",
    r_R32: "Round of 32", r_R16: "Round of 16", r_QF: "Quarter-finals", r_SF: "Semi-finals", r_F: "Final",
    selectPlayer: "Select a player", group: "Group", winnerAdv: "advances",
    rule_edge: "Pick the higher-ranked team and they win the match", rule_exact: "Team finishes in the exact position you predicted",
    rule_in: "Team is in the group but in a different position", rule_ko: "Correct knockout-round winner", rule_champ: "Correct champion",
    nav_more: "More", nav_matches: "Matches", nav_predictions: "Predictions", nav_consensus: "Consensus", nav_trends: "Trends", nav_scorers: "Goals", nav_help: "Help",
    nav_today: "Today", liveNow: "Live now", noMatches: "No matches on this day.", noEvents: "No data yet.", predBacking: "backing", whoBacked: "Who backed whom", back: "Back", upcoming: "Upcoming",
    nextMatch: "Next match", todayComing: "Today — coming up", todayDone: "Today — completed", noComing: "No more matches today.", noDone: "No results yet today.", latestResults: "Latest results", seeAll: "See all",
    nav_points: "Points", livePoints: "Live points", livePtsHint: "recalculated from results", howCalc: "How points are calculated", pendingLive: "Pending", fromLive: "from live matches",
    groupBreakdown: "Group-by-group breakdown", tapExpand: "tap to expand", beat: "beat", champPending: "Champion not decided yet", ifCorrect: "if correct",
    admin: "Admin", adminLogin: "Admin login", password: "Password", wrongPw: "Incorrect password", login: "Log in", demoPw: "Demo password", logout: "Log out",
    nav_settings: "Settings", nav_results: "Results", nav_playerpicks: "Player picks", nav_playerreport: "Position report", nav_audit: "Audit log", nav_backup: "Backup", nav_health: "Health", nav_sync: "Sync results", nav_repair: "Repair",
    resultsEditor: "Results editor", resultsHint: "Enter a score to mark a match finished — standings, points and the bracket update instantly.", setChampion: "Set champion",
    entryFee: "Entry fee", currency: "Currency", distribution: "Prize distribution", winnerTakes: "Winner takes all", topTwo: "Split top 2", topThree: "Split top 3", deadline: "Predictions deadline", lockPicks: "Lock predictions", prizePool: "Prize pool",
    exportData: "Export data", importData: "Import data", pasteJson: "Paste backup JSON here…", copy: "Copy", copied: "copied", loaded: "loaded", badJson: "invalid JSON", load: "Load",
    hPlayers: "Players", hPreds: "All group predictions complete", hChamp: "All champion picks set", hMatches: "Matches finished", hGroups: "Groups complete", hEngine: "Engine totals reconcile",
    noChanges: "No changes yet.", repairHint: "Normalize the dataset: backfill missing fields and re-derive results.", runRepair: "Run repair", repairDone: "Dataset normalized.",
    syncHint: "Live sync pulls fixtures and results from TheSportsDB. Connect the data layer to enable.", syncNow: "Sync now", reportHint: "Points by category per player. PDF export ships with the data layer.",
    tab_events: "Events", tab_lineups: "Lineups", tab_stats: "Stats", tab_predictions: "Predictions", formation: "Formation", bench: "Bench",
    stat_possession: "Possession", stat_shots: "Shots", stat_sot: "Shots on target", stat_corners: "Corners", stat_fouls: "Fouls", stat_offsides: "Offsides",
    champConsensus: "Champion pick consensus", topWinners: "Most-picked group winners", predGridHint: "Predicted group winner per player — tap a row for full picks",
    predHitGroup: "Matches the actual group winner", trendsHint: "cumulative points", scorersNote: "Top scoring teams (computed from results). Player-level scorers arrive with the live data layer.",
    sample: "Sample data — engine is live",
    ht_full: "HALF-TIME", ft_full: "FULL-TIME",
    brkIllustrative: "Round-of-32 pairings are illustrative — players predict group order, not exact matchups.",
    brkFills: "The bracket fills in once every group is complete.",
    noPlayers: "No players yet. Add predictions to get started.",
    koNeedsWinner: "needs a winner",
    loadingData: "Loading live data…", liveData: "Live data",
    syncHint2: "Pull finished scores from TheSportsDB and save them to the database so everyone sees them.",
    syncing: "Syncing…", feedReach: "Feed reachable", feedEvents: "Events fetched", feedCompleted: "Completed found", feedSaved: "Saved to DB", feedMissing: "Still missing a score",
    timezone: "Display timezone", tzCheck: "Timezone check", tzApp: "App timezone", tzAppNow: "App time now", tzDevice: "Device timezone", tzDeviceNow: "Device time now", tzNote: "Times are shown in the app timezone above, not the device's — change it here if needed.",
    noDetail: "No detailed data for this match yet (timelines/lineups can be missing or delayed).",
    p_howAdd: "How your points add up", p_correct: "correct", p_of: "of",
    p_winner_t: "Match winners", p_winner_d: "+1 each time your higher-ranked team wins its group match",
    p_pos_t: "Group standings", p_pos_d: "+3 for a team in the exact final spot, +1 if it finishes in the group but elsewhere",
    p_ko_t: "Knockout winners", p_ko_d: "Points for picking the team that advances (R32 +2, R16 +3, QF +5, SF +8, Final +12)",
    p_champ_t: "Champion", p_champ_d: "+10 for correctly picking the World Cup winner",
    p_exact: "exact", p_ingrp: "in group", p_yes: "correct", p_no: "missed",
  },
  ar: {
    brand: "كأس العالم 2026", dir: "rtl",
    nav_home: "الرئيسية", nav_table: "الترتيب", nav_groups: "المجموعات", nav_bracket: "الأدوار", nav_profile: "الملف",
    leader: "المتصدر الحالي", phase_group: "دور المجموعات", phase_ko: "الأدوار الإقصائية", phase_done: "انتهت", phase_pre: "قبل البطولة",
    matchesDone: "مباريات المجموعات", pts: "نقطة", rank: "المركز", player: "اللاعب", points: "النقاط",
    breakdown: "تفصيل النقاط", groupMatch: "مباريات المجموعات", groupRank: "ترتيب المجموعات", knockout: "الإقصائيات", champion: "البطل",
    pos1: "الأول", pos2: "الثاني", pos3: "الثالث", pos4: "الرابع",
    P: "لعب", W: "فوز", D: "تعادل", L: "خسارة", GD: "الفارق", GF: "له", Pts: "نقاط",
    pending: "قيد الانتظار", spread: "توزيع النقاط", movers: "أبرز التغيرات", standings: "الترتيب",
    predicted: "توقعك", actual: "الفعلي", champPick: "توقع البطل", qualified: "المتأهلون",
    howScoring: "طريقة احتساب النقاط", tapPlayer: "اضغط على لاعب لعرض التفصيل",
    r_R32: "دور الـ32", r_R16: "دور الـ16", r_QF: "ربع النهائي", r_SF: "نصف النهائي", r_F: "النهائي",
    selectPlayer: "اختر لاعباً", group: "المجموعة", winnerAdv: "يتأهل",
    rule_edge: "اختر الفريق الأعلى ترتيباً ويفوز بالمباراة", rule_exact: "الفريق ينهي في المركز الذي توقعته بالضبط",
    rule_in: "الفريق في المجموعة لكن في مركز مختلف", rule_ko: "توقع الفائز الصحيح في الدور الإقصائي", rule_champ: "توقع البطل الصحيح",
    nav_more: "المزيد", nav_matches: "المباريات", nav_predictions: "التوقعات", nav_consensus: "الإجماع", nav_trends: "التطور", nav_scorers: "الأهداف", nav_help: "المساعدة",
    nav_today: "اليوم", liveNow: "مباشر الآن", noMatches: "لا مباريات في هذا اليوم.", noEvents: "لا توجد بيانات بعد.", predBacking: "مؤيد", whoBacked: "من أيّد مَن", back: "رجوع", upcoming: "قادمة",
    nextMatch: "المباراة القادمة", todayComing: "اليوم — قادمة", todayDone: "اليوم — انتهت", noComing: "لا مزيد من المباريات اليوم.", noDone: "لا نتائج بعد اليوم.", latestResults: "أحدث النتائج", seeAll: "عرض الكل",
    nav_points: "النقاط", livePoints: "النقاط المباشرة", livePtsHint: "تُحتسب من النتائج", howCalc: "كيف تُحتسب النقاط", pendingLive: "قيد الاحتساب", fromLive: "من المباريات المباشرة",
    groupBreakdown: "تفصيل لكل مجموعة", tapExpand: "اضغط للتوسيع", beat: "تغلّب على", champPending: "البطل لم يُحسم بعد", ifCorrect: "إذا صح",
    admin: "الإدارة", adminLogin: "دخول الإدارة", password: "كلمة المرور", wrongPw: "كلمة المرور غير صحيحة", login: "دخول", demoPw: "كلمة المرور التجريبية", logout: "خروج",
    nav_settings: "الإعدادات", nav_results: "النتائج", nav_playerpicks: "توقعات اللاعب", nav_playerreport: "تقرير المراكز", nav_audit: "سجل التغييرات", nav_backup: "نسخ احتياطي", nav_health: "الصحة", nav_sync: "مزامنة النتائج", nav_repair: "إصلاح",
    resultsEditor: "محرّر النتائج", resultsHint: "أدخل النتيجة لإنهاء المباراة — يُحدّث الترتيب والنقاط والأدوار فوراً.", setChampion: "تعيين البطل",
    entryFee: "رسوم الاشتراك", currency: "العملة", distribution: "توزيع الجوائز", winnerTakes: "الفائز يأخذ الكل", topTwo: "أفضل اثنين", topThree: "أفضل ثلاثة", deadline: "موعد إغلاق التوقعات", lockPicks: "قفل التوقعات", prizePool: "مجموع الجوائز",
    exportData: "تصدير البيانات", importData: "استيراد البيانات", pasteJson: "الصق نسخة JSON هنا…", copy: "نسخ", copied: "تم النسخ", loaded: "تم التحميل", badJson: "JSON غير صالح", load: "تحميل",
    hPlayers: "اللاعبون", hPreds: "اكتمال توقعات المجموعات", hChamp: "تعيين كل توقعات البطل", hMatches: "المباريات المنتهية", hGroups: "المجموعات المكتملة", hEngine: "تطابق مجاميع المحرّك",
    noChanges: "لا تغييرات بعد.", repairHint: "توحيد البيانات: استكمال الحقول الناقصة وإعادة احتساب النتائج.", runRepair: "تشغيل الإصلاح", repairDone: "تم توحيد البيانات.",
    syncHint: "المزامنة المباشرة تجلب المباريات والنتائج من TheSportsDB. اربط طبقة البيانات للتفعيل.", syncNow: "مزامنة الآن", reportHint: "النقاط حسب الفئة لكل لاعب. تصدير PDF يأتي مع طبقة البيانات.",
    tab_events: "الأحداث", tab_lineups: "التشكيلات", tab_stats: "الإحصائيات", tab_predictions: "التوقعات", formation: "الخطة", bench: "البدلاء",
    stat_possession: "الاستحواذ", stat_shots: "التسديدات", stat_sot: "على المرمى", stat_corners: "الركنيات", stat_fouls: "الأخطاء", stat_offsides: "تسلل",
    champConsensus: "إجماع توقع البطل", topWinners: "الأكثر توقعاً كمتصدر", predGridHint: "المتصدر المتوقع لكل لاعب — اضغط الصف لكل التوقعات",
    predHitGroup: "يطابق المتصدر الفعلي", trendsHint: "النقاط التراكمية", scorersNote: "الفرق الأكثر تسجيلاً (محسوبة من النتائج). الهدّافون يصلون مع طبقة البيانات المباشرة.",
    sample: "بيانات تجريبية — المحرّك يعمل",
    ht_full: "نهاية الشوط الأول", ft_full: "نهاية المباراة",
    brkIllustrative: "مواجهات دور الـ32 توضيحية — يتوقع اللاعبون ترتيب المجموعات لا المواجهات بالضبط.",
    brkFills: "تكتمل الأدوار الإقصائية بعد انتهاء جميع المجموعات.",
    noPlayers: "لا يوجد لاعبون بعد. أضف التوقعات للبدء.",
    koNeedsWinner: "يلزم تحديد فائز",
    loadingData: "جارٍ تحميل البيانات…", liveData: "بيانات مباشرة",
    syncHint2: "اجلب نتائج المباريات المنتهية من TheSportsDB واحفظها في قاعدة البيانات ليراها الجميع.",
    syncing: "جارٍ المزامنة…", feedReach: "وصول الخدمة", feedEvents: "الأحداث المجلوبة", feedCompleted: "المنتهية الموجودة", feedSaved: "حُفظت في القاعدة", feedMissing: "بلا نتيجة بعد",
    timezone: "المنطقة الزمنية للعرض", tzCheck: "فحص المنطقة الزمنية", tzApp: "منطقة التطبيق", tzAppNow: "وقت التطبيق الآن", tzDevice: "منطقة الجهاز", tzDeviceNow: "وقت الجهاز الآن", tzNote: "تُعرض الأوقات بمنطقة التطبيق أعلاه وليس بمنطقة الجهاز — غيّرها هنا إذا لزم.",
    noDetail: "لا تتوفر بيانات تفصيلية بعد (قد تتأخر التشكيلات والأحداث).",
    p_howAdd: "كيف تتكوّن نقاطك", p_correct: "صحيحة", p_of: "من",
    p_winner_t: "الفائز بالمباراة", p_winner_d: "+1 كلما فاز فريقك الأعلى ترتيباً في مباراة المجموعة",
    p_pos_t: "ترتيب المجموعة", p_pos_d: "+3 للفريق في مركزه النهائي الصحيح، +1 إذا أنهى ضمن المجموعة بمركز آخر",
    p_ko_t: "الأدوار الإقصائية", p_ko_d: "نقاط لاختيار الفريق المتأهل (دور 32 +2، دور 16 +3، الربع +5، النصف +8، النهائي +12)",
    p_champ_t: "البطل", p_champ_d: "+10 لاختيار بطل كأس العالم بشكل صحيح",
    p_exact: "صحيح", p_ingrp: "في المجموعة", p_yes: "صحيح", p_no: "خطأ",
  },
};

/* ---------------- 3. Scoring engine (pure, from guide §6) ---------------- */
const norm = (s) =>
  String(s == null ? "" : s).toLowerCase()
    .replace(/[._]/g, " ").replace(/&/g, " and ").replace(/[-–—]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
const aliasIndex = (() => {
  const m = {};
  for (const c in TEAM_ALIASES) { m[norm(c)] = c; for (const a of TEAM_ALIASES[c]) m[norm(a)] = c; }
  return m;
})();
function canonTeam(t) {
  if (t == null) return "";
  const n = norm(t);
  if (aliasIndex[n]) return aliasIndex[n];
  for (const g of GROUP_KEYS) for (const tm of GROUPS[g]) if (norm(tm) === n) return tm;
  return String(t).trim();
}
const teamKey = (t) => norm(canonTeam(t));
const sameTeam = (a, b) => teamKey(a) === teamKey(b) && teamKey(a) !== "";
function normalizePrediction(pred) {
  if (!pred) return [];
  if (Array.isArray(pred)) return pred.slice(0, 4).map(canonTeam);
  return [1, 2, 3, 4].map((k) => pred[k]).filter(Boolean).map(canonTeam);
}
function playerGroupPred(p, g) {
  const src = (p && (p.groupPreds || p.groups || p.predictions || p.groupPredictions)) || {};
  return normalizePrediction(src[g]);
}
const matchTeams = (g, i) => { const arr = GROUPS[g] || []; const p = RR[i]; return p ? [arr[p[0]], arr[p[1]]] : [null, null]; };
const matchKey = (g, i) => g + "_" + i;
function matchResult(g, i, data) {
  const [home, away] = matchTeams(g, i);
  const raw = (data.groupResults || {})[matchKey(g, i)];
  if (!raw || raw.home == null || raw.away == null) return { home, away, complete: false };
  const hs = Number(raw.home), as = Number(raw.away);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return { home, away, complete: false };
  let winner = null, outcome = "draw";
  if (hs > as) { winner = home; outcome = "home"; }
  else if (as > hs) { winner = away; outcome = "away"; }
  return { home, away, hs, as, winner, outcome, complete: true };
}
const groupComplete = (g, data) => { for (let i = 0; i < 6; i++) if (!matchResult(g, i, data).complete) return false; return true; };
function computeGroupTable(g, data) {
  const row = {};
  const ensure = (t) => { const tm = canonTeam(t); const k = teamKey(tm); if (!row[k]) row[k] = { team: tm, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 }; return row[k]; };
  GROUPS[g].forEach(ensure);
  for (let i = 0; i < 6; i++) {
    const r = matchResult(g, i, data);
    if (!r.complete) continue;
    const H = ensure(r.home), A = ensure(r.away);
    H.P++; A.P++; H.GF += r.hs; H.GA += r.as; A.GF += r.as; A.GA += r.hs;
    if (r.hs > r.as) { H.W++; A.L++; H.Pts += 3; }
    else if (r.as > r.hs) { A.W++; H.L++; A.Pts += 3; }
    else { H.D++; A.D++; H.Pts++; A.Pts++; }
    H.GD = H.GF - H.GA; A.GD = A.GF - A.GA;
  }
  return Object.values(row).sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF || a.team.localeCompare(b.team));
}
function rankOfTeamInPred(p, g, team) { const arr = playerGroupPred(p, g); const i = arr.findIndex((x) => sameTeam(x, team)); return i < 0 ? 0 : i + 1; }
function predictedEdge(p, g, home, away) {
  const rh = rankOfTeamInPred(p, g, home), ra = rankOfTeamInPred(p, g, away);
  if (!rh && !ra) return { status: "none" };
  if (!rh || !ra) return { status: "missing" };
  if (rh === ra) return { status: "tie" };
  return { status: "ok", edge: rh < ra ? home : away };
}
function calcPlayerPoints(p, data) {
  const detail = { matches: [], ranking: [], knockout: [], champion: null };
  let gMatch = 0, gRank = 0, ko = 0, champ = 0;
  for (const g of GROUP_KEYS) {
    for (let i = 0; i < 6; i++) {
      const r = matchResult(g, i, data); if (!r.complete) continue;
      const e = predictedEdge(p, g, r.home, r.away);
      let got = 0;
      if (r.outcome !== "draw" && e.status === "ok" && sameTeam(e.edge, r.winner)) got = SCORING.edgeCorrect;
      gMatch += got;
      detail.matches.push({ g, i, ...r, got });
    }
    if (groupComplete(g, data)) {
      const table = computeGroupTable(g, data), pred = playerGroupPred(p, g);
      for (let pos = 0; pos < 4; pos++) {
        const actual = table[pos] ? table[pos].team : null, pick = pred[pos] || null;
        let got = 0, reason = "miss";
        if (pick && actual && sameTeam(pick, actual)) { got = SCORING.exactPosition; reason = "exact"; }
        else if (pick && table.some((rw) => sameTeam(rw.team, pick))) { got = SCORING.teamInGroupWrongPos; reason = "in_group"; }
        gRank += got;
        detail.ranking.push({ g, pos: pos + 1, pick, actual, got, reason });
      }
    }
  }
  const kr = data.knockoutResults || {}, kp = (p && p.knockout) || {};
  for (const mid in kr) {
    const actualW = kr[mid]; if (!actualW) continue;
    const round = (mid.split("_")[0] || "").toUpperCase();
    const got = kp[mid] && sameTeam(kp[mid], actualW) ? SCORING.knockout[round] || 0 : 0;
    ko += got;
    detail.knockout.push({ mid, round, predW: kp[mid] || null, actualW, got });
  }
  if (data.champion) { const got = p && sameTeam(p.champion, data.champion) ? SCORING.champion : 0; champ = got; detail.champion = { pick: p && p.champion, actual: data.champion, got }; }
  return { total: gMatch + gRank + ko + champ, groupMatch: gMatch, groupRank: gRank, knockout: ko, champ, detail };
}
function buildLeaderboard(data) {
  const rows = Object.keys(data.players).map((name) => ({ name, ...calcPlayerPoints(data.players[name], data) }));
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
function currentPhase(data) {
  if (data.champion) return "phase_done";
  if (Object.keys(data.knockoutResults || {}).length) return "phase_ko";
  let any = false; for (const g of GROUP_KEYS) for (let i = 0; i < 6; i++) if (matchResult(g, i, data).complete) any = true;
  return any ? "phase_group" : "phase_pre";
}
function completedCount(data) { let n = 0; for (const g of GROUP_KEYS) for (let i = 0; i < 6; i++) if (matchResult(g, i, data).complete) n++; return n; }

/* ---------------- 4. Bracket derivation -------------------------------- */
const KO_ROUNDS = [["R32", 16], ["R16", 8], ["QF", 4], ["SF", 2], ["F", 1]];
function buildBracket(data) {
  if (!GROUP_KEYS.every((g) => groupComplete(g, data))) return null;
  const tables = {}; GROUP_KEYS.forEach((g) => (tables[g] = computeGroupTable(g, data)));
  const winners = GROUP_KEYS.map((g) => tables[g][0].team);
  const runners = GROUP_KEYS.map((g) => tables[g][1].team);
  const thirds = GROUP_KEYS.map((g) => ({ ...tables[g][2], g }))
    .sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF).slice(0, 8).map((x) => x.team);
  const pool = [...winners, ...runners, ...thirds]; // 32, illustrative sequential pairing
  const rounds = [];
  let prevWinners = null;
  for (const [rk, n] of KO_ROUNDS) {
    const ties = [];
    for (let k = 0; k < n; k++) {
      let home, away;
      if (rk === "R32") { home = pool[2 * k]; away = pool[2 * k + 1]; }
      else { home = prevWinners ? prevWinners[2 * k] : null; away = prevWinners ? prevWinners[2 * k + 1] : null; }
      const winner = (data.knockoutResults || {})[`${rk}_${k}`] || null;
      ties.push({ mid: `${rk}_${k}`, home, away, winner });
    }
    rounds.push({ round: rk, ties });
    prevWinners = ties.map((t) => t.winner);
  }
  return rounds;
}

/* ---------------- 4b. Helpers for additional views --------------------- */
// Tally a pick across all players → [{key,label,team,count}], sorted desc.
function consensusTally(players, getter) {
  const c = {};
  Object.keys(players).forEach((name) => {
    const v = getter(players[name]); if (!v) return;
    const k = teamKey(v); if (!k) return;
    if (!c[k]) c[k] = { team: canonTeam(v), count: 0 };
    c[k].count++;
  });
  return Object.values(c).sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));
}
// Full fixture list with synthetic group-stage matchdays.
function buildSchedule(data) {
  const ROUND = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 }; // RR idx → matchday
  const list = [];
  GROUP_KEYS.forEach((g) => {
    for (let i = 0; i < 6; i++) {
      const r = matchResult(g, i, data);
      list.push({ g, i, md: ROUND[i], ...r });
    }
  });
  return list;
}
// Cumulative points per player across the tournament timeline.
function pointsTimeline(data) {
  const names = Object.keys(data.players);
  const stage = (label, rrIdx, koRounds) => {
    const gr = {};
    GROUP_KEYS.forEach((g) => { for (let i = 0; i < 6; i++) if (rrIdx.includes(i)) gr[matchKey(g, i)] = data.groupResults[matchKey(g, i)]; });
    const kr = {};
    Object.keys(data.knockoutResults).forEach((mid) => { if (koRounds.includes(mid.split("_")[0])) kr[mid] = data.knockoutResults[mid]; });
    const snap = { ...data, groupResults: gr, knockoutResults: kr, champion: null };
    const row = { stage: label };
    names.forEach((n) => (row[n] = calcPlayerPoints(data.players[n], snap).total));
    return row;
  };
  return [
    stage("MD1", [0, 1], []),
    stage("MD2", [0, 1, 2, 3], []),
    stage("MD3", [0, 1, 2, 3, 4, 5], []),
    stage("R32", [0, 1, 2, 3, 4, 5], ["R32"]),
    stage("R16", [0, 1, 2, 3, 4, 5], ["R32", "R16"]),
  ];
}
// Top scoring teams (computed from real group GF in the sample data).
function topScoringTeams(data, n = 8) {
  const acc = {};
  GROUP_KEYS.forEach((g) => computeGroupTable(g, data).forEach((r) => { acc[r.team] = { team: r.team, gf: r.GF, group: g }; }));
  return Object.values(acc).sort((a, b) => b.gf - a.gf || a.team.localeCompare(b.team)).slice(0, n);
}
const LINE_COLORS = ["#19c37d", "#f5c451", "#5b8def", "#e2574c", "#9b7ede", "#2bb3a3", "#e8a23b", "#d6649a"];

// --- match-center helpers ---
const DAY = 864e5;
// The league runs on a fixed display timezone (UAE by default, like the legacy
// app), NOT the device's timezone — so a phone set to e.g. UTC+3:30 still sees
// the official kickoff times. Configurable via settings.tz.
let APP_TZ = "Asia/Dubai";
function setAppTz(tz) { if (tz && typeof tz === "string") APP_TZ = tz; }
function getAppTz() { return APP_TZ; }
// Offset (ms) of APP_TZ from UTC at a given instant.
function tzOffsetMs(ms) {
  const d = new Date(ms);
  return new Date(d.toLocaleString("en-US", { timeZone: APP_TZ })).getTime() - new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
}
// Day key = midnight in APP_TZ (as a UTC instant), so fixtures group under the
// official local day.
const dayKey = (ms) => { const off = tzOffsetMs(ms); return Math.floor((ms + off) / DAY) * DAY - off; };
const fmtTime = (ms, lang) => new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: APP_TZ }).format(new Date(ms));
function fmtDay(ms, lang) {
  const today = dayKey(nowMs()), d = dayKey(ms);
  if (d === today) return lang === "ar" ? "اليوم" : "Today";
  if (d === today + DAY) return lang === "ar" ? "غداً" : "Tomorrow";
  if (d === today - DAY) return lang === "ar" ? "أمس" : "Yesterday";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: APP_TZ }).format(new Date(ms));
}
const matchesOnDay = (data, d) => (data.matches || []).filter((m) => dayKey(m.ko) === d).sort((a, b) => a.ko - b.ko);
const matchDays = (data) => [...new Set((data.matches || []).map((m) => dayKey(m.ko)))].sort((a, b) => a - b);
const liveMatches = (data) => (data.matches || []).filter((m) => m.status === "live");
const recentResults = (data, n = 6) => (data.matches || []).filter((m) => m.status === "finished").sort((a, b) => b.ko - a.ko).slice(0, n);
function matchPredictionTally(data, m) {
  const rows = Object.keys(data.players).map((name) => {
    const p = data.players[name];
    let backed = null, got = 0;
    if (m.stage === "group") {
      const e = predictedEdge(p, m.group, m.home, m.away);
      backed = e.status === "ok" ? canonTeam(e.edge) : null;
      if (m.status === "finished") {
        const winner = m.finalH > m.finalA ? m.home : m.finalA > m.finalH ? m.away : null;
        got = winner && backed && sameTeam(backed, winner) ? SCORING.edgeCorrect : 0;
      }
    } else {
      backed = p.knockout[m.mid] || null;
      if (m.status === "finished") { const w = data.knockoutResults[m.mid]; got = backed && w && sameTeam(backed, w) ? SCORING.knockout[m.round] || 0 : 0; }
    }
    return { name, backed, got };
  });
  return { home: rows.filter((r) => r.backed && sameTeam(r.backed, m.home)).length, away: rows.filter((r) => r.backed && sameTeam(r.backed, m.away)).length, rows };
}
// Potential points from matches currently in progress (display-only until FT).
function livePendingPoints(data, p) {
  let pts = 0; const items = [];
  (data.matches || []).filter((m) => m.status === "live").forEach((m) => {
    const leader = m.hs > m.as ? m.home : m.as > m.hs ? m.away : null;
    if (!leader) return;
    if (m.stage === "group") {
      const e = predictedEdge(p, m.group, m.home, m.away);
      if (e.status === "ok" && sameTeam(e.edge, leader)) { pts += SCORING.edgeCorrect; items.push({ m, pick: e.edge, val: SCORING.edgeCorrect }); }
    } else {
      const pick = p.knockout[m.mid];
      if (pick && sameTeam(pick, leader)) { const v = SCORING.knockout[m.round] || 0; pts += v; items.push({ m, pick, val: v }); }
    }
  });
  return { pts, items };
}
// Re-derive the whole live view from the static fixture skeleton + the
// current clock. Each non-admin match's status/score/events are revealed
// from its predetermined full-time data as time passes, then the engine
// inputs (group/knockout results + champion) are derived from whatever is
// finished "now". Admin-locked matches keep their manually entered result.
function recomputeLive(data, now = nowMs()) {
  const matches = (data.matches || []).map((m) => {
    if (m.adminLocked) return m; // manual result is fixed
    if (m.real) {
      // Real fixtures: a recorded final score means finished; otherwise status
      // is purely time-based. Live in-progress scores arrive with TheSportsDB.
      const hasRes = m.finalH != null && m.finalA != null;
      if (hasRes) return { ...m, status: "finished", minute: 90, ht: false, hs: m.finalH, as: m.finalA, events: [], stats: null };
      // No recorded result yet: a real match is NEVER "finished" without a score
      // (full-time is decided by the result, not the clock). Before kickoff it is
      // scheduled; after kickoff it is in-progress until the result lands.
      const st = statusOf(m.ko, now);
      if (st.status === "scheduled") return { ...m, status: "scheduled", minute: 0, ht: false, hs: null, as: null, events: [], stats: null };
      const lv = (data._live || {})[m.id];
      // No live-feed entry and well past the kickoff window → the match is over,
      // we just don't have its score yet (so it stops showing under "Live now").
      if (!lv && now - m.ko > LIVE_WINDOW_MS) return { ...m, status: "finished", minute: 90, ht: false, hs: null, as: null, noScore: true, events: [], stats: null };
      return { ...m, status: "live", minute: lv && lv.minute != null ? lv.minute : Math.min(90, st.minute || 90), ht: lv ? !!lv.ht : !!st.ht, hs: lv ? lv.hs : null, as: lv ? lv.as : null, events: [], stats: null };
    }
    const st = statusOf(m.ko, now);
    if (st.status === "scheduled") return { ...m, ...st, events: [], hs: null, as: null, stats: null };
    if (st.status === "finished") return { ...m, ...st, events: m.allEvents, hs: m.finalH, as: m.finalA, stats: m.allStats };
    const events = m.allEvents.filter((e) => e.min <= st.minute);
    return { ...m, ...st, events, hs: goalsBy(events, "home"), as: goalsBy(events, "away"), stats: scaleStats(m.allStats, st.minute) };
  });
  const groupResults = {}, knockoutResults = {};
  matches.forEach((m) => {
    if (m.status !== "finished" || m.finalH == null || m.finalA == null) return; // skip score-less "over" matches
    if (m.stage === "group") groupResults[matchKey(m.group, m.idx)] = { home: m.finalH, away: m.finalA };
    else knockoutResults[m.mid] = m.finalH > m.finalA ? canonTeam(m.home) : m.finalA > m.finalH ? canonTeam(m.away) : canonTeam(m.home);
  });
  // champion: admin override wins; otherwise the finished Final's winner.
  let champion = data.championOverride || null;
  if (!champion) { const f = matches.find((m) => m.stage === "ko" && m.round === "F" && m.status === "finished"); if (f) champion = f.finalH >= f.finalA ? canonTeam(f.home) : canonTeam(f.away); }
  return { ...data, matches, groupResults, knockoutResults, champion };
}
// Map TheSportsDB live events to fixtures by canonical team names (handles
// home/away orientation), returning { matchKey: {hs, as, minute, ht} } — the
// in-progress, display-only scores recomputeLive applies to live matches.
function mapLiveEvents(events) {
  const map = {};
  (events || []).forEach((e) => {
    const hs = e.homeScore, as = e.awayScore;
    if (hs == null || as == null || hs === "" || as === "") return;
    for (const g of GROUP_KEYS) {
      for (let i = 0; i < RR.length; i++) {
        const [h, a] = matchTeams(g, i);
        const direct = sameTeam(e.home, h) && sameTeam(e.away, a);
        const rev = sameTeam(e.home, a) && sameTeam(e.away, h);
        if (!direct && !rev) continue;
        const min = parseInt(e.minute, 10);
        map[matchKey(g, i)] = { hs: rev ? Number(as) : Number(hs), as: rev ? Number(hs) : Number(as), minute: Number.isFinite(min) ? min : null, ht: /ht|half/i.test(String(e.status)) };
        return;
      }
    }
  });
  return map;
}
// Map the Supabase blob + merged results into engine data. Fixtures are paired
// by the canonical round-robin order (the authoritative pairing — the schedule's
// own keys can be inconsistent); the real schedule is matched BY TEAMS to recover
// kickoff time/venue, and group results (keyed by canonical matchKey) are applied
// in canonical home/away orientation.
// Resolve a played fixture (by its stored home/away teams) to the canonical RR
// fixture, returning the matchKey and whether the stored orientation is reversed.
function resolveRRByTeams(group, home, away) {
  const groups = group && GROUPS[group] ? [group] : GROUP_KEYS;
  for (const g of groups) {
    for (let i = 0; i < 6; i++) {
      const [mh, ma] = matchTeams(g, i);
      if (sameTeam(mh, home) && sameTeam(ma, away)) return { key: matchKey(g, i), reversed: false };
      if (sameTeam(mh, away) && sameTeam(ma, home)) return { key: matchKey(g, i), reversed: true };
    }
  }
  return null;
}
function mapBlobToData(blob, resultRows, apiResults) {
  blob = blob || {};
  // groupResults keyed by canonical RR matchKey. Start from the blob fallback,
  // then overlay the normalized table re-resolved BY TEAMS and oriented to the
  // canonical home/away (mirrors the legacy app's normalizedResultToApp).
  const groupResults = { ...(blob.groupResults || {}) };
  (resultRows || []).forEach((r) => {
    if (!r || r.status !== "final" || r.home_score == null || r.away_score == null) return;
    let key, hs = r.home_score, as = r.away_score;
    const m = r.home_team && r.away_team ? resolveRRByTeams(r.group_key, r.home_team, r.away_team) : null;
    if (m) { key = m.key; if (m.reversed) { const t = hs; hs = as; as = t; } }
    else key = r.match_key || `${r.group_key}_${r.match_idx}`;
    if (key) groupResults[key] = { home: String(hs), away: String(as) };
  });
  // TheSportsDB completed-results fallback (team-resolved + oriented), applied
  // only where the DB has no result and the fixture has already kicked off.
  const apiMap = {};
  (apiResults || []).forEach((r) => {
    if (r.homeScore == null || r.awayScore == null) return;
    const m = resolveRRByTeams(null, r.home, r.away); if (!m) return;
    let hs = r.homeScore, as = r.awayScore; if (m.reversed) { const t = hs; hs = as; as = t; }
    apiMap[m.key] = { home: String(hs), away: String(as) };
  });
  const players = {};
  Object.entries(blob.players || {}).forEach(([name, p]) => {
    players[name] = { groupPreds: p.groupPreds || p.predictions || p.groups || {}, champion: p.champion == null ? null : p.champion, knockout: p.knockoutPreds || p.knockout || {}, meta: p.meta };
  });
  const sched = blob.scheduleMatches || [];
  const findSched = (home, away) => sched.find((s) => s && ((sameTeam(s.home, home) && sameTeam(s.away, away)) || (sameTeam(s.home, away) && sameTeam(s.away, home))));
  const matches = [];
  const now = Date.now();
  for (const g of GROUP_KEYS) {
    for (let i = 0; i < 6; i++) {
      const [home, away] = matchTeams(g, i);
      const key = matchKey(g, i);
      const s = findSched(home, away);
      const ko = s ? Date.parse(s.kickoffUtc || s.date) || 0 : 0;
      let res = groupResults[key];
      let hasRes = res && res.home != null && res.home !== "" && res.away != null && res.away !== "";
      // DB has no result yet → fall back to the API feed, but only once the
      // fixture has actually kicked off (guards bogus finals for future games).
      if (!hasRes && apiMap[key] && ko && ko <= now) { res = apiMap[key]; groupResults[key] = res; hasRes = true; }
      matches.push({ id: key, stage: "group", group: g, idx: i, mid: null, home, away, venue: s ? s.venue || "" : "", ko, real: true, eventId: s ? s.eventId || null : null, finalH: hasRes ? Number(res.home) : null, finalA: hasRes ? Number(res.away) : null, allEvents: [], allStats: null, lineups: null });
    }
  }
  const km = blob.knockoutMatches;
  const koList = Array.isArray(km) ? km : km && typeof km === "object" ? Object.values(km) : [];
  koList.forEach((s, i) => {
    if (!s || !(s.home || s.away)) return;
    const mid = s.mid || s.key || `${s.round || "KO"}_${i}`;
    matches.push({ id: mid, stage: "ko", group: null, idx: i, mid, round: s.round || (mid.split("_")[0] || "KO"), home: s.home, away: s.away, venue: s.venue || "", ko: Date.parse(s.kickoffUtc || s.date) || 0, real: true, finalH: s.home_score != null ? Number(s.home_score) : null, finalA: s.away_score != null ? Number(s.away_score) : null, allEvents: [], allStats: null, lineups: null });
  });
  matches.sort((a, b) => a.ko - b.ko);
  return { players, groupResults: { ...groupResults }, knockoutResults: { ...(blob.knockoutResults || {}) }, champion: blob.champion || null, championOverride: blob.champion || null, settings: blob.settings || { currency: "AED" }, auditLog: Array.isArray(blob.auditLog) ? blob.auditLog : [], matches, real: true, _blob: blob };
}
function applyAdminScore(m, h, a) {
  const seed = hashStr(m.id + ":" + h + ":" + a);
  const allEvents = genEvents(seed, h, a, m.lineups.home, m.lineups.away, null);
  const allStats = genStats(seed, h, a);
  return { ...m, adminLocked: true, status: "finished", minute: 90, ht: false, finalH: h, finalA: a, hs: h, as: a, allEvents, allStats, events: allEvents, stats: allStats };
}

/* ---------------- 5. Seeded sample data -------------------------------- */
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function shuffle(arr, seed) { const r = mulberry(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/* ---- live clock ------------------------------------------------------
   The sample tournament runs on a fixed fictional schedule. We anchor the
   tournament's "now" to a rich moment (group stage done, knockouts under
   way) when the app loads, then advance it in real time 1:1 so live matches
   actually tick, fixtures kick off, and results reveal on their own. This is
   the exact behaviour the production TheSportsDB layer will drive; swapping
   in real fixtures means feeding real kickoff/score data through the same
   recomputeLive() path. nowMs() is the single source of "now". */
// LIVE_MODE flips to true once real Supabase data loads; the clock then runs on
// the real wall clock against real fixture kickoffs. In demo (sample) mode it
// runs on an accelerated synthetic anchor so the demo tournament looks alive.
let LIVE_MODE = false;
function setLiveMode(v) { LIVE_MODE = v; }
// Persist an admin mutation back to Supabase (live mode only); best-effort.
function persistLive(nextData) { if (LIVE_MODE) saveBlob(nextData).catch((e) => console.warn("Supabase save failed", e && e.message)); }
// A match is only "live" for this long after kickoff when we have no score for
// it; past that it's treated as finished (over) rather than perpetually live.
const LIVE_WINDOW_MS = 140 * 60000;
const TOURNAMENT_ANCHOR = Date.UTC(2026, 5, 30, 19, 30);
const APP_LOADED_AT = Date.now();
let CLOCK = TOURNAMENT_ANCHOR;
function nowMs() { return LIVE_MODE ? Date.now() : CLOCK; }
function tickClock() { if (!LIVE_MODE) CLOCK = TOURNAMENT_ANCHOR + (Date.now() - APP_LOADED_AT); return nowMs(); }
const groupOf = (team) => GROUP_KEYS.find((g) => GROUPS[g].some((x) => sameTeam(x, team))) || null;
// Knockout kickoff times: each round starts 5 days after the previous; R32
// begins at the anchor day so a few are already live/finished on load.
const KO_START = Date.UTC(2026, 5, 30, 16, 0);
const koTime = (roundIdx, k) => KO_START + roundIdx * 5 * DAY + Math.floor(k / 4) * DAY + (k % 4) * 2.2 * 36e5;
// Scale counting stats by elapsed fraction so a live match's numbers grow.
function scaleStats(s, minute) {
  if (!s) return s;
  const f = Math.min(1, Math.max(0.05, minute / 90)), sc = (v) => Math.round(v * f);
  return { possession: s.possession, shots: s.shots.map(sc), sot: s.sot.map(sc), corners: s.corners.map(sc), fouls: s.fouls.map(sc), offsides: s.offsides.map(sc) };
}

// --- squads (synthetic but deterministic) ---
const FIRST_I = "ABCDEFGHIJKLMNOPRSTV".split("");
const SURNAMES = ["Silva", "Müller", "Rossi", "Khan", "Diallo", "Tanaka", "Park", "Nowak", "Costa", "Hassan", "Lopez", "Vidic", "Berg", "Haaki", "Mbeki", "Suarez", "Ali", "Ferro", "Jansen", "Okafor", "Petrov", "Reyes", "Sato", "Demir", "Novak", "Walsh", "Ahmadi", "Mensah", "Vega", "Holt", "Bauer", "Conti", "Faye", "Ito", "Kimura", "Sosa", "Traore", "Yilmaz", "Bjorn", "Cruz"];
const FORMATION = "4-3-3";
const POS_LAYOUT = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD", "GK", "DEF", "DEF", "MID", "MID", "FWD", "FWD"];
function squadFor(team) {
  const r = mulberry(hashStr(team + "sqd"));
  const used = new Set();
  return POS_LAYOUT.map((pos, i) => {
    let nm; do { nm = FIRST_I[Math.floor(r() * FIRST_I.length)] + ". " + SURNAMES[Math.floor(r() * SURNAMES.length)]; } while (used.has(nm) && used.size < SURNAMES.length);
    used.add(nm);
    return { num: i + 1, name: nm, pos, start: i < 11 };
  });
}
function statusOf(ko, now = nowMs()) {
  if (now < ko) return { status: "scheduled", minute: 0 };
  const el = (now - ko) / 60000;
  if (el < 105) {
    const ht = el >= 45 && el < 60;
    const minute = el < 45 ? Math.max(1, Math.floor(el)) : el < 60 ? 45 : Math.min(90, Math.floor(el) - 15);
    return { status: "live", minute, ht };
  }
  return { status: "finished", minute: 90 };
}
function genEvents(seed, hs, as, sqH, sqA, capMin) {
  const r = mulberry(seed);
  const att = (sq) => sq.filter((p) => p.pos === "FWD" || p.pos === "MID");
  const ev = [];
  const goalMins = (n) => { const m = []; for (let i = 0; i < n; i++) m.push(2 + Math.floor(r() * 88)); return m.sort((a, b) => a - b); };
  goalMins(hs).forEach((min) => { const sc = att(sqH)[Math.floor(r() * att(sqH).length)]; ev.push({ min, side: "home", type: "goal", player: sc.name }); });
  goalMins(as).forEach((min) => { const sc = att(sqA)[Math.floor(r() * att(sqA).length)]; ev.push({ min, side: "away", type: "goal", player: sc.name }); });
  // a few cards
  const cards = Math.floor(r() * 4);
  for (let i = 0; i < cards; i++) { const side = r() < 0.5 ? "home" : "away"; const sq = side === "home" ? sqH : sqA; ev.push({ min: 20 + Math.floor(r() * 70), side, type: r() < 0.12 ? "red" : "yellow", player: sq[Math.floor(r() * sq.length)].name }); }
  ev.sort((a, b) => a.min - b.min);
  return capMin != null ? ev.filter((e) => e.min <= capMin) : ev;
}
function genStats(seed, hs, as) {
  const r = mulberry(seed);
  const posH = 38 + Math.floor(r() * 24);
  return {
    possession: [posH, 100 - posH],
    shots: [8 + Math.floor(r() * 11), 6 + Math.floor(r() * 10)],
    sot: [Math.max(hs, 2 + Math.floor(r() * 5)), Math.max(as, 1 + Math.floor(r() * 4))],
    corners: [2 + Math.floor(r() * 8), 1 + Math.floor(r() * 7)],
    fouls: [6 + Math.floor(r() * 10), 6 + Math.floor(r() * 10)],
    offsides: [Math.floor(r() * 4), Math.floor(r() * 4)],
  };
}
const goalsBy = (ev, side) => ev.filter((e) => e.type === "goal" && e.side === side).length;
const groupKO = (gi, idx) => {
  const md = idx < 2 ? 0 : idx < 4 ? 1 : 2;
  const day = md * 5 + (gi % 5);
  return Date.UTC(2026, 5, 11, 12, 0) + day * 864e5 + (gi % 3) * 3 * 36e5 + (idx % 2) * 2 * 36e5;
};
function buildSampleData() {
  const names = ["Ahmed", "Sara", "Yousef", "Lina", "Omar", "Maya", "Khalid", "Nora", "Tariq", "Hana"];
  const champPool = ["Brazil", "France", "Argentina", "Spain", "England", "Germany", "Portugal", "Netherlands"];
  const players = {};
  names.forEach((name) => {
    const groupPreds = {};
    GROUP_KEYS.forEach((g) => (groupPreds[g] = shuffle(GROUPS[g], hashStr(name + g))));
    players[name] = { groupPreds, champion: shuffle(champPool, hashStr(name + "champ"))[0], knockout: {} };
  });
  // squads
  const squads = {};
  GROUP_KEYS.forEach((g) => GROUPS[g].forEach((tm) => (squads[teamKey(tm)] = squadFor(tm))));
  const squadOf = (tm) => squads[teamKey(tm)] || squadFor(tm);

  // Build a static fixture skeleton: every match carries its predetermined
  // full-time score + full timeline/stats/lineups. recomputeLive() reveals
  // them over the real clock. No time-dependent state is stored here.
  const mkMatch = (base, home, away, finalH, finalA, seedKey) => ({
    ...base, home, away, finalH, finalA,
    allEvents: genEvents(hashStr(seedKey + "ev"), finalH, finalA, squadOf(home), squadOf(away), null),
    allStats: genStats(hashStr(seedKey + "st"), finalH, finalA),
    lineups: { home: squadOf(home), away: squadOf(away), formation: FORMATION },
  });

  // --- group-stage matches ---
  const matches = [];
  const finalGroupResults = {};
  GROUP_KEYS.forEach((g, gi) => {
    for (let i = 0; i < 6; i++) {
      const [home, away] = matchTeams(g, i);
      const rr = mulberry(hashStr(g + "_" + i + "_res"));
      const [hI, aI] = RR[i];
      const finalH = Math.floor(rr() * 3) + (hI < 2 ? 1 : 0);
      const finalA = Math.floor(rr() * 3) + (aI < 2 ? 1 : 0);
      finalGroupResults[matchKey(g, i)] = { home: finalH, away: finalA };
      matches.push(mkMatch(
        { id: "G_" + g + "_" + i, stage: "group", group: g, idx: i, mid: null, ko: groupKO(gi, i) },
        home, away, finalH, finalA, g + i));
    }
  });

  // --- full knockout tree, deterministically resolved from final standings ---
  // Seeding pool: 12 group winners, 12 runners-up, 8 best third-placed teams.
  const finalData = { groupResults: finalGroupResults };
  const tables = {}; GROUP_KEYS.forEach((g) => (tables[g] = computeGroupTable(g, finalData)));
  const strength = {};
  GROUP_KEYS.forEach((g) => tables[g].forEach((row, pos) => (strength[teamKey(row.team)] = row.Pts * 100 + row.GD * 10 + row.GF - pos)));
  const winners = GROUP_KEYS.map((g) => tables[g][0].team);
  const runners = GROUP_KEYS.map((g) => tables[g][1].team);
  const thirds = GROUP_KEYS.map((g) => ({ ...tables[g][2], g }))
    .sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF).slice(0, 8).map((x) => x.team);
  let roundTeams = [...winners, ...runners, ...thirds]; // 32
  KO_ROUNDS.forEach(([rk, n], ri) => {
    const next = [];
    for (let k = 0; k < n; k++) {
      const home = roundTeams[2 * k], away = roundTeams[2 * k + 1];
      const sh = strength[teamKey(home)] || 0, sa = strength[teamKey(away)] || 0;
      const homeWins = sh !== sa ? sh > sa : hashStr(home + away + rk) % 2 === 0;
      const finalH = homeWins ? 2 : 1, finalA = homeWins ? 1 : 2;
      matches.push(mkMatch(
        { id: `${rk}_${k}`, stage: "ko", group: null, idx: k, mid: `${rk}_${k}`, round: rk, ko: koTime(ri, k) },
        home, away, finalH, finalA, rk + k));
      next.push(homeWins ? home : away);
    }
    roundTeams = next;
  });

  // --- players' knockout picks: back the team they ranked higher in its group ---
  const koPick = (p, home, away) => {
    const gh = groupOf(home), ga = groupOf(away);
    const rh = gh ? rankOfTeamInPred(p, gh, home) || 9 : 9;
    const ra = ga ? rankOfTeamInPred(p, ga, away) || 9 : 9;
    return rh <= ra ? canonTeam(home) : canonTeam(away);
  };
  matches.filter((m) => m.stage === "ko").forEach((m) => { Object.values(players).forEach((p) => (p.knockout[m.mid] = koPick(p, m.home, m.away))); });

  matches.sort((a, b) => a.ko - b.ko);
  const data = { players, matches, championOverride: null, settings: { currency: "AED", entryFeeAED: 200, distribution: "winnerTakesAll" }, auditLog: [] };
  return recomputeLive(data, nowMs());
}

/* ---------------- 6. Small UI primitives ------------------------------- */
// SVG line-icon set ported verbatim from the original app's svgIcon().
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h5v-5h4v5h5v-9.5"/>',
  trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 12v4"/><path d="M9 20h6"/><path d="M10 16h4"/>',
  profile: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  groups: '<path d="M5 6h14"/><path d="M5 12h14"/><path d="M5 18h14"/><path d="M8 4v16"/><path d="M16 4v16"/>',
  menu: '<path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="5"/><rect x="12" y="8" width="3" height="8"/><rect x="17" y="13" width="3" height="3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M4 10h16"/>',
  ball: '<circle cx="12" cy="12" r="8"/><path d="m12 8 3 2-1 4h-4l-1-4 3-2Z"/><path d="M12 8V4"/><path d="M15 10l4-1"/><path d="M14 14l2 4"/><path d="M10 14l-2 4"/><path d="M9 10 5 9"/>',
  prediction: '<path d="M5 19h14"/><path d="M7 16l3-3 3 2 4-6"/><path d="M17 9h-4"/><path d="M17 9v4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15 6.5a3 3 0 0 1 0 5"/><path d="M17 15a5 5 0 0 1 3.5 4"/>',
  bracket: '<path d="M6 5h5v5H6z"/><path d="M6 14h5v5H6z"/><path d="M14 9.5h4v5h-4z"/><path d="M11 7.5h2v4.5h1"/><path d="M11 16.5h2V12h1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.3 1-1.3 1.9"/><path d="M12 17h.01"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 7.5l3 3"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  backup: '<path d="M5 5h11l3 3v11H5V5Z"/><path d="M8 5v5h8"/><path d="M8 19v-5h8v5"/>',
  health: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"/><path d="M8 12h2l1-2 2 5 1-3h2"/>',
  sync: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M18 12a6 6 0 0 0-10-4.5L4 12"/><path d="M6 12a6 6 0 0 0 10 4.5L20 12"/>',
  tools: '<path d="M14.5 5.5a4 4 0 0 0 4 4L9 19l-4-4 9.5-9.5Z"/><path d="m5 15 4 4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.04.04-2.1 2.1-.04-.04a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.66V20h-3v-.06A1.8 1.8 0 0 0 10.4 18.3a1.8 1.8 0 0 0-2 .36l-.04.04-2.1-2.1.04-.04a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 5 13.5H4v-3h1a1.8 1.8 0 0 0 1.66-1.1 1.8 1.8 0 0 0-.36-2l-.04-.04 2.1-2.1.04.04a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 11.5 4h3a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 2-.36l.04-.04 2.1 2.1-.04.04a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 21 10.5v3h-1a1.8 1.8 0 0 0-.6 1.5Z"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  logout: '<path d="M10 6H6v12h4"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/>',
};
function Ico({ name, size = 22 }) {
  return <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.ball }} />;
}
function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); setR(m.matches); const h = () => setR(m.matches); m.addEventListener?.("change", h); return () => m.removeEventListener?.("change", h); }, []);
  return r;
}
function CountUp({ value, dur = 900 }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);
  const ref = useRef();
  useEffect(() => {
    if (reduce) { setN(value); return; }
    const start = performance.now(), from = 0;
    cancelAnimationFrame(ref.current);
    const tick = (t) => { const k = Math.min(1, (t - start) / dur); const e = 1 - Math.pow(1 - k, 3); setN(Math.round(from + (value - from) * e)); if (k < 1) ref.current = requestAnimationFrame(tick); };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value, dur, reduce]);
  return <span className="num">{n}</span>;
}
const flagOf = (t) => TEAM_FLAGS[canonTeam(t)] || "🏳️";
function Team({ t, dim }) {
  if (!t) return <span className="team muted">— —</span>;
  return <span className={"team" + (dim ? " dim" : "")}><span className="fl">{flagOf(t)}</span><span className="tn">{canonTeam(t)}</span></span>;
}
function Avatar({ name }) {
  const h = hashStr(name || "x"), hue = h % 360;
  const init = (name || "").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  return <span className="ava" style={{ background: `linear-gradient(135deg,hsl(${hue} 55% 38%),hsl(${(hue + 40) % 360} 55% 28%))` }}>{init}</span>;
}
function Movement({ d }) {
  if (!d || d === 0) return <span className="mv eq">–</span>;
  return <span className={"mv " + (d > 0 ? "up" : "dn")}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}</span>;
}

/* ---------------- 7. Diagrams ----------------------------------------- */
/* Animated horizontal bar leaderboard */
function LeaderboardBars({ lb, prevRanks, t, onPick }) {
  const max = Math.max(1, lb[0]?.total || 1);
  const [grow, setGrow] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrow(true)); return () => cancelAnimationFrame(id); }, [lb]);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="lb">
      {lb.map((r, i) => {
        const move = prevRanks ? prevRanks[r.name] - r.rank : 0;
        return (
          <button className={"lbrow" + (r.rank === 1 ? " first" : "")} key={r.name} onClick={() => onPick(r.name)} style={{ animationDelay: `${i * 45}ms` }}>
            <span className="lbrank">{r.rank <= 3 ? medals[r.rank - 1] : <span className="num">{r.rank}</span>}</span>
            <span className="lbava"><Avatar name={r.name} /></span>
            <span className="lbmain">
              <span className="lbname">{r.name} <Movement d={move} /></span>
              <span className="lbtrack"><span className="lbfill" style={{ width: grow ? `${(r.total / max) * 100}%` : 0 }} /></span>
            </span>
            <span className="lbpts num">{r.total}</span>
          </button>
        );
      })}
    </div>
  );
}
/* Animated group standings */
function GroupCard({ g, data, t, delay }) {
  const table = useMemo(() => computeGroupTable(g, data), [g, data]);
  const maxPts = Math.max(1, ...table.map((r) => r.Pts));
  const [grow, setGrow] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrow(true)); return () => cancelAnimationFrame(id); }, [g, data]);
  return (
    <div className="card gcard" style={{ animationDelay: `${delay}ms` }}>
      <div className="gtitle"><span className="gbadge">{t("group")} {g}</span></div>
      <div className="grows">
        {table.map((r, i) => (
          <div className={"grow" + (i < 2 ? " qual" : "")} key={r.team}>
            <span className="gpos num">{i + 1}</span>
            <span className="gteam"><Team t={r.team} /></span>
            <span className="gbar"><span className="gbarfill" style={{ width: grow ? `${(r.Pts / maxPts) * 100}%` : 0 }} /></span>
            <span className="gpts num">{r.Pts}</span>
          </div>
        ))}
      </div>
      <div className="gstat"><span>{t("P")}</span><span>{t("W")}</span><span>{t("D")}</span><span>{t("L")}</span><span>{t("GD")}</span></div>
      {table.map((r) => (
        <div className="gstatrow" key={r.team + "s"}>
          <span className="num">{r.P}</span><span className="num">{r.W}</span><span className="num">{r.D}</span><span className="num">{r.L}</span>
          <span className={"num " + (r.GD > 0 ? "pos" : r.GD < 0 ? "neg" : "")}>{r.GD > 0 ? "+" : ""}{r.GD}</span>
        </div>
      ))}
    </div>
  );
}
/* Animated knockout bracket */
function Bracket({ data, t }) {
  const rounds = useMemo(() => buildBracket(data), [data]);
  const reduce = useReducedMotion();
  if (!rounds) return <div className="card empty">{t("brkFills")}</div>;
  return (
    <div className="brk-scroll">
      <div className="brk">
        {rounds.map((rd, ri) => (
          <div className="brk-col" key={rd.round} style={{ gap: `${Math.max(8, ri * 18 + 8)}px` }}>
            <div className="brk-rlabel">{t("r_" + rd.round)}</div>
            {rd.ties.map((tie, ti) => {
              const decided = !!tie.winner;
              return (
                <div className={"brk-tie" + (decided ? " decided" : "")} key={tie.mid}
                  style={{ animation: reduce ? "none" : `tieIn .5s ease both`, animationDelay: `${ri * 220 + ti * 40}ms` }}>
                  <div className={"brk-slot" + (tie.winner && sameTeam(tie.winner, tie.home) ? " win" : tie.winner ? " lose" : "")}><Team t={tie.home} dim={!tie.home} /></div>
                  <div className={"brk-slot" + (tie.winner && sameTeam(tie.winner, tie.away) ? " win" : tie.winner ? " lose" : "")}><Team t={tie.away} dim={!tie.away} /></div>
                  {ri < rounds.length - 1 && <span className="brk-conn" />}
                </div>
              );
            })}
          </div>
        ))}
        <div className="brk-col trophy"><div className="brk-rlabel">{t("champion")}</div><div className="brk-trophy">🏆</div></div>
      </div>
    </div>
  );
}
/* Recharts points spread */
function PointsSpread({ lb, t }) {
  const data = lb.map((r) => ({ name: r.name, total: r.total, leader: r.rank === 1 }));
  return (
    <div className="card">
      <h3 className="cardh">📊 {t("spread")}</h3>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} interval={0} angle={-30} textAnchor="end" height={48} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
          <Tooltip cursor={{ fill: "rgba(25,195,125,.08)" }} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)" }} />
          <Bar dataKey="total" radius={[6, 6, 0, 0]} animationDuration={900}>
            {data.map((d, i) => <Cell key={i} fill={d.leader ? "var(--gold)" : "var(--grass)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
/* Player breakdown — animated stacked bar */
function Breakdown({ row, t }) {
  const parts = [
    { k: "groupMatch", v: row.groupMatch, c: "var(--grass)" },
    { k: "groupRank", v: row.groupRank, c: "var(--grass-d)" },
    { k: "knockout", v: row.knockout, c: "var(--gold)" },
    { k: "champion", v: row.champ, c: "var(--gold-d)" },
  ];
  const total = Math.max(1, row.total);
  const [grow, setGrow] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrow(true)); return () => cancelAnimationFrame(id); }, [row]);
  return (
    <div className="bd">
      <div className="bdbar">
        {parts.map((p) => p.v > 0 && <span key={p.k} className="bdseg" style={{ width: grow ? `${(p.v / total) * 100}%` : 0, background: p.c }} />)}
      </div>
      <div className="bdleg">
        {parts.map((p) => (
          <div className="bditem" key={p.k}><span className="bddot" style={{ background: p.c }} /><span>{t(p.k)}</span><b className="num">{p.v}</b></div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 8. Views -------------------------------------------- */
function NextCountdown({ ko, t }) {
  const diff = Math.max(0, ko - nowMs());
  const h = Math.floor(diff / 36e5), m = Math.floor((diff % 36e5) / 6e4);
  return <span className="nc-time num">{h > 0 ? `${h}h ` : ""}{m}m</span>;
}
function Dashboard({ data, lb, lang, onOpen, t, go }) {
  const phase = currentPhase(data);
  const today = dayKey(nowMs());
  const todays = useMemo(() => matchesOnDay(data, today), [data, today]);
  const live = todays.filter((m) => m.status === "live");
  const coming = todays.filter((m) => m.status === "scheduled");
  const completed = todays.filter((m) => m.status === "finished").sort((a, b) => b.ko - a.ko);
  const next = coming[0] || (data.matches || []).filter((m) => m.status === "scheduled").sort((a, b) => a.ko - b.ko)[0];
  // Hero features a live match if one is in progress; otherwise the next kickoff.
  const heroLive = live[0] || liveMatches(data)[0] || null;
  const hero = heroLive || next;
  const recent = useMemo(() => recentResults(data, 4), [data]);
  const dt = new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: getAppTz() }).format(new Date(nowMs()));
  const leader = lb[0];
  return (
    <div className="view">
      {/* slim phase + leader bar */}
      <div className="topstrip">
        <div className="ts-left"><span className="ts-dot" /> {t(phase)} · <b>{dt}</b></div>
        {leader && <button className="ts-leader" onClick={() => go("table")}>👑 {leader.name} <span className="num">{leader.total}</span></button>}
      </div>

      {/* hero: live match (with live score) or next kickoff (with countdown) */}
      {hero && (
        <button className={"nextcard" + (heroLive ? " islive" : "")} onClick={() => onOpen(hero)}>
          <div className="nc-bg" />
          <div className="nc-label">{heroLive ? <><span className="livedot" /> {t("liveNow")}</> : t("nextMatch")}</div>
          <div className="nc-fix">
            <div className="nc-team"><span className="nc-fl">{flagOf(hero.home)}</span><span className="nc-tn">{canonTeam(hero.home)}</span>{heroLive && <span className="nc-sc num">{hero.hs}</span>}</div>
            <div className="nc-mid">{heroLive ? <span className="nc-live">{hero.ht ? "HT" : hero.minute + "'"}</span> : <NextCountdown ko={hero.ko} t={t} />}<span className="nc-when">{fmtDay(hero.ko, lang)} {fmtTime(hero.ko, lang)}</span></div>
            <div className="nc-team"><span className="nc-fl">{flagOf(hero.away)}</span><span className="nc-tn">{canonTeam(hero.away)}</span>{heroLive && <span className="nc-sc num">{hero.as}</span>}</div>
          </div>
          <div className="nc-stage">{hero.stage === "group" ? `${t("group")} ${hero.group}` : t("r_" + hero.round)}</div>
        </button>
      )}

      {live.length > 0 && (
        <div className="card livecard">
          <h3 className="cardh"><span className="livedot" /> {t("liveNow")} · {live.length}</h3>
          {live.map((m) => <MatchRow key={m.id} m={m} data={data} lang={lang} onOpen={onOpen} />)}
        </div>
      )}

      <div className="card">
        <h3 className="cardh">⏳ {t("todayComing")} {coming.length > 0 && <span className="hint">· {coming.length}</span>}</h3>
        {coming.length === 0 && <div className="empty sm">{t("noComing")}</div>}
        {coming.map((m) => <MatchRow key={m.id} m={m} data={data} lang={lang} onOpen={onOpen} />)}
      </div>

      <div className="card">
        <h3 className="cardh">✅ {t("todayDone")} {completed.length > 0 && <span className="hint">· {completed.length}</span>}</h3>
        {completed.length === 0 && <div className="empty sm">{t("noDone")}</div>}
        {completed.map((m) => <MatchRow key={m.id} m={m} data={data} lang={lang} onOpen={onOpen} />)}
      </div>

      <div className="card">
        <h3 className="cardh">📋 {t("latestResults")} <button className="seeall" onClick={() => go("today")}>{t("seeAll")}</button></h3>
        {recent.map((m) => <MatchRow key={m.id} m={m} data={data} lang={lang} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
function Leaderboard({ lb, prevRanks, t, go }) {
  const top3 = lb.slice(0, 3), order = [top3[1], top3[0], top3[2]];
  return (
    <div className="view">
      <div className="podium">
        {order.map((r, i) => r && (
          <div className={"pod" + (r.rank === 1 ? " p1" : "")} key={r.name} onClick={() => go("profile", r.name)} style={{ animationDelay: `${i * 90}ms` }}>
            <div className="podmedal">{["🥈", "🥇", "🥉"][i]}</div>
            <Avatar name={r.name} />
            <div className="podname">{r.name}</div>
            <div className="podpts num"><CountUp value={r.total} /></div>
            <div className="podstand" style={{ height: r.rank === 1 ? 64 : r.rank === 2 ? 46 : 34 }} />
          </div>
        ))}
      </div>
      <div className="card">
        <h3 className="cardh">🏆 {t("standings")} <span className="hint">{t("tapPlayer")}</span></h3>
        <LeaderboardBars lb={lb} prevRanks={prevRanks} t={t} onPick={(n) => go("profile", n)} />
      </div>
    </div>
  );
}
function Groups({ data, t }) {
  return (
    <div className="view">
      <div className="gwrap">
        {GROUP_KEYS.map((g, i) => <GroupCard g={g} data={data} t={t} key={g} delay={i * 40} />)}
      </div>
    </div>
  );
}
function BracketView({ data, t }) {
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh">🗺️ {t("nav_bracket")}</h3>
        <p className="hint block">{t("brkIllustrative")}</p>
      </div>
      <Bracket data={data} t={t} />
    </div>
  );
}
function Profile({ data, lb, name, setName, t }) {
  const row = lb.find((r) => r.name === name) || lb[0];
  const p = data.players[row.name];
  return (
    <div className="view">
      <div className="card">
        <div className="psel">
          <label className="hint">{t("selectPlayer")}</label>
          <select value={row.name} onChange={(e) => setName(e.target.value)} className="select">
            {lb.map((r) => <option key={r.name} value={r.name}>{r.name} · {r.total} {t("pts")}</option>)}
          </select>
        </div>
        <div className="phead">
          <Avatar name={row.name} />
          <div className="pheadtxt"><div className="pname">{row.name}</div><div className="hint">{t("rank")} #{row.rank} · {t("champPick")}: {flagOf(p.champion)} {canonTeam(p.champion)}</div></div>
          <div className="ptotal"><CountUp value={row.total} /><span className="hint">{t("pts")}</span></div>
        </div>
      </div>
      <div className="card"><h3 className="cardh">🎯 {t("breakdown")}</h3><Breakdown row={row} t={t} /></div>
      <PointsHow row={row} t={t} />
      <div className="card">
        <h3 className="cardh">📋 {t("predicted")} · {t("groupRank")}</h3>
        <div className="ppreds">
          {GROUP_KEYS.map((g) => {
            const pred = playerGroupPred(p, g), table = computeGroupTable(g, data);
            return (
              <div className="ppred" key={g}>
                <div className="ppredg">{t("group")} {g}</div>
                {pred.map((tm, pos) => {
                  const actual = table[pos]?.team;
                  const exact = actual && sameTeam(tm, actual);
                  const inGroup = table.some((r) => sameTeam(r.team, tm));
                  return <div className={"ppline " + (exact ? "exact" : inGroup ? "ingrp" : "miss")} key={pos}>
                    <span className="ppos num">{pos + 1}</span><Team t={tm} />
                    {exact && <span className="ppt">+3</span>}{!exact && inGroup && <span className="ppt sm">+1</span>}
                  </div>;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function Help({ t }) {
  const rules = [
    { e: "⚔️", k: "rule_edge", p: "+1" }, { e: "🎯", k: "rule_exact", p: "+3" },
    { e: "📍", k: "rule_in", p: "+1" }, { e: "🗺️", k: "rule_ko", p: "+2…12" }, { e: "🏆", k: "rule_champ", p: "+10" },
  ];
  return (
    <div className="view">
      <div className="card"><h3 className="cardh">📖 {t("howScoring")}</h3>
        {rules.map((r) => <div className="rule" key={r.k}><span className="rulee">{r.e}</span><span className="rulet">{t(r.k)}</span><b className="rulep">{r.p}</b></div>)}
      </div>
      <div className="card"><h3 className="cardh">{t("knockout")}</h3>
        <div className="korules">
          {Object.entries(SCORING.knockout).map(([k, v]) => <div className="korule" key={k}><span>{t("r_" + k)}</span><b className="num">+{v}</b></div>)}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ m, t }) {
  if (m.status === "live") return <span className="spill live">{m.ht ? "HT" : m.minute + "'"}</span>;
  if (m.status === "finished") return <span className="spill ft">FT</span>;
  return <span className="spill sched num">{fmtTime(m.ko, t("dir") === "rtl" ? "ar" : "en")}</span>;
}
function MatchRow({ m, data, lang, onOpen }) {
  const tally = useMemo(() => matchPredictionTally(data, m), [data, m]);
  const showScore = m.status !== "scheduled";
  const homeWin = showScore && m.hs > m.as, awayWin = showScore && m.as > m.hs;
  const totalBack = Math.max(1, tally.home + tally.away);
  return (
    <button className={"match" + (m.status === "live" ? " islive" : "")} onClick={() => onOpen(m)}>
      <div className="match-main">
        <div className="match-status"><StatusPill m={m} t={(k) => I18N[lang][k]} /></div>
        <div className="match-teams">
          <div className={"mt" + (homeWin ? " win" : "")}><span className="fl">{flagOf(m.home)}</span><span className="mtn">{canonTeam(m.home)}</span>{showScore && <span className="msc num">{m.hs ?? "–"}</span>}</div>
          <div className={"mt" + (awayWin ? " win" : "")}><span className="fl">{flagOf(m.away)}</span><span className="mtn">{canonTeam(m.away)}</span>{showScore && <span className="msc num">{m.as ?? "–"}</span>}</div>
        </div>
        <span className="match-chev">›</span>
      </div>
      <div className="match-pred">
        <span className="mpbar"><span className="mpfill h" style={{ width: `${(tally.home / totalBack) * 100}%` }} /><span className="mpfill a" style={{ width: `${(tally.away / totalBack) * 100}%` }} /></span>
        <span className="mptxt">{tally.home}–{tally.away} {I18N[lang].predBacking}</span>
      </div>
    </button>
  );
}
function MatchCenter({ data, lang, onOpen, t }) {
  const days = useMemo(() => matchDays(data), [data]);
  const [day, setDay] = useState(() => { const td = dayKey(nowMs()); return days.includes(td) ? td : days.find((d) => d >= td) || days[days.length - 1]; });
  const dayMatches = useMemo(() => matchesOnDay(data, day), [data, day]);
  const live = useMemo(() => liveMatches(data), [data]);
  const stripRef = useRef();
  // Center the selected day (Today by default) in the horizontally-scrolling strip.
  useEffect(() => {
    const strip = stripRef.current; if (!strip) return;
    const btn = strip.querySelector(".datebtn.on"); if (!btn) return;
    const sRect = strip.getBoundingClientRect(), bRect = btn.getBoundingClientRect();
    strip.scrollLeft += (bRect.left - sRect.left) - (strip.clientWidth - bRect.width) / 2;
  }, [day, days]);
  // group day's matches by stage/group
  const sections = useMemo(() => {
    const byKey = {};
    dayMatches.forEach((m) => { const k = m.stage === "group" ? "G:" + m.group : "KO:" + m.round; (byKey[k] = byKey[k] || []).push(m); });
    return Object.entries(byKey);
  }, [dayMatches]);
  return (
    <div className="view">
      {live.length > 0 && (
        <div className="card livecard">
          <h3 className="cardh"><span className="livedot" /> {t("liveNow")} · {live.length}</h3>
          {live.map((m) => <MatchRow key={m.id} m={m} data={data} lang={lang} onOpen={onOpen} />)}
        </div>
      )}
      <div className="datestrip" ref={stripRef}>
        {days.map((d) => (
          <button key={d} className={"datebtn" + (d === day ? " on" : "")} onClick={() => setDay(d)}>
            <span className="dlabel">{fmtDay(d, lang)}</span>
            <span className="dcount num">{matchesOnDay(data, d).length}</span>
          </button>
        ))}
      </div>
      {sections.length === 0 && <div className="card empty">{t("noMatches")}</div>}
      {sections.map(([k, ms]) => (
        <div className="card" key={k}>
          <h3 className="cardh"><span className="gbadge">{k.startsWith("G:") ? `${t("group")} ${k.slice(2)}` : t("r_" + k.slice(3))}</span></h3>
          {ms.map((m) => <MatchRow key={m.id} m={m} data={data} lang={lang} onOpen={onOpen} />)}
        </div>
      ))}
    </div>
  );
}

const TABS = ["events", "lineups", "stats", "predictions"];
function MatchDetail({ m, data, lang, t, onBack }) {
  const [tab, setTab] = useState(m.status === "scheduled" ? "predictions" : "events");
  const showScore = m.status !== "scheduled";
  // Premium match detail (timeline/lineup/stats) for real matches, by eventId.
  const [detail, setDetail] = useState(null);
  const [dStatus, setDStatus] = useState("idle"); // idle | loading | ready | error
  useEffect(() => {
    if (!m.real || m.status === "scheduled") { setDetail(null); setDStatus("idle"); return; }
    if (!m.eventId) { setDetail(null); setDStatus("ready"); return; }
    let alive = true; setDStatus("loading");
    fetchMatchDetail(m.eventId, data.settings && data.settings.sportsdbKey)
      .then((d) => { if (alive) { setDetail(d); setDStatus("ready"); } })
      .catch(() => { if (alive) { setDetail(null); setDStatus("error"); } });
    return () => { alive = false; };
  }, [m.id, m.eventId, m.status]);
  // Fill the score from the premium feed when the DB result isn't in yet.
  let hs = m.hs, as = m.as;
  if ((hs == null || as == null) && detail) {
    const ev = detail.event;
    if (ev && ev.homeScore != null && ev.homeScore !== "" && ev.awayScore != null && ev.awayScore !== "") {
      if (sameTeam(ev.home, m.away)) { hs = Number(ev.awayScore); as = Number(ev.homeScore); }
      else { hs = Number(ev.homeScore); as = Number(ev.awayScore); }
    } else if (detail.timeline && detail.timeline.length) {
      let gh = 0, ga = 0;
      detail.timeline.filter((e) => /goal/i.test(e.type) && !/no goal|disallow|missed|saved/i.test(e.type)).forEach((e) => {
        const own = /own goal/i.test(e.type), home = sameTeam(e.team, m.home);
        (own ? !home : home) ? gh++ : ga++;
      });
      hs = gh; as = ga;
    }
  }
  const showAnyScore = showScore || hs != null;
  return (
    <div className="view md">
      <button className="backbtn" onClick={onBack}>‹ {t("back")}</button>
      <div className="md-head">
        <div className="md-bg" />
        <div className="md-stage">{m.stage === "group" ? `${t("group")} ${m.group}` : t("r_" + m.round)} · {fmtDay(m.ko, lang)} {fmtTime(m.ko, lang)}{m.venue ? ` · ${m.venue}` : ""}</div>
        <div className="md-score">
          <div className="md-team"><span className="md-fl">{flagOf(m.home)}</span><span className="md-tn">{canonTeam(m.home)}</span></div>
          <div className="md-mid">
            {showAnyScore ? <div className="md-sc num">{hs ?? "–"}<span className="md-dash">–</span>{as ?? "–"}</div> : <div className="md-vs">{fmtTime(m.ko, lang)}</div>}
            <div className={"md-st" + (m.status === "live" ? " live" : "")}>{m.status === "live" ? (m.ht ? t("ht_full") : m.minute + "'") : m.status === "finished" ? t("ft_full") : t("upcoming")}</div>
          </div>
          <div className="md-team"><span className="md-fl">{flagOf(m.away)}</span><span className="md-tn">{canonTeam(m.away)}</span></div>
        </div>
      </div>
      <div className="md-tabs">
        {TABS.map((tb) => (
          <button key={tb} className={"md-tab" + (tab === tb ? " on" : "")} onClick={() => setTab(tb)} disabled={tb !== "predictions" && m.status === "scheduled"}>{t("tab_" + tb)}</button>
        ))}
      </div>
      {tab === "events" && (m.real ? <RealEvents detail={detail} status={dStatus} m={m} t={t} /> : <MatchEvents m={m} t={t} />)}
      {tab === "lineups" && (m.real ? <RealLineups detail={detail} status={dStatus} m={m} t={t} /> : <MatchLineups m={m} t={t} />)}
      {tab === "stats" && (m.real ? <RealStats detail={detail} status={dStatus} m={m} t={t} /> : <MatchStats m={m} t={t} />)}
      {tab === "predictions" && <MatchPredictions m={m} data={data} t={t} />}
    </div>
  );
}
// --- premium (TheSportsDB V2) match-detail renderers ---
function DetailEmpty({ status, t }) {
  return <div className="card empty">{status === "loading" ? t("loadingData") : t("noDetail")}</div>;
}
const tlIcon = (typ) => /own goal/i.test(typ) ? "🔴" : /goal|penalty scored/i.test(typ) ? "⚽" : /yellow/i.test(typ) ? "🟨" : /red/i.test(typ) ? "🟥" : /subst/i.test(typ) ? "🔁" : "•";
function RealEvents({ detail, status, m, t }) {
  const tl = detail && detail.timeline;
  if (!tl || tl.length === 0) return <DetailEmpty status={status} t={t} />;
  const key = (e) => /goal/i.test(e.type) ? "goal" : /yellow/i.test(e.type) ? "yc" : /red/i.test(e.type) ? "rc" : /subst/i.test(e.type) ? "sub" : "ev";
  return (
    <div className="card">
      <div className="vtimeline">
        {tl.map((e, i) => {
          const home = sameTeam(e.team, m.home);
          const cell = (
            <span className={"vt-ev " + key(e)}>
              <span className="vt-ic">{tlIcon(e.type)}</span>
              <span className="vt-txt"><b className="vt-pl">{e.player}</b><span className="vt-ty">{e.type}</span></span>
            </span>
          );
          return (
            <div className={"vt-row " + (home ? "home" : "away")} key={i}>
              <span className="vt-side h">{home && cell}</span>
              <span className="vt-min num">{e.min !== "" ? e.min + "'" : "•"}</span>
              <span className="vt-side a">{!home && cell}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function RealStats({ detail, status, m, t }) {
  const st = detail && detail.stats;
  if (!st || st.length === 0) return <DetailEmpty status={status} t={t} />;
  return (
    <div className="card">
      {st.map((s, i) => {
        const h = parseFloat(s.home) || 0, a = parseFloat(s.away) || 0, tot = h + a || 1;
        return (
          <div className="statline" key={i}>
            <span className="sv num">{s.home}</span>
            <span className="slabel">{s.name}</span>
            <span className="sv num end">{s.away}</span>
            <span className="sbar"><span className="sbh" style={{ width: `${(h / tot) * 100}%` }} /><span className="sba" style={{ width: `${(a / tot) * 100}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}
// Classify a free-text position into a pitch line.
function posLine(pos) {
  const p = String(pos || "").toLowerCase();
  if (/keeper|goalkeeper|\bgk\b/.test(p)) return "GK";
  if (/midfield/.test(p)) return "MID";
  if (/back|defen|wing.?back/.test(p)) return "DEF";
  if (/forward|winger|striker|wing/.test(p)) return "FWD";
  return "MID";
}
const lastName = (n) => { const a = String(n || "").trim().split(/\s+/); return a[a.length - 1] || n; };
function teamLines(players) { const L = { GK: [], DEF: [], MID: [], FWD: [] }; players.forEach((p) => L[posLine(p.pos)].push(p)); return L; }
function PitchTeam({ players, order, side }) {
  const lines = teamLines(players);
  return (
    <div className={"fpt " + side}>
      {order.map((ln) => lines[ln].length ? (
        <div className="fpt-line" key={ln}>
          {lines[ln].map((p, i) => (
            <div className="fp-pl" key={i} title={p.player + (p.pos ? " · " + p.pos : "")}>
              <span className="fp-num">{p.num || ""}</span>
              <span className="fp-nm">{lastName(p.player)}</span>
            </div>
          ))}
        </div>
      ) : null)}
    </div>
  );
}
function RealLineups({ detail, status, m, t }) {
  const lu = detail && detail.lineup;
  if (!lu || lu.length === 0) return <DetailEmpty status={status} t={t} />;
  let homeP = lu.filter((p) => sameTeam(p.team, m.home));
  let awayP = lu.filter((p) => sameTeam(p.team, m.away));
  // Fallback when team names don't match: split the list in half.
  if (homeP.length === 0 && awayP.length === 0) { const h = Math.ceil(lu.length / 2); homeP = lu.slice(0, h); awayP = lu.slice(h); }
  const split = (arr) => {
    let start = arr.filter((p) => !p.sub), bench = arr.filter((p) => p.sub);
    if (start.length > 11) { bench = start.slice(11).concat(bench); start = start.slice(0, 11); }
    return [start, bench];
  };
  const [homeStart, homeBench] = split(homeP);
  const [awayStart, awayBench] = split(awayP);
  return (
    <div className="card">
      <div className="fpitch-labels"><span>{flagOf(m.home)} {canonTeam(m.home)}</span><span>{canonTeam(m.away)} {flagOf(m.away)}</span></div>
      <div className="fpitch">
        <div className="fp-markings" />
        <PitchTeam players={awayStart} order={["GK", "DEF", "MID", "FWD"]} side="away" />
        <div className="fpitch-cl" />
        <PitchTeam players={homeStart} order={["FWD", "MID", "DEF", "GK"]} side="home" />
      </div>
      {(homeBench.length + awayBench.length) > 0 && (
        <div className="fbench">
          {[[m.home, homeBench], [m.away, awayBench]].map(([tm, bench], i) => (
            <div className="fbench-col" key={i}>
              <div className="fbench-h">{flagOf(tm)} {t("bench")}</div>
              {bench.map((p, j) => <span className="benchp" key={j}><span className="num">{p.num || "–"}</span> {p.player}</span>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function MatchEvents({ m, t }) {
  if (!m.events || m.events.length === 0) return <div className="card empty">{t("noEvents")}</div>;
  const icon = (e) => e.type === "goal" ? "⚽" : e.type === "yellow" ? "🟨" : e.type === "red" ? "🟥" : "🔁";
  return (
    <div className="card">
      <div className="timeline">
        {m.events.map((e, i) => (
          <div className={"tlrow " + e.side} key={i} style={{ animationDelay: `${i * 50}ms` }}>
            <div className="tlhome">{e.side === "home" && <span className="tlev"><b>{e.player}</b> <span className="tlic">{icon(e)}</span></span>}</div>
            <div className="tlmin num">{e.min}'</div>
            <div className="tlaway">{e.side === "away" && <span className="tlev"><span className="tlic">{icon(e)}</span> <b>{e.player}</b></span>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Pitch({ squad, side }) {
  const lines = { GK: [], DEF: [], MID: [], FWD: [] };
  squad.filter((p) => p.start).forEach((p) => lines[p.pos].push(p));
  const order = side === "home" ? ["GK", "DEF", "MID", "FWD"] : ["FWD", "MID", "DEF", "GK"];
  return (
    <div className={"pitch " + side}>
      {order.map((ln) => (
        <div className="pline" key={ln}>
          {lines[ln].map((p) => (
            <div className="pp" key={p.num} title={p.name}><span className="ppnum num">{p.num}</span><span className="ppname">{p.name.split(" ").slice(-1)[0]}</span></div>
          ))}
        </div>
      ))}
    </div>
  );
}
function MatchLineups({ m, t }) {
  const [side, setSide] = useState("home");
  if (!m.lineups) return <div className="card empty">{t("noEvents")}</div>;
  const sq = side === "home" ? m.lineups.home : m.lineups.away;
  const tm = side === "home" ? m.home : m.away;
  return (
    <div className="card">
      <div className="lu-switch">
        <button className={side === "home" ? "on" : ""} onClick={() => setSide("home")}>{flagOf(m.home)} {canonTeam(m.home)}</button>
        <button className={side === "away" ? "on" : ""} onClick={() => setSide("away")}>{flagOf(m.away)} {canonTeam(m.away)}</button>
      </div>
      <div className="lu-form">{t("formation")}: <b>{m.lineups.formation}</b></div>
      <Pitch squad={sq} side="home" />
      <div className="lu-bench"><div className="lu-bh">{t("bench")}</div>
        {sq.filter((p) => !p.start).map((p) => <span className="benchp" key={p.num}><span className="num">{p.num}</span> {p.name}</span>)}
      </div>
    </div>
  );
}
function MatchStats({ m, t }) {
  if (!m.stats) return <div className="card empty">{t("noEvents")}</div>;
  const rows = [
    { k: "possession", suffix: "%" }, { k: "shots" }, { k: "sot" }, { k: "corners" }, { k: "fouls" }, { k: "offsides" },
  ];
  return (
    <div className="card">
      {rows.map((r) => {
        const [h, a] = m.stats[r.k], tot = Math.max(1, h + a);
        return (
          <div className="statline" key={r.k}>
            <span className="sv num">{h}{r.suffix || ""}</span>
            <span className="slabel">{t("stat_" + r.k)}</span>
            <span className="sv num end">{a}{r.suffix || ""}</span>
            <span className="sbar"><span className="sbh" style={{ width: `${(h / tot) * 100}%` }} /><span className="sba" style={{ width: `${(a / tot) * 100}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}
function MatchPredictions({ m, data, t }) {
  const tally = useMemo(() => matchPredictionTally(data, m), [data, m]);
  const tot = Math.max(1, tally.home + tally.away);
  const decided = m.status === "finished";
  const winner = m.stage === "group" ? (m.finalH > m.finalA ? m.home : m.finalA > m.finalH ? m.away : null) : data.knockoutResults[m.mid];
  const sorted = [...tally.rows].sort((a, b) => b.got - a.got || a.name.localeCompare(b.name));
  return (
    <div className="card">
      <h3 className="cardh">👥 {t("whoBacked")}</h3>
      <div className="pp-split">
        <div className="pp-side"><span className="fl">{flagOf(m.home)}</span><b className="num">{tally.home}</b></div>
        <span className="pp-track"><span className="mpfill h" style={{ width: `${(tally.home / tot) * 100}%` }} /><span className="mpfill a" style={{ width: `${(tally.away / tot) * 100}%` }} /></span>
        <div className="pp-side end"><b className="num">{tally.away}</b><span className="fl">{flagOf(m.away)}</span></div>
      </div>
      {decided && <div className="pp-result">{t("actual")}: <Team t={winner} /> {m.stage === "group" ? `· ${m.finalH}–${m.finalA}` : ""}</div>}
      <div className="pp-list">
        {sorted.map((r) => (
          <div className="pp-row" key={r.name}>
            <Avatar name={r.name} /><span className="pp-name">{r.name}</span>
            <span className="pp-pick">{r.backed ? <Team t={r.backed} /> : <span className="muted">—</span>}</span>
            {decided && (r.got > 0 ? <span className="pp-pt ok">+{r.got}</span> : <span className="pp-pt no">0</span>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Predictions({ data, lb, t, go }) {
  const order = lb.map((r) => r.name);
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh">📋 {t("nav_predictions")}</h3>
        <p className="hint block">{t("predGridHint")}</p>
      </div>
      <div className="card nopad">
        <div className="pgrid-scroll">
          <table className="pgrid">
            <thead>
              <tr><th className="sticky">{t("player")}</th>{GROUP_KEYS.map((g) => <th key={g}>{g}</th>)}<th className="champcol">🏆</th></tr>
            </thead>
            <tbody>
              {order.map((name) => {
                const p = data.players[name];
                return (
                  <tr key={name} onClick={() => go("profile", name)}>
                    <td className="sticky pgname"><Avatar name={name} /><span>{name}</span></td>
                    {GROUP_KEYS.map((g) => {
                      const pick = playerGroupPred(p, g)[0];
                      const actual = computeGroupTable(g, data)[0]?.team;
                      const hit = pick && actual && sameTeam(pick, actual);
                      return <td key={g} className={hit ? "hit" : ""} title={canonTeam(pick)}>{flagOf(pick)}</td>;
                    })}
                    <td className="champcol" title={canonTeam(p.champion)}>{flagOf(p.champion)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pglegend"><span className="pgdot hit" /> {t("predHitGroup")}</div>
      </div>
    </div>
  );
}

function Consensus({ data, t }) {
  const champ = useMemo(() => consensusTally(data.players, (p) => p.champion), [data]);
  const total = Object.keys(data.players).length;
  const [grow, setGrow] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrow(true)); return () => cancelAnimationFrame(id); }, []);
  const maxC = Math.max(1, champ[0]?.count || 1);
  return (
    <div className="view">
      <div className="card">
        <h3 className="cardh">🏆 {t("champConsensus")}</h3>
        <div className="cbars">
          {champ.map((c, i) => (
            <div className="cbar" key={c.team} style={{ animationDelay: `${i * 50}ms` }}>
              <span className="cbteam"><Team t={c.team} /></span>
              <span className="cbtrack"><span className="cbfill" style={{ width: grow ? `${(c.count / maxC) * 100}%` : 0 }} /></span>
              <span className="cbcount num">{c.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3 className="cardh">📍 {t("topWinners")}</h3>
        <div className="cwgrid">
          {GROUP_KEYS.map((g) => {
            const tally = consensusTally(data.players, (p) => playerGroupPred(p, g)[0]);
            const top = tally[0];
            const actual = computeGroupTable(g, data)[0]?.team;
            const hit = top && actual && sameTeam(top.team, actual);
            return (
              <div className={"cwcard" + (hit ? " hit" : "")} key={g}>
                <div className="cwg">{t("group")} {g}</div>
                <div className="cwteam">{top ? <><span className="fl">{flagOf(top.team)}</span><span className="cwn">{canonTeam(top.team)}</span></> : <span className="muted">—</span>}</div>
                <div className="cwmeta">{top ? top.count : 0}/{total} {hit && <span className="cwok">✓</span>}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Trends({ data, lb, t }) {
  const timeline = useMemo(() => pointsTimeline(data), [data]);
  const top = lb.slice(0, 6).map((r) => r.name);
  return (
    <div className="view">
      <div className="card">
        <h3 className="cardh">📈 {t("nav_trends")} <span className="hint">{t("trendsHint")}</span></h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={timeline} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "var(--muted)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {top.map((name, i) => (
              <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} dot={{ r: 2 }} animationDuration={1100} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Scorers({ data, t }) {
  const teams = useMemo(() => topScoringTeams(data), [data]);
  const max = Math.max(1, teams[0]?.gf || 1);
  const [grow, setGrow] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrow(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh">⚽ {t("nav_scorers")}</h3>
        <p className="hint block">{t("scorersNote")}</p>
      </div>
      <div className="card">
        <div className="cbars">
          {teams.map((tm, i) => (
            <div className="cbar" key={tm.team} style={{ animationDelay: `${i * 50}ms` }}>
              <span className="cbteam"><Team t={tm.team} /></span>
              <span className="cbtrack"><span className="cbfill gold" style={{ width: grow ? `${(tm.gf / max) * 100}%` : 0 }} /></span>
              <span className="cbcount num">{tm.gf}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 8b. Points (live calculation + audit) ---------------- */
function ptClass(v) { return v >= 3 ? "pt3" : v > 0 ? "pt1" : "pt0"; }
function AuditGroup({ g, detail, t }) {
  const [open, setOpen] = useState(false);
  const rank = detail.ranking.filter((r) => r.g === g);
  const matches = detail.matches.filter((m) => m.g === g);
  const wonMatches = matches.filter((m) => m.got > 0);
  const sub = rank.reduce((s, r) => s + r.got, 0) + matches.reduce((s, m) => s + m.got, 0);
  return (
    <div className={"ag" + (open ? " open" : "")}>
      <button className="ag-head" onClick={() => setOpen((o) => !o)}>
        <span className="ag-g">{t("group")} {g}</span>
        <span className="ag-chev">{open ? "▾" : "▸"}</span>
        <span className="ag-sub num">+{sub}</span>
      </button>
      {open && (
        <div className="ag-body">
          <div className="ag-section">{t("groupRank")}</div>
          {rank.map((r) => (
            <div className="agrank" key={r.pos}>
              <span className="agpos num">{r.pos}</span>
              <span className="agpick"><Team t={r.pick} dim={!r.pick} /></span>
              <span className="agarrow">→</span>
              <span className="agact"><Team t={r.actual} dim={!r.actual} /></span>
              <span className={"agpt " + ptClass(r.got)}>{r.got > 0 ? "+" + r.got : "0"}</span>
            </div>
          ))}
          <div className="ag-section">{t("groupMatch")} · +{matches.reduce((s, m) => s + m.got, 0)} <span className="hint">({wonMatches.length}/{matches.length})</span></div>
          <div className="agmwrap">
            {wonMatches.length === 0 && <span className="hint">—</span>}
            {wonMatches.map((m, i) => (
              <span className="agm" key={i}><span className="fl">{flagOf(m.winner)}</span> {t("beat")} <span className="fl">{flagOf(sameTeam(m.winner, m.home) ? m.away : m.home)}</span> <b className="pt1">+1</b></span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// Plain-language "how your points add up" breakdown for end users.
function pointsCounts(row) {
  const d = row.detail;
  return {
    edges: d.matches.filter((m) => m.got > 0).length, edgesTotal: d.matches.length,
    exact: d.ranking.filter((r) => r.reason === "exact").length,
    inGrp: d.ranking.filter((r) => r.reason === "in_group").length,
    koHit: d.knockout.filter((k) => k.got > 0).length, koTotal: d.knockout.length,
    champDecided: !!d.champion, champHit: d.champion && d.champion.got > 0,
  };
}
function PointsHow({ row, t }) {
  const c = pointsCounts(row);
  const items = [
    { e: "⚔️", title: t("p_winner_t"), desc: t("p_winner_d"), note: `${c.edges} ${t("p_of")} ${c.edgesTotal} ${t("p_correct")}`, pts: row.groupMatch },
    { e: "🎯", title: t("p_pos_t"), desc: t("p_pos_d"), note: `${c.exact} ${t("p_exact")} · ${c.inGrp} ${t("p_ingrp")}`, pts: row.groupRank },
    { e: "🗺️", title: t("p_ko_t"), desc: t("p_ko_d"), note: c.koTotal ? `${c.koHit} ${t("p_of")} ${c.koTotal} ${t("p_correct")}` : t("pending"), pts: row.knockout },
    { e: "👑", title: t("p_champ_t"), desc: t("p_champ_d"), note: c.champDecided ? (c.champHit ? "✓ " + t("p_yes") : "✗ " + t("p_no")) : t("pending"), pts: row.champ },
  ];
  return (
    <div className="card">
      <div className="phow-head"><h3 className="cardh" style={{ margin: 0 }}>🧮 {t("p_howAdd")}</h3><div className="phow-total"><b className="num">{row.total}</b> <span className="hint">{t("pts")}</span></div></div>
      <div className="phow">
        {items.map((it, i) => (
          <div className="phow-row" key={i}>
            <span className="phow-e">{it.e}</span>
            <span className="phow-main">
              <span className="phow-t">{it.title} <span className="phow-n">· {it.note}</span></span>
              <span className="phow-d">{it.desc}</span>
            </span>
            <span className={"phow-pts num" + (it.pts > 0 ? " on" : "")}>+{it.pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function Points({ data, lb, t, name, setName }) {
  const row = lb.find((r) => r.name === name) || lb[0];
  const pending = useMemo(() => livePendingPoints(data, data.players[row.name]), [data, row.name]);
  const cats = [
    { k: "groupMatch", c: "var(--grass)" }, { k: "groupRank", c: "var(--grass-d)" },
    { k: "knockout", c: "var(--gold)" }, { k: "champion", c: "var(--gold-d)" },
  ];
  return (
    <div className="view">
      {/* live board */}
      <div className="card">
        <h3 className="cardh"><span className="livedot" /> {t("livePoints")} <span className="hint">{t("livePtsHint")}</span></h3>
        <div className="ptlegend">{cats.map((c) => <span key={c.k} className="ptl"><span className="ptdot" style={{ background: c.c }} />{t(c.k)}</span>)}</div>
        <div className="ptboard">
          {lb.map((r, i) => {
            const lp = livePendingPoints(data, data.players[r.name]);
            const tot = Math.max(1, r.total);
            const segs = [r.groupMatch, r.groupRank, r.knockout, r.champ];
            return (
              <button className={"pbrow" + (r.name === row.name ? " sel" : "")} key={r.name} onClick={() => setName(r.name)} style={{ animationDelay: `${i * 35}ms` }}>
                <span className="pbrank num">{r.rank}</span>
                <Avatar name={r.name} />
                <span className="pbmain">
                  <span className="pbname">{r.name}{lp.pts > 0 && <span className="pblive">+{lp.pts} live</span>}</span>
                  <span className="pbbar">{segs.map((s, j) => s > 0 && <span key={j} className="pbseg" style={{ width: `${(s / tot) * 100}%`, background: cats[j].c }} />)}</span>
                </span>
                <span className="pbtot num"><CountUp value={r.total} /></span>
              </button>
            );
          })}
        </div>
      </div>

      {/* selector */}
      <div className="card slim">
        <h3 className="cardh">🔍 {t("howCalc")}</h3>
        <div className="psel-strip">
          {lb.map((r) => (
            <button key={r.name} className={"pchip" + (r.name === row.name ? " on" : "")} onClick={() => setName(r.name)}>
              <Avatar name={r.name} /><span>{r.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* plain-language breakdown */}
      <PointsHow row={row} t={t} />
      {pending.pts > 0 && <div className="card slim"><div className="eq-pending">⚡ {t("pendingLive")}: <b>+{pending.pts}</b> {t("fromLive")}</div></div>}

      {/* group-by-group audit */}
      <div className="card">
        <h3 className="cardh">📂 {t("groupBreakdown")} <span className="hint">{t("tapExpand")}</span></h3>
        <div className="aglist">
          {GROUP_KEYS.map((g) => <AuditGroup key={g} g={g} detail={row.detail} t={t} />)}
        </div>
      </div>

      {/* knockout + champion */}
      <div className="card">
        <h3 className="cardh">🗺️ {t("knockout")} · +{row.knockout}</h3>
        {row.detail.knockout.length === 0 && <div className="empty sm">—</div>}
        {row.detail.knockout.map((k) => (
          <div className="koaudit" key={k.mid}>
            <span className="kord">{t("r_" + k.round)}</span>
            <span className="kopick"><Team t={k.predW} dim={!k.predW} /></span>
            <span className="agarrow">vs</span>
            <span className="koact">{t("actual")}: <Team t={k.actualW} /></span>
            <span className={"agpt " + ptClass(k.got)}>{k.got > 0 ? "+" + k.got : "0"}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 className="cardh">🏆 {t("champion")} · +{row.champ}</h3>
        {row.detail.champion ? (
          <div className="koaudit"><span className="kopick"><Team t={row.detail.champion.pick} /></span><span className="agarrow">vs</span><span className="koact">{t("actual")}: <Team t={row.detail.champion.actual} /></span><span className={"agpt " + ptClass(row.detail.champion.got)}>{row.detail.champion.got > 0 ? "+" + row.detail.champion.got : "0"}</span></div>
        ) : <div className="empty sm">{t("champPending")} (+{SCORING.champion} {t("ifCorrect")})</div>}
      </div>
    </div>
  );
}

/* ---------------- 8c. Admin views -------------------------------------- */
function AdminLogin({ onAuth, t }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState(false);
  const submit = () => { if (pw === "admin2026") onAuth(); else setErr(true); };
  return (
    <div className="view">
      <div className="card adminlogin">
        <div className="al-ico"><Ico name="lock" size={34} /></div>
        <h3 className="cardh">{t("adminLogin")}</h3>
        <input className="select" type="password" value={pw} placeholder={t("password")}
          onChange={(e) => { setPw(e.target.value); setErr(false); }} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div className="al-err">{t("wrongPw")}</div>}
        <button className="btn" onClick={submit}>{t("login")}</button>
      </div>
    </div>
  );
}
function MatchEditRow({ m, onSet, onClear, koError }) {
  const [h, setH] = useState(m.hs ?? ""); const [a, setA] = useState(m.as ?? "");
  useEffect(() => { setH(m.hs ?? ""); setA(m.as ?? ""); }, [m.hs, m.as]);
  const invalid = m.stage === "ko" && h !== "" && a !== "" && Number(h) === Number(a);
  const change = (hh, aa) => { setH(hh); setA(aa); if (hh !== "" && aa !== "") onSet(m.id, parseInt(hh, 10) || 0, parseInt(aa, 10) || 0); };
  return (
    <div className={"erow" + (invalid ? " invalid" : "")}>
      <span className="eteam"><span className="fl">{flagOf(m.home)}</span><span className="etn">{canonTeam(m.home)}</span></span>
      <input className="scoreinp" inputMode="numeric" value={h} onChange={(e) => change(e.target.value.replace(/\D/g, "").slice(0, 2), a)} />
      <span className="edash">–</span>
      <input className="scoreinp" inputMode="numeric" value={a} onChange={(e) => change(h, e.target.value.replace(/\D/g, "").slice(0, 2))} />
      <span className="eteam end"><span className="etn">{canonTeam(m.away)}</span><span className="fl">{flagOf(m.away)}</span></span>
      <button className="eclear" onClick={() => onClear(m.id)} title="clear">✕</button>
      {invalid && <span className="ko-warn">{koError}</span>}
    </div>
  );
}
function Results({ data, setData, t, lang }) {
  const [bucket, setBucket] = useState("A");
  const setScore = (id, hs, as) => setData((d) => {
    const target = d.matches.find((x) => x.id === id);
    if (!target) return d;
    if (target.stage === "ko" && hs === as) return d; // knockouts need a winner
    const matches = d.matches.map((x) => x.id === id ? applyAdminScore(x, hs, as) : x);
    const log = { ts: Date.now(), msg: `${canonTeam(target.home)} ${hs}–${as} ${canonTeam(target.away)}` };
    const nd = recomputeLive({ ...d, matches, auditLog: [log, ...(d.auditLog || [])].slice(0, 80) });
    persistLive(nd);
    if (LIVE_MODE && target.stage === "group") upsertResult(target.group, target.idx, target.home, target.away, hs, as).catch((e) => console.warn("result upsert failed", e && e.message));
    return nd;
  });
  const clearScore = (id) => setData((d) => { const nd = recomputeLive({ ...d, matches: d.matches.map((x) => x.id === id ? { ...x, adminLocked: false } : x) }); persistLive(nd); return nd; });
  const setChampion = (team) => setData((d) => { const nd = recomputeLive({ ...d, championOverride: team || null, auditLog: [{ ts: Date.now(), msg: `${t("champion")}: ${team || "—"}` }, ...(d.auditLog || [])].slice(0, 80) }); persistLive(nd); return nd; });
  const allTeams = GROUP_KEYS.flatMap((g) => GROUPS[g]).sort();
  const list = bucket === "KO" ? (data.matches || []).filter((m) => m.stage === "ko") : (data.matches || []).filter((m) => m.stage === "group" && m.group === bucket).sort((a, b) => a.idx - b.idx);
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh"><Ico name="edit" size={18} /> {t("resultsEditor")}</h3>
        <p className="hint block">{t("resultsHint")}</p>
      </div>
      <div className="card">
        <div className="bucketstrip">
          {GROUP_KEYS.map((g) => <button key={g} className={"bbtn" + (bucket === g ? " on" : "")} onClick={() => setBucket(g)}>{g}</button>)}
          <button className={"bbtn ko" + (bucket === "KO" ? " on" : "")} onClick={() => setBucket("KO")}>KO</button>
        </div>
        <div className="erows">
          {list.map((m) => <MatchEditRow key={m.id} m={m} onSet={setScore} onClear={clearScore} koError={t("koNeedsWinner")} />)}
        </div>
      </div>
      <div className="card">
        <h3 className="cardh"><Ico name="trophy" size={18} /> {t("setChampion")}</h3>
        <select className="select" value={data.championOverride || ""} onChange={(e) => setChampion(e.target.value)}>
          <option value="">— {t("pending")} —</option>
          {allTeams.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
        </select>
      </div>
    </div>
  );
}
const TZ_OPTIONS = ["Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Amman", "Asia/Baghdad", "Asia/Tehran", "Asia/Kuwait", "Africa/Cairo", "Europe/London", "America/New_York", "UTC"];
function AdminSettings({ data, setData, t }) {
  const s = data.settings || {};
  const set = (k, v) => setData((d) => { const nd = { ...d, settings: { ...d.settings, [k]: v } }; if (k === "tz") setAppTz(v); persistLive(nd); return nd; });
  const pool = (Object.keys(data.players).length) * (Number(s.entryFeeAED) || 0);
  const tz = s.tz || "Asia/Dubai";
  return (
    <div className="view">
      <div className="card"><h3 className="cardh"><Ico name="settings" size={18} /> {t("nav_settings")}</h3>
        <label className="frow"><span>{t("timezone")}</span>
          <select className="select sm" value={tz} onChange={(e) => set("tz", e.target.value)}>
            {(TZ_OPTIONS.includes(tz) ? TZ_OPTIONS : [tz, ...TZ_OPTIONS]).map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label className="frow"><span>{t("entryFee")}</span><input className="select sm" inputMode="numeric" value={s.entryFeeAED ?? ""} onChange={(e) => set("entryFeeAED", parseInt(e.target.value.replace(/\D/g, "")) || 0)} /></label>
        <label className="frow"><span>{t("currency")}</span><input className="select sm" value={s.currency ?? ""} onChange={(e) => set("currency", e.target.value)} /></label>
        <label className="frow"><span>{t("distribution")}</span>
          <select className="select sm" value={s.distribution || "winnerTakesAll"} onChange={(e) => set("distribution", e.target.value)}>
            <option value="winnerTakesAll">{t("winnerTakes")}</option><option value="split2">{t("topTwo")}</option><option value="split3">{t("topThree")}</option>
          </select>
        </label>
        <label className="frow"><span>{t("deadline")}</span><input className="select sm" type="date" value={s.deadline || ""} onChange={(e) => set("deadline", e.target.value)} /></label>
        <label className="frow"><span>{t("lockPicks")}</span><input type="checkbox" checked={!!s.locked} onChange={(e) => set("locked", e.target.checked)} /></label>
      </div>
      <TimezoneCheck tz={tz} t={t} />
      <div className="card poolcard"><div className="hint">{t("prizePool")}</div><div className="poolv num">{pool.toLocaleString("en-US")} {s.currency || "AED"}</div></div>
    </div>
  );
}
// Admin diagnostic: confirms what timezone the app displays in vs the device.
function TimezoneCheck({ tz, t }) {
  const now = Date.now();
  const inTz = (zone) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone }).format(new Date(now));
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const match = deviceTz === tz;
  return (
    <div className="card">
      <h3 className="cardh">🕒 {t("tzCheck")}</h3>
      <div className="hrow"><span className="hlabel">{t("tzApp")}</span><span className="hval">{tz}</span></div>
      <div className="hrow"><span className="hlabel">{t("tzAppNow")}</span><span className="hval num">{inTz(tz)}</span></div>
      <div className="hrow"><span className={"hdot " + (match ? "ok" : "bad")}>{match ? "✓" : "!"}</span><span className="hlabel">{t("tzDevice")}</span><span className="hval">{deviceTz}</span></div>
      <div className="hrow"><span className="hlabel">{t("tzDeviceNow")}</span><span className="hval num">{inTz(deviceTz)}</span></div>
      {!match && <div className="hint block">{t("tzNote")}</div>}
    </div>
  );
}
function Backup({ data, setData, t }) {
  const exportObj = useMemo(() => ({
    players: data.players, settings: data.settings, champion: data.championOverride || null,
    scores: (data.matches || []).filter((m) => m.adminLocked).map((m) => ({ id: m.id, h: m.finalH, a: m.finalA })),
  }), [data]);
  const json = JSON.stringify(exportObj, null, 2);
  const [imp, setImp] = useState(""); const [msg, setMsg] = useState("");
  const copy = () => { navigator.clipboard?.writeText(json).then(() => setMsg(t("copied"))).catch(() => setMsg("…")); };
  const load = () => {
    try {
      const o = JSON.parse(imp);
      if (o.players && (typeof o.players !== "object" || Array.isArray(o.players) || Object.keys(o.players).length === 0)) throw new Error("players");
      setData((d) => {
        let matches = d.matches;
        if (Array.isArray(o.scores)) {
          const map = Object.fromEntries(o.scores.map((s) => [s.id, s]));
          matches = d.matches.map((m) => {
            const s = map[m.id]; if (!s) return m;
            if (m.stage === "ko" && Number(s.h) === Number(s.a)) return m; // skip invalid KO draw
            return applyAdminScore(m, Number(s.h) || 0, Number(s.a) || 0);
          });
        }
        const nd = recomputeLive({ ...d, players: o.players || d.players, settings: o.settings || d.settings, championOverride: o.champion ?? d.championOverride, matches });
        persistLive(nd);
        return nd;
      });
      setMsg(t("loaded"));
    } catch (e) { setMsg(t("badJson")); }
  };
  return (
    <div className="view">
      <div className="card"><h3 className="cardh"><Ico name="backup" size={18} /> {t("exportData")} <button className="seeall" onClick={copy}>{t("copy")} {msg && `· ${msg}`}</button></h3>
        <textarea className="jsonbox" readOnly value={json} />
      </div>
      <div className="card"><h3 className="cardh">{t("importData")}</h3>
        <textarea className="jsonbox" placeholder={t("pasteJson")} value={imp} onChange={(e) => setImp(e.target.value)} />
        <button className="btn" onClick={load}>{t("load")}</button>
      </div>
    </div>
  );
}
function Health({ data, lb, t }) {
  const players = Object.keys(data.players);
  const incompletePreds = players.filter((n) => GROUP_KEYS.some((g) => playerGroupPred(data.players[n], g).length < 4));
  const noChamp = players.filter((n) => !data.players[n].champion);
  const finished = (data.matches || []).filter((m) => m.status === "finished" && m.finalH != null && m.finalA != null).length;
  const total = (data.matches || []).length;
  const groupsDone = GROUP_KEYS.filter((g) => groupComplete(g, data)).length;
  const checks = [
    { ok: players.length > 0, label: t("hPlayers"), val: players.length },
    { ok: incompletePreds.length === 0, label: t("hPreds"), val: incompletePreds.length === 0 ? "✓" : incompletePreds.join(", ") },
    { ok: noChamp.length === 0, label: t("hChamp"), val: noChamp.length === 0 ? "✓" : noChamp.join(", ") },
    { ok: true, label: t("hMatches"), val: `${finished}/${total}` },
    { ok: true, label: t("hGroups"), val: `${groupsDone}/12` },
    { ok: lb.every((r) => {
        const fromDetail = r.detail.matches.reduce((s, m) => s + m.got, 0)
          + r.detail.ranking.reduce((s, x) => s + x.got, 0)
          + r.detail.knockout.reduce((s, k) => s + k.got, 0)
          + (r.detail.champion ? r.detail.champion.got : 0);
        return fromDetail === r.total && r.groupMatch + r.groupRank + r.knockout + r.champ === r.total;
      }), label: t("hEngine"), val: "✓" },
  ];
  return (
    <div className="view">
      <div className="card"><h3 className="cardh"><Ico name="health" size={18} /> {t("nav_health")}</h3>
        {checks.map((c, i) => (
          <div className="hrow" key={i}><span className={"hdot " + (c.ok ? "ok" : "bad")}>{c.ok ? "✓" : "!"}</span><span className="hlabel">{c.label}</span><span className="hval num">{c.val}</span></div>
        ))}
      </div>
    </div>
  );
}
function AuditLog({ data, t }) {
  const log = data.auditLog || [];
  return (
    <div className="view">
      <div className="card"><h3 className="cardh"><Ico name="search" size={18} /> {t("nav_audit")}</h3>
        {log.length === 0 && <div className="empty sm">{t("noChanges")}</div>}
        {log.map((e, i) => (
          <div className="logrow" key={i}><span className="logtime num">{new Date(e.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span><span className="logmsg">{e.msg}</span></div>
        ))}
      </div>
    </div>
  );
}
function Repair({ data, setData, t }) {
  const [msg, setMsg] = useState("");
  const run = () => {
    let fixed = 0;
    setData((d) => {
      const players = { ...d.players };
      Object.keys(players).forEach((n) => { if (!players[n].knockout) { players[n] = { ...players[n], knockout: {} }; fixed++; } });
      const settings = { entryFeeAED: 200, currency: "AED", distribution: "winnerTakesAll", ...d.settings };
      const nd = recomputeLive({ ...d, players, settings }); persistLive(nd); return nd;
    });
    setMsg(t("repairDone"));
  };
  return (
    <div className="view">
      <div className="card"><h3 className="cardh"><Ico name="tools" size={18} /> {t("nav_repair")}</h3>
        <p className="hint block">{t("repairHint")}</p>
        <button className="btn" onClick={run}>{t("runRepair")}</button>
        {msg && <div className="al-ok">{msg}</div>}
      </div>
    </div>
  );
}
function SyncResults({ data, setData, t }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const run = async () => {
    setBusy(true); setReport(null);
    try {
      const key = data.settings && data.settings.sportsdbKey;
      const today = new Date().toISOString().slice(0, 10);
      const results = await fetchResultsRange(key, "2026-06-11", today);
      const status = getFeedStatus();
      // Map to canonical fixtures, orient, dedupe by matchKey, build normalized rows.
      const byKey = {};
      results.forEach((r) => {
        if (r.homeScore == null || r.awayScore == null) return;
        const m = resolveRRByTeams(null, r.home, r.away); if (!m) return;
        let hs = r.homeScore, as = r.awayScore; if (m.reversed) { const tmp = hs; hs = as; as = tmp; }
        const [g, iStr] = m.key.split("_"); const i = Number(iStr);
        const [home, away] = matchTeams(g, i);
        byKey[m.key] = { match_key: m.key, group_key: g, match_idx: i, home_team: home, away_team: away, home_score: Number(hs), away_score: Number(as), status: "final", source: "api" };
      });
      const rows = Object.values(byKey), filled = Object.keys(byKey);
      let saved = 0;
      if (rows.length) { try { await upsertResults(rows); saved = rows.length; } catch (e) { /* surfaced below */ } }
      // Re-derive locally so results show immediately, and persist the blob too.
      setData((d) => {
        const gr = { ...d.groupResults };
        rows.forEach((row) => { gr[row.match_key] = { home: String(row.home_score), away: String(row.away_score) }; });
        const matches = d.matches.map((mm) => { if (mm.stage !== "group") return mm; const res = gr[mm.id]; return res ? { ...mm, finalH: Number(res.home), finalA: Number(res.away) } : mm; });
        const nd = recomputeLive({ ...d, groupResults: gr, matches });
        persistLive(nd);
        return nd;
      });
      // which finished/over matches still have no score?
      const missing = (data.matches || []).filter((mm) => mm.stage === "group" && (mm.finalH == null || mm.finalA == null) && !filled.includes(mm.id) && mm.ko && mm.ko <= Date.now())
        .map((mm) => `${canonTeam(mm.home)} v ${canonTeam(mm.away)}`);
      setReport({ mode: status.mode, events: status.events, completed: status.completed, mapped: rows.length, saved, missing });
    } catch (e) { setReport({ error: String(e && e.message ? e.message : e) }); }
    setBusy(false);
  };
  const modeOk = report && /direct|proxy/.test(report.mode || "");
  return (
    <div className="view">
      <div className="card"><h3 className="cardh"><Ico name="sync" size={18} /> {t("nav_sync")}</h3>
        <p className="hint block">{t("syncHint2")}</p>
        <button className="btn" onClick={run} disabled={busy}>{busy ? t("syncing") : t("syncNow")}</button>
      </div>
      {report && (
        <div className="card">
          <div className="hrow"><span className={"hdot " + (modeOk ? "ok" : "bad")}>{modeOk ? "✓" : "!"}</span><span className="hlabel">{t("feedReach")}</span><span className="hval">{report.error ? "—" : report.mode}</span></div>
          {!report.error && <>
            <div className="hrow"><span className="hlabel">{t("feedEvents")}</span><span className="hval num">{report.events}</span></div>
            <div className="hrow"><span className="hlabel">{t("feedCompleted")}</span><span className="hval num">{report.completed}</span></div>
            <div className="hrow"><span className="hlabel">{t("feedSaved")}</span><span className="hval num">{report.saved}</span></div>
            {report.missing && report.missing.length > 0 && (
              <div className="ag-section" style={{ marginTop: 8 }}>{t("feedMissing")} ({report.missing.length})
                <div className="hint block" style={{ marginTop: 4 }}>{report.missing.slice(0, 12).join(" · ")}</div>
              </div>
            )}
          </>}
          {report.error && <div className="al-err">{report.error}</div>}
        </div>
      )}
    </div>
  );
}
function PlayerPicks({ data, lb, t, name, setName }) {
  const row = lb.find((r) => r.name === name) || lb[0];
  const p = data.players[row.name];
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh"><Ico name="bracket" size={18} /> {t("nav_playerpicks")}</h3>
        <select className="select" value={row.name} onChange={(e) => setName(e.target.value)}>{lb.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}</select>
      </div>
      <div className="card"><h3 className="cardh">{t("champPick")}: <span className="fl">{flagOf(p.champion)}</span> {canonTeam(p.champion)}</h3>
        <div className="ppreds">
          {GROUP_KEYS.map((g) => (
            <div className="ppred" key={g}><div className="ppredg">{t("group")} {g}</div>
              {playerGroupPred(p, g).map((tm, i) => <div className="ppline" key={i}><span className="ppos num">{i + 1}</span><Team t={tm} /></div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function PlayerReport({ data, lb, t }) {
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh"><Ico name="chart" size={18} /> {t("nav_playerreport")}</h3><p className="hint block">{t("reportHint")}</p></div>
      <div className="card nopad">
        <div className="pgrid-scroll">
          <table className="pgrid">
            <thead><tr><th className="sticky">{t("player")}</th><th>{t("rank")}</th><th>{t("groupMatch")}</th><th>{t("groupRank")}</th><th>{t("knockout")}</th><th>{t("champion")}</th><th>{t("points")}</th></tr></thead>
            <tbody>
              {lb.map((r) => (
                <tr key={r.name}><td className="sticky pgname"><Avatar name={r.name} /><span>{r.name}</span></td>
                  <td className="num">{r.rank}</td><td className="num">{r.groupMatch}</td><td className="num">{r.groupRank}</td><td className="num">{r.knockout}</td><td className="num">{r.champ}</td><td className="num"><b>{r.total}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 9. Shell -------------------------------------------- */
const NAV = [
  { id: "home", ic: "home", key: "nav_home" },
  { id: "today", ic: "calendar", key: "nav_today" },
  { id: "table", ic: "trophy", key: "nav_table" },
  { id: "groups", ic: "groups", key: "nav_groups" },
  { id: "more", ic: "menu", key: "nav_more" },
];
const MORE_ITEMS = [
  { id: "points", ic: "prediction", key: "nav_points" },
  { id: "bracket", ic: "bracket", key: "nav_bracket" },
  { id: "profile", ic: "profile", key: "nav_profile" },
  { id: "predictions", ic: "prediction", key: "nav_predictions" },
  { id: "consensus", ic: "users", key: "nav_consensus" },
  { id: "trends", ic: "chart", key: "nav_trends" },
  { id: "scorers", ic: "ball", key: "nav_scorers" },
  { id: "help", ic: "help", key: "nav_help" },
];
const ADMIN_ITEMS = [
  { id: "results", ic: "edit", key: "nav_results" },
  { id: "playerpicks", ic: "bracket", key: "nav_playerpicks" },
  { id: "playerreport", ic: "chart", key: "nav_playerreport" },
  { id: "audit", ic: "search", key: "nav_audit" },
  { id: "backup", ic: "backup", key: "nav_backup" },
  { id: "health", ic: "health", key: "nav_health" },
  { id: "syncresults", ic: "sync", key: "nav_sync" },
  { id: "repair", ic: "tools", key: "nav_repair" },
  { id: "settings", ic: "settings", key: "nav_settings" },
];
export default function App() {
  const [lang, setLang] = useState("en");
  const [dark, setDark] = useState(false);
  const [view, setView] = useState("home");
  const [profileName, setProfileName] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [match, setMatch] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState(null);
  const [source, setSource] = useState("loading"); // 'live' | 'sample' | 'loading'
  const [, setNow] = useState(nowMs());
  // Boot: try real Supabase data; on any failure fall back to the sample demo.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { blob, resultRows } = await loadFromSupabase();
        if (!alive) return;
        setLiveMode(true);
        const key = blob.settings && blob.settings.sportsdbKey;
        let apiResults = []; try { apiResults = await fetchCompletedResults(key); } catch (e) { apiResults = []; }
        const real = mapBlobToData(blob, resultRows, apiResults);
        setAppTz(real.settings && real.settings.tz);
        try { real._live = mapLiveEvents(await fetchLivescore(key)); } catch (e) { real._live = {}; }
        if (!alive) return;
        setData(recomputeLive(real, nowMs())); setSource("live");
      } catch (e) {
        if (!alive) return;
        setLiveMode(false); setData(buildSampleData()); setSource("sample");
      }
    })();
    return () => { alive = false; };
  }, []);
  // Tick: live mode polls Supabase for fresh results; sample mode advances the
  // synthetic clock. Either way the whole view is re-derived reactively.
  useEffect(() => {
    if (source === "loading") return;
    const live = source === "live";
    const id = setInterval(async () => {
      tickClock();
      if (live) {
        try {
          const { blob, resultRows } = await loadFromSupabase();
          const key = blob.settings && blob.settings.sportsdbKey;
          let apiResults = []; try { apiResults = await fetchCompletedResults(key); } catch (e) { apiResults = []; }
          const real = mapBlobToData(blob, resultRows, apiResults);
          setAppTz(real.settings && real.settings.tz);
          try { real._live = mapLiveEvents(await fetchLivescore(key)); } catch (e) { real._live = {}; }
          setData(recomputeLive(real, nowMs()));
        } catch (e) { setData((d) => (d ? recomputeLive(d, nowMs()) : d)); }
      } else setData((d) => (d ? recomputeLive(d, nowMs()) : d));
      setNow(nowMs());
    }, live ? 30000 : 10000);
    return () => clearInterval(id);
  }, [source]);
  const lb = useMemo(() => (data ? buildLeaderboard(data) : []), [data]);
  // Real rank movement: compare each leaderboard snapshot to the previous one.
  const prevRanksRef = useRef({});
  const [prevRanks, setPrevRanks] = useState({});
  useEffect(() => {
    const cur = {}; lb.forEach((r) => (cur[r.name] = r.rank));
    setPrevRanks(prevRanksRef.current);
    prevRanksRef.current = cur;
  }, [lb]);
  const t = (k) => I18N[lang][k] ?? k;
  const dir = I18N[lang].dir;
  // Keep the document root in sync for correct RTL / language behaviour.
  useEffect(() => { document.documentElement.dir = dir; document.documentElement.lang = lang; }, [dir, lang]);
  useEffect(() => { if (!profileName && lb[0]) setProfileName(lb[0].name); }, [lb, profileName]);
  const go = (v, name) => { if (v === "more") { setSheet(true); return; } if (name) setProfileName(name); setSheet(false); setMatch(null); setView(v); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openMatch = (m) => { setMatch(m); setView("match"); window.scrollTo({ top: 0, behavior: "smooth" }); };

  if (!data) {
    return (
      <div dir={dir} data-theme={dark ? "dark" : "light"} className="app">
        <style>{CSS}</style>
        <div className="splash"><span className="branddot" /> {t("loadingData")}</div>
      </div>
    );
  }

  return (
    <div dir={dir} data-theme={dark ? "dark" : "light"} className="app">
      <style>{CSS}</style>
      <header className="top">
        <div className="brand"><span className="branddot" /> {t("brand")}</div>
        <span className="grow" />
        <span className={"badge" + (source === "live" ? " live" : "")}>{source === "live" ? t("liveData") : t("sample")}</span>
        <button className="tbtn" onClick={() => setDark((d) => !d)}>{dark ? "☀" : "☾"}</button>
        <button className="tbtn" onClick={() => setLang((l) => (l === "en" ? "ar" : "en"))}>{lang === "en" ? "ع" : "EN"}</button>
      </header>

      <main className="main">
        {view === "home" && <Dashboard data={data} lb={lb} lang={lang} onOpen={openMatch} t={t} go={go} />}
        {view === "today" && <MatchCenter data={data} lang={lang} onOpen={openMatch} t={t} />}
        {view === "match" && match && <MatchDetail m={(data.matches || []).find((x) => x.id === match.id) || match} data={data} lang={lang} t={t} onBack={() => go("today")} />}
        {view === "table" && <Leaderboard lb={lb} prevRanks={prevRanks} t={t} go={go} />}
        {view === "groups" && <Groups data={data} t={t} />}
        {view === "bracket" && <BracketView data={data} t={t} />}
        {view === "predictions" && <Predictions data={data} lb={lb} t={t} go={go} />}
        {view === "points" && <Points data={data} lb={lb} t={t} name={profileName} setName={setProfileName} />}
        {view === "consensus" && <Consensus data={data} t={t} />}
        {view === "trends" && <Trends data={data} lb={lb} t={t} />}
        {view === "scorers" && <Scorers data={data} t={t} />}
        {view === "profile" && <Profile data={data} lb={lb} name={profileName} setName={setProfileName} t={t} />}
        {view === "help" && <Help t={t} />}
        {/* admin */}
        {view === "adminlogin" && <AdminLogin onAuth={() => { setIsAdmin(true); go("results"); }} t={t} />}
        {view === "results" && (isAdmin ? <Results data={data} setData={setData} t={t} lang={lang} /> : <AdminLogin onAuth={() => { setIsAdmin(true); go("results"); }} t={t} />)}
        {view === "settings" && isAdmin && <AdminSettings data={data} setData={setData} t={t} />}
        {view === "backup" && isAdmin && <Backup data={data} setData={setData} t={t} />}
        {view === "health" && isAdmin && <Health data={data} lb={lb} t={t} />}
        {view === "audit" && isAdmin && <AuditLog data={data} t={t} />}
        {view === "repair" && isAdmin && <Repair data={data} setData={setData} t={t} />}
        {view === "syncresults" && isAdmin && <SyncResults data={data} setData={setData} t={t} />}
        {view === "playerpicks" && isAdmin && <PlayerPicks data={data} lb={lb} t={t} name={profileName} setName={setProfileName} />}
        {view === "playerreport" && isAdmin && <PlayerReport data={data} lb={lb} t={t} />}
      </main>

      {sheet && (
        <div className="sheetbg" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div className="sheet">
            <div className="grab" />
            <div className="sheeth">{t("nav_more")}</div>
            <div className="sheetgrid">
              {MORE_ITEMS.map((m) => (
                <button key={m.id} className={"tile" + (view === m.id ? " on" : "")} onClick={() => go(m.id)}>
                  <span className="tilei"><Ico name={m.ic} size={22} /></span><span className="tilel">{t(m.key)}</span>
                </button>
              ))}
            </div>
            <div className="sheeth admin">{t("admin")} {isAdmin && <button className="logoutbtn" onClick={() => { setIsAdmin(false); go("home"); }}><Ico name="logout" size={15} /> {t("logout")}</button>}</div>
            {!isAdmin ? (
              <div className="sheetgrid">
                <button className="tile" onClick={() => go("adminlogin")}><span className="tilei"><Ico name="lock" size={22} /></span><span className="tilel">{t("adminLogin")}</span></button>
              </div>
            ) : (
              <div className="sheetgrid">
                {ADMIN_ITEMS.map((m) => (
                  <button key={m.id} className={"tile" + (view === m.id ? " on" : "")} onClick={() => go(m.id)}>
                    <span className="tilei"><Ico name={m.ic} size={22} /></span><span className="tilel">{t(m.key)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="bottom">
        {NAV.map((n) => {
          const adminViews = ADMIN_ITEMS.map((a) => a.id).concat("adminlogin");
          const active = view === n.id || (n.id === "today" && view === "match") || (n.id === "more" && (sheet || MORE_ITEMS.some((m) => m.id === view) || adminViews.includes(view)));
          return (
            <button key={n.id} className={"navbtn" + (active ? " on" : "")} onClick={() => go(n.id)}>
              <span className="navi"><Ico name={n.ic} size={22} /></span><span className="navl">{t(n.key)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ---------------- 10. Styles (design tokens from original) ------------- */
const CSS = `
.app{--pitch:#0a1f17;--pitch2:#10362a;--grass:#19c37d;--grass-d:#0f9d63;--gold:#f5c451;--gold-d:#caa033;
--ink:#0c1512;--paper:#f3f6f4;--card:#fff;--muted:#5f7068;--soft:#eef2f0;--border:#dde6e2;--pos:#19a96b;--neg:#e2574c;
--num:"SF Mono",ui-monospace,"Roboto Mono",Menlo,Consolas,monospace;
--sans:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,"Noto Sans Arabic",sans-serif;
font-family:var(--sans);background:var(--paper);color:var(--ink);min-height:100vh;line-height:1.45;
max-width:520px;margin:0 auto;position:relative;padding-bottom:78px;-webkit-font-smoothing:antialiased;}
.app[data-theme="dark"]{--paper:#0b1713;--card:#11211b;--ink:#eaf3ee;--muted:#8aa399;--soft:#16271f;--border:#22382e;}
.app *{box-sizing:border-box}
.num{font-family:var(--num);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.muted{color:var(--muted)}.hint{color:var(--muted);font-size:11.5px;font-weight:500}
.hint.block{display:block;margin-top:4px}.grow{flex:1}.pos{color:var(--pos)}.neg{color:var(--neg)}

.top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:8px;padding:12px 14px;
background:var(--pitch);color:#fff;box-shadow:0 2px 12px rgba(10,31,23,.18)}
.brand{font-weight:800;font-size:15px;display:flex;align-items:center;gap:8px;letter-spacing:.2px}
.branddot{width:9px;height:9px;border-radius:50%;background:var(--grass);box-shadow:0 0 0 4px rgba(25,195,125,.28)}
.badge{font-size:9.5px;font-weight:700;padding:3px 7px;border-radius:99px;background:rgba(255,255,255,.13);color:#cdeee0}
.badge.live{background:rgba(25,195,125,.22);color:#7ef0c0}
.badge.live::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#19c37d;margin-inline-end:5px;vertical-align:middle;animation:blink 1.6s infinite}
.splash{min-height:60vh;display:flex;align-items:center;justify-content:center;gap:10px;color:var(--muted);font-weight:700;font-size:14px}
.tbtn{min-width:34px;height:30px;border:none;border-radius:99px;background:rgba(255,255,255,.14);color:#fff;font-weight:800;font-size:13px;cursor:pointer}
.tbtn:active{transform:scale(.94)}

.main{padding:12px 12px 0}.view{animation:viewIn .35s ease both}
@keyframes viewIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;margin:12px 0;
box-shadow:0 2px 10px rgba(10,31,23,.06);animation:cardIn .4s ease both}
.card.slim{padding:12px 14px}.card.empty,.empty{color:var(--muted);text-align:center;padding:22px;font-size:13px}
.empty.sm{padding:8px}
@keyframes cardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.cardh{font-size:14px;font-weight:800;margin:0 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cardh .hint{font-weight:500}

.team{display:inline-flex;align-items:center;gap:7px;min-width:0}
.team .fl{font-size:17px;line-height:1}.team .tn{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.team.dim{opacity:.45}.ava{width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
color:#fff;font-weight:800;font-size:12px;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}
.mv{font-family:var(--num);font-size:11px;font-weight:800;margin-inline-start:6px}
.mv.up{color:var(--pos)}.mv.dn{color:var(--neg)}.mv.eq{color:var(--muted)}

/* hero */
.hero{position:relative;overflow:hidden;border-radius:18px;padding:18px;color:#fff;margin:12px 0;
background:linear-gradient(150deg,var(--pitch2),var(--pitch))}
.hero-bg{position:absolute;inset:0;opacity:.5;background:
radial-gradient(120px 120px at 85% -10%,rgba(25,195,125,.35),transparent),
repeating-linear-gradient(90deg,transparent 0 38px,rgba(255,255,255,.03) 38px 39px)}
.hero-eyebrow,.hero-phase,.hero-leader,.hero-stats{position:relative}
.hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#9fe7c8}
.hero-phase{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;margin-top:4px;color:#d7f5e6}
.hero-phase .dot{width:7px;height:7px;border-radius:50%;background:var(--gold);animation:pulse 1.8s infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(245,196,81,.5)}50%{box-shadow:0 0 0 6px rgba(245,196,81,0)}}
.hero-leader{display:flex;align-items:center;gap:12px;margin:14px 0;cursor:pointer;padding:10px;border-radius:14px;
background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)}
.hero-leadlbl{font-size:10px;color:#9fe7c8;text-transform:uppercase;letter-spacing:.5px;font-weight:700}
.hero-leadname{font-size:18px;font-weight:800}.hero-leader .grow{flex:1}
.hero-leadpts{margin-inline-start:auto;font-size:30px;font-weight:800;font-family:var(--num);color:var(--gold);display:flex;align-items:baseline;gap:4px}
.hero-leadunit{font-size:11px;color:#d7f5e6;font-family:var(--sans);font-weight:600}
.hero-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.hstat{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;text-align:center}
.hstat.gold{background:linear-gradient(160deg,rgba(245,196,81,.22),rgba(245,196,81,.08));border-color:rgba(245,196,81,.3)}
.hv{font-family:var(--num);font-size:22px;font-weight:800;color:#fff}.hstat.gold .hv{color:var(--gold)}
.hl{font-size:10px;color:#cdeee0;margin-top:2px}

/* leaderboard bars */
.lb{display:flex;flex-direction:column;gap:8px}
.lbrow{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:12px;background:var(--card);
border:1px solid var(--border);width:100%;cursor:pointer;text-align:start;animation:rowIn .4s ease both}
@keyframes rowIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
.lbrow:active{transform:scale(.99)}.lbrow.first{border-color:var(--gold);background:linear-gradient(110deg,var(--card),rgba(245,196,81,.08))}
.lbrank{width:26px;text-align:center;font-size:16px;font-weight:800;color:var(--muted)}
.lbmain{flex:1;min-width:0}.lbname{font-weight:700;font-size:13px;display:flex;align-items:center}
.lbtrack{display:block;height:7px;border-radius:99px;background:var(--soft);margin-top:5px;overflow:hidden}
.lbfill{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--grass-d),var(--grass));transition:width 1s cubic-bezier(.2,.8,.2,1)}
.lbrow.first .lbfill{background:linear-gradient(90deg,var(--gold-d),var(--gold))}
.lbpts{font-size:17px;font-weight:800;color:var(--pitch);min-width:34px;text-align:end}
.app[data-theme="dark"] .lbpts{color:var(--grass)}

/* podium */
.podium{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:end;gap:10px;padding:8px 4px 0}
.pod{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;animation:podIn .5s ease both}
@keyframes podIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.podmedal{font-size:22px}.podname{font-size:12px;font-weight:700}.podpts{font-size:18px;font-weight:800;color:var(--gold-d)}
.podstand{width:72px;border-radius:10px 10px 0 0;background:linear-gradient(180deg,var(--pitch2),var(--pitch));margin-top:2px}
.pod.p1 .podstand{background:linear-gradient(180deg,var(--gold),var(--gold-d))}

/* movers */
.mvrow{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border);cursor:pointer}
.mvrow:last-child{border:none}.mvname{font-weight:700;font-size:13px}.mvrow .grow{flex:1}
.mvpts{margin-inline-start:auto;font-weight:800;font-size:15px}

/* groups */
.gwrap{display:grid;grid-template-columns:1fr;gap:0}
@media(min-width:460px){.gwrap{grid-template-columns:1fr 1fr;gap:10px}}
.gcard{margin:10px 0}.gtitle{margin-bottom:8px}
.gbadge{display:inline-block;font-size:11px;font-weight:800;color:#fff;background:var(--pitch2);padding:3px 10px;border-radius:99px}
.grows{display:flex;flex-direction:column;gap:6px}
.grow{display:flex;align-items:center;gap:8px;padding:4px 0}
.grow.qual .gteam .tn{font-weight:800}.grow.qual{position:relative}
.grow.qual::before{content:"";position:absolute;inset-inline-start:-6px;top:6px;bottom:6px;width:3px;border-radius:2px;background:var(--grass)}
.gpos{width:16px;text-align:center;color:var(--muted);font-size:12px;font-weight:700}
.gteam{flex:1;min-width:0}.gbar{width:54px;height:6px;border-radius:99px;background:var(--soft);overflow:hidden;flex:none}
.gbarfill{display:block;height:100%;background:var(--grass);border-radius:99px;transition:width .9s cubic-bezier(.2,.8,.2,1)}
.gpts{width:22px;text-align:end;font-weight:800;font-size:13px}
.gstat,.gstatrow{display:grid;grid-template-columns:repeat(5,1fr);gap:2px;text-align:center;font-size:10.5px}
.gstat{margin-top:10px;color:var(--muted);font-weight:700;border-top:1px solid var(--border);padding-top:6px}
.gstatrow{padding:2px 0;color:var(--ink)}

/* bracket */
.brk-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 2px 12px;margin:0 -12px;padding-inline:12px}
.brk{display:flex;gap:14px;min-width:max-content;align-items:flex-start}
.brk-col{display:flex;flex-direction:column;padding-top:22px;position:relative}
.brk-rlabel{position:absolute;top:0;inset-inline-start:0;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.brk-tie{position:relative;background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;width:130px;box-shadow:0 1px 4px rgba(10,31,23,.05)}
.brk-tie.decided{border-color:var(--grass-d)}
@keyframes tieIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
.brk-slot{display:flex;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border)}
.brk-slot:last-child{border-bottom:none}
.brk-slot .tn{font-size:11.5px}.brk-slot.win{background:rgba(25,195,125,.12)}.brk-slot.win .tn{font-weight:800}
.brk-slot.lose{opacity:.5}
.brk-conn{position:absolute;inset-inline-end:-14px;top:50%;width:14px;height:2px;background:var(--border)}
.brk-tie.decided .brk-conn{background:var(--grass)}
.brk-col.trophy{justify-content:center;align-items:center;padding-top:22px}
.brk-trophy{font-size:34px;margin-top:20px;animation:float 2.4s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

/* breakdown */
.bd{display:flex;flex-direction:column;gap:10px}
.bdbar{display:flex;height:14px;border-radius:99px;overflow:hidden;background:var(--soft)}
.bdseg{height:100%;transition:width 1s cubic-bezier(.2,.8,.2,1)}
.bdleg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bditem{display:flex;align-items:center;gap:6px;font-size:12px}.bditem b{margin-inline-start:auto}
.bddot{width:9px;height:9px;border-radius:3px;flex:none}

/* profile */
.psel{margin-bottom:12px}.select{width:100%;margin-top:4px;padding:9px 10px;border-radius:10px;border:1px solid var(--border);
background:var(--card);color:var(--ink);font-family:inherit;font-size:13px;font-weight:600}
.phead{display:flex;align-items:center;gap:12px}.pheadtxt{flex:1;min-width:0}
.pname{font-size:17px;font-weight:800}.ptotal{margin-inline-start:auto;font-family:var(--num);font-size:26px;font-weight:800;color:var(--gold-d);display:flex;flex-direction:column;align-items:end;line-height:1}
.ptotal .hint{font-family:var(--sans)}
.ppreds{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ppred{border:1px solid var(--border);border-radius:12px;padding:8px}
.ppredg{font-size:11px;font-weight:800;color:var(--pitch2);margin-bottom:6px}
.ppline{display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;position:relative}
.ppos{width:14px;color:var(--muted);font-weight:700}
.ppline.exact{color:var(--ink)}.ppline.exact .tn{font-weight:800}
.ppt{margin-inline-start:auto;font-family:var(--num);font-weight:800;font-size:11px;color:var(--pos)}
.ppt.sm{color:var(--grass-d);opacity:.8}
.app[data-theme="dark"] .ppredg{color:var(--grass)}

/* rules */
.rule{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)}
.rule:last-child{border:none}.rulee{font-size:18px}.rulet{flex:1;font-size:12.5px}
.rulep{font-family:var(--num);font-weight:800;color:var(--grass-d)}
.korules{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.korule{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--soft);border-radius:10px;font-size:12px;font-weight:600}
.korule b{color:var(--gold-d)}

/* bottom nav */
.bottom{position:fixed;bottom:0;left:0;right:0;max-width:520px;margin:0 auto;display:flex;
background:var(--card);border-top:1px solid var(--border);padding:6px 4px;z-index:30;
box-shadow:0 -2px 14px rgba(10,31,23,.07)}
.navbtn{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;border:none;background:none;
color:var(--muted);font-family:inherit;cursor:pointer;padding:5px 0;border-radius:10px;transition:color .2s}
.navbtn .navi{font-size:18px;line-height:1}.navbtn .navl{font-size:10px;font-weight:700}
.navbtn.on{color:var(--grass-d)}.app[data-theme="dark"] .navbtn.on{color:var(--grass)}
.navbtn.on .navi{transform:translateY(-1px)}

/* more sheet */
.sheetbg{position:fixed;inset:0;z-index:40;background:rgba(8,18,14,.5);display:flex;align-items:flex-end;justify-content:center;animation:fade .2s ease}
@keyframes fade{from{opacity:0}to{opacity:1}}
.sheet{width:100%;max-width:520px;background:var(--card);border-radius:20px 20px 0 0;padding:8px 14px calc(20px + env(safe-area-inset-bottom));
border:1px solid var(--border);box-shadow:0 -10px 40px rgba(10,31,23,.25);animation:slideup .28s cubic-bezier(.2,.8,.2,1)}
@keyframes slideup{from{transform:translateY(100%)}to{transform:none}}
.grab{width:38px;height:4px;border-radius:99px;background:var(--border);margin:6px auto 12px}
.sheeth{font-weight:800;font-size:14px;margin:0 4px 12px}
.sheetgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.tile{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 6px;border-radius:14px;border:1px solid var(--border);
background:var(--soft);color:var(--ink);cursor:pointer;font-family:inherit}
.tile:active{transform:scale(.96)}.tile.on{border-color:var(--grass);background:rgba(25,195,125,.1)}
.tilei{font-size:22px}.tilel{font-size:11px;font-weight:700}

/* matches */
.card.nopad{padding:0;overflow:hidden}
.mrow{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid var(--border)}
.mrow:last-child{border:none}.mrow.ko{grid-template-columns:1fr auto 1fr}
.mmd{position:absolute;font-size:9px;font-weight:800;color:var(--muted)}
.mside{display:flex;align-items:center;min-width:0}.mside.end{justify-content:flex-end}
.mside.end .team{flex-direction:row-reverse}.mside.win .tn{font-weight:800;color:var(--grass-d)}
.mscore{font-weight:800;font-size:14px;background:var(--soft);padding:3px 9px;border-radius:7px;min-width:46px;text-align:center}
.mvs{font-size:10px;color:var(--muted);font-weight:700;padding:0 6px}
.mko{margin-bottom:10px}.mko-r{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:6px 0 2px}
.app[data-theme="dark"] .mside.win .tn{color:var(--grass)}

/* predictions grid */
.pgrid-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.pgrid{border-collapse:collapse;width:100%;font-size:12px}
.pgrid th,.pgrid td{padding:7px 6px;text-align:center;border-bottom:1px solid var(--border);white-space:nowrap}
.pgrid th{font-size:10px;font-weight:800;color:var(--muted);background:var(--soft)}
.pgrid td{font-size:16px;cursor:pointer}
.pgrid tbody tr:active{background:var(--soft)}
.pgrid .sticky{position:sticky;inset-inline-start:0;background:var(--card);z-index:2;text-align:start}
.pgrid th.sticky{background:var(--soft)}
.pgname{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;min-width:96px}
.pgname .ava{width:24px;height:24px;font-size:9px}
.pgrid td.hit{background:rgba(25,195,125,.14);border-radius:6px}
.pgrid .champcol{background:rgba(245,196,81,.08)}
.pglegend{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted);padding:10px 12px}
.pgdot{width:11px;height:11px;border-radius:4px;display:inline-block}.pgdot.hit{background:rgba(25,195,125,.5)}

/* consensus bars */
.cbars{display:flex;flex-direction:column;gap:9px}
.cbar{display:flex;align-items:center;gap:10px;animation:rowIn .4s ease both}
.cbteam{width:120px;flex:none;min-width:0}
.cbtrack{flex:1;height:10px;border-radius:99px;background:var(--soft);overflow:hidden}
.cbfill{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--grass-d),var(--grass));transition:width 1s cubic-bezier(.2,.8,.2,1)}
.cbfill.gold{background:linear-gradient(90deg,var(--gold-d),var(--gold))}
.cbcount{width:24px;text-align:end;font-weight:800;font-size:14px}
.cwgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(min-width:460px){.cwgrid{grid-template-columns:1fr 1fr 1fr}}
.cwcard{border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center}
.cwcard.hit{border-color:var(--grass);background:rgba(25,195,125,.07)}
.cwg{font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase}
.cwteam{display:flex;flex-direction:column;align-items:center;gap:3px;margin:6px 0}
.cwteam .fl{font-size:24px}.cwn{font-size:11px;font-weight:700}
.cwmeta{font-size:11px;color:var(--muted);font-weight:700}.cwok{color:var(--grass-d)}

/* match center */
.spill{font-size:11px;font-weight:800;padding:2px 7px;border-radius:6px;min-width:42px;text-align:center;display:inline-block}
.spill.live{background:var(--neg);color:#fff;animation:blink 1.6s infinite}
.spill.ft{background:var(--soft);color:var(--muted)}.spill.sched{background:var(--soft);color:var(--ink)}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.55}}
.match{display:block;width:100%;text-align:start;background:none;border:none;border-bottom:1px solid var(--border);padding:10px 2px;cursor:pointer}
.match:last-child{border-bottom:none}.match:active{background:var(--soft)}
.match.islive{background:linear-gradient(90deg,rgba(226,87,76,.06),transparent)}
.match-main{display:flex;align-items:center;gap:10px}
.match-status{width:48px;flex:none}
.match-teams{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.mt{display:flex;align-items:center;gap:8px;min-width:0}.mt .fl{font-size:17px}
.mt .mtn{font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt.win .mtn{font-weight:800}.mt .msc{margin-inline-start:auto;font-weight:800;font-size:15px}
.mt.win .msc{color:var(--grass-d)}.app[data-theme="dark"] .mt.win .msc{color:var(--grass)}
.match-chev{color:var(--muted);font-size:20px;flex:none}
.match-pred{display:flex;align-items:center;gap:8px;margin-top:7px;padding-inline-start:58px}
.mpbar{flex:1;height:5px;border-radius:99px;overflow:hidden;display:flex;background:var(--soft)}
.mpfill{height:100%}.mpfill.h{background:var(--grass)}.mpfill.a{background:var(--gold)}
.mptxt{font-size:10px;color:var(--muted);font-weight:700;flex:none}
.livecard{border-color:var(--neg)}.livedot{width:8px;height:8px;border-radius:50%;background:var(--neg);display:inline-block;animation:blink 1.4s infinite}
.datestrip{display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 0 8px;margin:0 -2px}
.datebtn{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:62px;padding:8px 10px;border-radius:12px;
border:1px solid var(--border);background:var(--card);color:var(--ink);cursor:pointer}
.datebtn.on{background:var(--pitch);color:#fff;border-color:var(--pitch)}
.dlabel{font-size:11px;font-weight:700}.dcount{font-size:11px;opacity:.7}

/* match detail */
.backbtn{background:none;border:none;color:var(--grass-d);font-weight:700;font-size:14px;cursor:pointer;padding:6px 0;margin-bottom:2px}
.app[data-theme="dark"] .backbtn{color:var(--grass)}
.md-head{position:relative;overflow:hidden;border-radius:16px;padding:16px 12px;color:#fff;background:linear-gradient(150deg,var(--pitch2),var(--pitch))}
.md-bg{position:absolute;inset:0;opacity:.5;background:radial-gradient(140px 100px at 50% -20%,rgba(25,195,125,.4),transparent)}
.md-stage{position:relative;text-align:center;font-size:11px;font-weight:700;color:#9fe7c8;margin-bottom:10px}
.md-score{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.md-team{display:flex;flex-direction:column;align-items:center;gap:6px}.md-fl{font-size:38px;line-height:1}
.md-tn{font-size:13px;font-weight:700;text-align:center}
.md-mid{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:78px}
.md-sc{font-size:34px;font-weight:800;display:flex;align-items:center;gap:6px}.md-dash{opacity:.6}
.md-vs{font-size:18px;font-weight:800;color:#d7f5e6}
.md-st{font-size:10px;font-weight:800;letter-spacing:.5px;color:#9fe7c8}.md-st.live{color:#ffd9d5;animation:blink 1.6s infinite}
.md-tabs{display:flex;gap:4px;margin:12px 0 0;background:var(--soft);padding:4px;border-radius:12px}
.md-tab{flex:1;padding:8px 4px;border:none;background:none;border-radius:9px;font-family:inherit;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer}
.md-tab.on{background:var(--card);color:var(--ink);box-shadow:0 1px 4px rgba(10,31,23,.1)}
.md-tab:disabled{opacity:.4}

/* timeline */
.timeline{display:flex;flex-direction:column;gap:2px}
.tlrow{display:grid;grid-template-columns:1fr 38px 1fr;align-items:center;gap:6px;padding:5px 0;animation:rowIn .35s ease both}
.tlhome{text-align:end}.tlaway{text-align:start}
.tlmin{text-align:center;font-size:11px;font-weight:800;color:var(--muted);background:var(--soft);border-radius:6px;padding:2px 0}
.tlev{font-size:12px;display:inline-flex;align-items:center;gap:5px}.tlev b{font-weight:700}.tlic{font-size:14px}

/* pitch */
.pitch{background:linear-gradient(180deg,#0f9d63,#0a7d4e);border-radius:12px;padding:14px 8px;display:flex;flex-direction:column;gap:14px;
background-image:repeating-linear-gradient(180deg,rgba(255,255,255,.06) 0 30px,transparent 30px 60px)}
.pline{display:flex;justify-content:space-around;gap:6px}
.pp{display:flex;flex-direction:column;align-items:center;gap:2px;width:54px}
.ppnum{width:26px;height:26px;border-radius:50%;background:#fff;color:var(--pitch);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;box-shadow:0 2px 5px rgba(0,0,0,.25)}
.ppname{font-size:9.5px;color:#fff;font-weight:600;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.4);overflow:hidden;text-overflow:ellipsis;max-width:54px;white-space:nowrap}
.lu-switch{display:flex;gap:6px;margin-bottom:10px}
.lu-switch button{flex:1;padding:8px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--ink);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lu-switch button.on{background:var(--grass);color:#04150d;border-color:var(--grass)}
.lu-form{font-size:12px;color:var(--muted);margin-bottom:10px}.lu-form b{color:var(--ink)}
.lu-bench{margin-top:12px}.lu-bh{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;margin-bottom:6px}
.benchp{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;background:var(--soft);border-radius:8px;padding:4px 8px;margin:0 6px 6px 0}
.benchp .num{color:var(--muted);font-weight:800}

/* stats */
.statline{display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"l c r" "b b b";gap:4px 8px;padding:9px 0;border-bottom:1px solid var(--border)}
.statline:last-child{border:none}
.statline .sv{font-weight:800;font-size:13px}.statline .sv.end{text-align:end;grid-area:r}
.statline .slabel{grid-area:c;text-align:center;font-size:11px;color:var(--muted);font-weight:600}
.sbar{grid-area:b;display:flex;height:6px;border-radius:99px;overflow:hidden;background:var(--soft);gap:2px}
.sbh{background:var(--grass);border-radius:99px;transition:width .8s ease}.sba{background:var(--gold);border-radius:99px;transition:width .8s ease;margin-inline-start:auto}

/* premium V2 detail: two-sided timeline */
.vtimeline{position:relative}
.vtimeline::before{content:"";position:absolute;top:0;bottom:0;left:50%;width:2px;transform:translateX(-50%);background:var(--border)}
.vt-row{display:grid;grid-template-columns:1fr 40px 1fr;align-items:center;gap:6px;padding:7px 0;position:relative}
.vt-side{min-width:0;display:flex}.vt-side.h{justify-content:flex-end}.vt-side.a{justify-content:flex-start}
.vt-min{justify-self:center;font-size:11px;font-weight:800;color:#fff;background:var(--pitch2);border-radius:99px;min-width:30px;height:22px;display:flex;align-items:center;justify-content:center;z-index:1}
.vt-ev{display:inline-flex;align-items:center;gap:8px;max-width:100%;background:var(--soft);border:1px solid var(--border);border-radius:10px;padding:6px 9px}
.vt-row.away .vt-ev{flex-direction:row-reverse;text-align:end}
.vt-ic{font-size:15px;line-height:1;flex:none}
.vt-txt{display:flex;flex-direction:column;min-width:0}
.vt-pl{font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vt-ty{font-size:10px;color:var(--muted);font-weight:600}
.vt-ev.goal{background:rgba(25,169,107,.12);border-color:rgba(25,169,107,.3)}
.vt-ev.rc{background:rgba(226,87,76,.12);border-color:rgba(226,87,76,.3)}
.vt-ev.yc{background:rgba(232,162,59,.12);border-color:rgba(232,162,59,.3)}
/* lineups on a pitch (both teams) */
.fpitch-labels{display:flex;justify-content:space-between;font-size:12.5px;font-weight:800;margin-bottom:8px}
.fpitch{position:relative;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;
  background:linear-gradient(180deg,#13a86a,#0a7d4e);
  background-image:repeating-linear-gradient(180deg,rgba(255,255,255,.05) 0 30px,rgba(0,0,0,.04) 30px 60px);
  padding:12px 6px;min-height:460px}
.fp-markings{position:absolute;inset:8px;border:2px solid rgba(255,255,255,.22);border-radius:8px;pointer-events:none}
.fp-markings::before{content:"";position:absolute;left:50%;top:50%;width:86px;height:86px;transform:translate(-50%,-50%);border:2px solid rgba(255,255,255,.22);border-radius:50%}
.fpitch-cl{border-top:2px solid rgba(255,255,255,.22);margin:2px 8px;position:relative;z-index:1}
.fpt{flex:1;display:flex;flex-direction:column;justify-content:space-around;position:relative;z-index:1;gap:4px;padding:4px 0}
.fpt-line{display:flex;justify-content:space-around;align-items:center;gap:4px}
.fp-pl{display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:0}
.fp-num{width:28px;height:28px;border-radius:50%;background:#fff;color:#0a7d4e;font-weight:800;font-size:12px;
  display:flex;align-items:center;justify-content:center;font-family:var(--num);box-shadow:0 2px 5px rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.85)}
.fpt.away .fp-num{background:var(--gold);color:#3a2a00;border-color:rgba(255,255,255,.5)}
.fp-nm{font-size:9.5px;color:#fff;font-weight:700;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.6);line-height:1.1;max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fbench{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.fbench-h{font-size:11px;font-weight:800;color:var(--muted);margin-bottom:5px}
.fbench-col .benchp{display:block;font-size:11px;padding:2px 0;color:var(--ink)}
.fbench-col .benchp .num{color:var(--muted);display:inline-block;min-width:18px}

/* match predictions */
.pp-split{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.pp-side{display:flex;align-items:center;gap:6px;font-size:15px}.pp-side.end{justify-content:flex-end}.pp-side .fl{font-size:20px}.pp-side b{font-size:16px}
.pp-track{flex:1;height:9px;border-radius:99px;overflow:hidden;display:flex;background:var(--soft)}
.pp-result{font-size:12px;color:var(--muted);text-align:center;padding:6px;background:var(--soft);border-radius:8px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:6px}
.pp-list{display:flex;flex-direction:column}
.pp-row{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--border)}
.pp-row:last-child{border:none}.pp-name{font-weight:700;font-size:13px;flex:none;width:64px}
.pp-pick{flex:1;min-width:0}.pp-pt{font-family:var(--num);font-weight:800;font-size:13px}
.pp-pt.ok{color:var(--pos)}.pp-pt.no{color:var(--muted)}

/* home — match focused */
.topstrip{display:flex;align-items:center;gap:8px;padding:10px 2px 4px;font-size:12px;color:var(--muted)}
.ts-left{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ts-left b{color:var(--ink);font-weight:700}
.ts-dot{width:7px;height:7px;border-radius:50%;background:var(--grass);display:inline-block;margin-inline-end:4px}
.ts-leader{flex:none;background:var(--soft);border:none;border-radius:99px;padding:5px 10px;font-family:inherit;font-size:12px;font-weight:700;color:var(--ink);cursor:pointer;display:flex;align-items:center;gap:5px}
.ts-leader .num{color:var(--gold-d);font-weight:800}
.nextcard{display:block;width:100%;text-align:center;position:relative;overflow:hidden;border:none;cursor:pointer;
border-radius:18px;padding:16px 14px;margin:10px 0;color:#fff;background:linear-gradient(150deg,var(--pitch2),var(--pitch))}
.nextcard:active{transform:scale(.99)}
.nc-bg{position:absolute;inset:0;opacity:.55;background:radial-gradient(160px 110px at 50% -20%,rgba(25,195,125,.45),transparent),repeating-linear-gradient(90deg,transparent 0 40px,rgba(255,255,255,.03) 40px 41px)}
.nc-label{position:relative;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#9fe7c8}
.nc-fix{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin:12px 0 8px}
.nc-team{display:flex;flex-direction:column;align-items:center;gap:6px}.nc-fl{font-size:34px;line-height:1}
.nc-tn{font-size:13px;font-weight:700}
.nc-mid{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:74px}
.nc-time{font-size:22px;font-weight:800;color:var(--gold)}
.nc-live{font-size:22px;font-weight:800;color:#ff6b5e;animation:blink 1.6s infinite}
.nc-when{font-size:10px;color:#cdeee0}
.nc-sc{font-size:26px;font-weight:800;font-family:var(--num);color:#fff;margin-top:2px}
.nextcard.islive{background:linear-gradient(150deg,#13352a,#3a1410)}
.nextcard.islive .nc-label{color:#ffd2cc}
.nc-label .livedot{display:inline-block;vertical-align:middle}
.nc-stage{position:relative;font-size:11px;font-weight:700;color:#9fe7c8}
.seeall{margin-inline-start:auto;background:none;border:none;color:var(--grass-d);font-family:inherit;font-weight:700;font-size:12px;cursor:pointer}
.app[data-theme="dark"] .seeall{color:var(--grass)}

/* points view */
.ptlegend{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px}
.ptl{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--muted);font-weight:600}
.ptdot{width:9px;height:9px;border-radius:3px}
.ptboard{display:flex;flex-direction:column;gap:6px}
.pbrow{display:flex;align-items:center;gap:9px;width:100%;background:var(--card);border:1px solid var(--border);border-radius:11px;padding:8px 10px;cursor:pointer;text-align:start;animation:rowIn .35s ease both}
.pbrow.sel{border-color:var(--grass);background:rgba(25,195,125,.06)}
.pbrank{width:18px;text-align:center;font-weight:800;color:var(--muted);font-size:12px}
.pbmain{flex:1;min-width:0}.pbname{font-weight:700;font-size:13px;display:flex;align-items:center;gap:7px}
.pblive{font-size:9.5px;font-weight:800;color:var(--neg);background:rgba(226,87,76,.12);padding:1px 6px;border-radius:99px;animation:blink 1.6s infinite}
.pbbar{display:flex;height:7px;border-radius:99px;overflow:hidden;background:var(--soft);margin-top:5px}
.pbseg{height:100%;transition:width .9s cubic-bezier(.2,.8,.2,1)}
.pbtot{font-size:17px;font-weight:800;color:var(--pitch);min-width:30px;text-align:end}
.app[data-theme="dark"] .pbtot{color:var(--grass)}

.psel-strip{display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:2px 0}
.pchip{flex:none;display:flex;align-items:center;gap:6px;padding:5px 11px 5px 5px;border-radius:99px;border:1px solid var(--border);background:var(--card);color:var(--ink);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}
.pchip .ava{width:24px;height:24px;font-size:9px}
.pchip.on{background:var(--pitch);color:#fff;border-color:var(--pitch)}

.eq{display:flex;align-items:center;flex-wrap:wrap;gap:8px;justify-content:center}
.eq-total{font-size:30px;font-weight:800;color:var(--gold-d)}.eq-eq,.eq-plus{font-size:18px;color:var(--muted);font-weight:700}
.eq-part{display:flex;flex-direction:column;align-items:center}.eq-part b{font-size:20px}
.eq-lbl{font-size:9.5px;color:var(--muted);font-weight:600;text-align:center;max-width:64px}
.eq-pending{text-align:center;font-size:12px;color:var(--neg);background:rgba(226,87,76,.08);border-radius:8px;padding:6px}

/* plain "how points add up" */
.phow-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.phow-total{font-family:var(--num)}.phow-total b{font-size:24px;font-weight:800;color:var(--gold-d)}
.phow{display:flex;flex-direction:column;gap:2px}
.phow-row{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}
.phow-row:last-child{border:none}
.phow-e{font-size:20px;text-align:center}
.phow-main{min-width:0}
.phow-t{display:block;font-size:13.5px;font-weight:700}
.phow-n{font-weight:600;color:var(--muted);font-size:11px}
.phow-d{display:block;font-size:11px;color:var(--muted);margin-top:2px;line-height:1.35}
.phow-pts{font-size:17px;font-weight:800;color:var(--muted);min-width:38px;text-align:end}
.phow-pts.on{color:var(--grass-d)}.app[data-theme="dark"] .phow-pts.on{color:var(--grass)}

.aglist{display:flex;flex-direction:column;gap:7px}
.ag{border:1px solid var(--border);border-radius:11px;overflow:hidden}
.ag.open{border-color:var(--grass-d)}
.ag-head{display:flex;align-items:center;gap:8px;width:100%;padding:9px 11px;background:var(--card);border:none;cursor:pointer;font-family:inherit}
.ag-g{font-weight:800;font-size:13px;color:var(--ink)}.ag-chev{color:var(--muted);font-size:11px}
.ag-sub{margin-inline-start:auto;font-weight:800;font-size:14px;color:var(--grass-d)}
.app[data-theme="dark"] .ag-sub{color:var(--grass)}
.ag-body{padding:8px 11px 12px;border-top:1px solid var(--border);background:var(--soft)}
.ag-section{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin:8px 0 5px}
.ag-section:first-child{margin-top:0}
.agrank{display:flex;align-items:center;gap:7px;padding:3px 0}
.agpos{width:14px;text-align:center;color:var(--muted);font-weight:700;font-size:12px}
.agpick,.agact{flex:1;min-width:0}.agpick .tn,.agact .tn{font-size:12px}
.agarrow{color:var(--muted);font-size:11px}
.agpt{font-family:var(--num);font-weight:800;font-size:12px;min-width:24px;text-align:end}
.pt3{color:var(--pos)}.pt1{color:var(--grass-d)}.pt0{color:var(--muted)}
.app[data-theme="dark"] .pt1{color:var(--grass)}
.agmwrap{display:flex;flex-direction:column;gap:4px}
.agm{font-size:11.5px;display:inline-flex;align-items:center;gap:5px}.agm .fl{font-size:15px}.agm b{margin-inline-start:4px}

.koaudit{display:flex;align-items:center;gap:7px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}
.koaudit:last-child{border:none}
.kord{font-weight:800;font-size:10px;color:var(--muted);min-width:54px}
.kopick{flex:none}.koact{flex:1;color:var(--muted);display:flex;align-items:center;gap:4px}.koact .tn{font-size:12px;color:var(--ink)}

/* icons */
.ico{display:block}
.navbtn .navi{display:flex;align-items:center;justify-content:center;height:22px}
.tilei{display:flex;align-items:center;justify-content:center;color:var(--ink)}
.tile.on .tilei{color:var(--grass-d)}.app[data-theme="dark"] .tile.on .tilei{color:var(--grass)}

/* admin: sheet section */
.sheeth.admin{display:flex;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
.logoutbtn{margin-inline-start:auto;display:flex;align-items:center;gap:5px;background:none;border:none;color:var(--neg);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}

/* admin: login */
.adminlogin{text-align:center}.al-ico{display:flex;justify-content:center;color:var(--grass-d);margin-bottom:6px}
.app[data-theme="dark"] .al-ico{color:var(--grass)}
.al-err{color:var(--neg);font-size:12px;font-weight:600;margin:8px 0}
.al-ok{color:var(--pos);font-size:12px;font-weight:700;margin-top:10px}
.btn{width:100%;margin-top:10px;padding:11px;border:none;border-radius:11px;background:var(--grass);color:#04150d;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer}
.btn:active{transform:scale(.99)}.btn.ghost{background:var(--soft);color:var(--muted)}.btn:disabled{opacity:.5}

/* admin: results editor */
.bucketstrip{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}
.bbtn{width:30px;height:30px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--ink);font-family:inherit;font-weight:800;font-size:12px;cursor:pointer}
.bbtn.on{background:var(--pitch);color:#fff;border-color:var(--pitch)}.bbtn.ko{width:auto;padding:0 10px}
.erows{display:flex;flex-direction:column;gap:8px}
.erow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.erow.invalid .scoreinp{border-color:var(--neg);outline-color:var(--neg)}
.ko-warn{flex-basis:100%;text-align:center;font-size:10.5px;font-weight:700;color:var(--neg)}
.eteam{flex:1;display:flex;align-items:center;gap:6px;min-width:0}.eteam.end{justify-content:flex-end}
.eteam .fl{font-size:16px}.etn{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scoreinp{width:34px;height:34px;text-align:center;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink);font-family:var(--num);font-weight:800;font-size:15px}
.scoreinp:focus{outline:2px solid var(--grass);border-color:var(--grass)}
.edash{color:var(--muted);font-weight:800}
.eclear{width:24px;height:24px;border:none;background:var(--soft);color:var(--muted);border-radius:6px;cursor:pointer;font-size:11px;flex:none}

/* admin: settings */
.frow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px;font-weight:600}
.frow:last-child{border:none}.select.sm{width:auto;min-width:120px;margin:0}
.poolcard{text-align:center}.poolv{font-size:24px;font-weight:800;color:var(--gold-d);margin-top:2px}

/* admin: backup/json */
.jsonbox{width:100%;min-height:130px;border:1px solid var(--border);border-radius:10px;padding:10px;font-family:var(--num);font-size:11px;background:var(--soft);color:var(--ink);resize:vertical}

/* admin: health */
.hrow{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)}
.hrow:last-child{border:none}
.hdot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#fff;flex:none}
.hdot.ok{background:var(--pos)}.hdot.bad{background:var(--warn,#e8a23b)}
.hlabel{flex:1;font-size:13px;font-weight:600}.hval{font-size:12px;color:var(--muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* admin: audit log */
.logrow{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px}
.logrow:last-child{border:none}.logtime{color:var(--muted);font-weight:700;flex:none}.logmsg{font-weight:600}
`;
