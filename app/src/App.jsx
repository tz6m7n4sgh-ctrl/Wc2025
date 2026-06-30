import React, { useState, useMemo, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, CartesianGrid, Legend, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { loadFromSupabase, saveBlob, upsertResult, upsertResults, SB_URL } from "./supabase.js";
import { SECURE_AUTH_URL, secureAuthOn, secureLogin, secureSave, loadPlayerRows } from "./secureAuth.js";
import { fetchLivescore, fetchCompletedResults, fetchResultsRange, fetchSeasonEvents, getFeedStatus, fetchMatchDetail, fetchEventFinals } from "./thesportsdb.js";
import { trackEvent, trackPageView, setAnalyticsContext } from "./analytics.js";

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
// League rules: group stage = +1 per team in its EXACT final position (no
// match-winner points, no right-group/wrong-spot points); knockout 2/3/4/5/6;
// champion +10.
const SCORING = {
  edgeCorrect: 0,             // group match-winners are not part of the league rules
  groupPos: [1, 1, 1, 1],    // flat: +1 for each team in its exact final position
  qualifierWrongSlot: 0,     // no partial credit — only exact predictions score
  champion: 1,
  knockout: { R32: 1, R16: 1, QF: 1, SF: 1, F: 1 },
};
// Admin-configurable points override (stored in data.settings); falls back to the
// defaults above. Lets the league set how much each correct knockout round (and
// the champion) is worth.
function koPointsFor(data) { const c = data && data.settings && data.settings.koPoints; return c ? { ...SCORING.knockout, ...c } : SCORING.knockout; }
function champPointsFor(data) { const c = data && data.settings ? data.settings.champPoints : null; return c == null ? SCORING.champion : Number(c); }
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
    nav_home: "Home", nav_table: "Table", nav_groups: "Groups", nav_bracket: "Brackets", nav_profile: "Profile",
    nav_team: "Teams", teamFixtures: "Team fixtures", matchesLabel: "Matches", pickTeam: "Select a team", viewMatches: "View matches",
    leader: "Current leader", phase_group: "Group stage", phase_ko: "Knockout stage", phase_done: "Complete", phase_pre: "Pre-tournament",
    matchesDone: "Group matches played", pts: "pts", rank: "Rank", player: "Player", points: "Points",
    breakdown: "Points breakdown", groupMatch: "Group matches", groupRank: "Group ranking", knockout: "Knockout", champion: "Champion",
    pos1: "1st", pos2: "2nd", pos3: "3rd", pos4: "4th",
    P: "P", W: "W", D: "D", L: "L", GD: "GD", GF: "GF", GA: "GA", Pts: "Pts",
    legend: "Key", leg_P: "Played", leg_W: "Won", leg_D: "Drawn", leg_L: "Lost", leg_GF: "Goals for", leg_GA: "Goals against", leg_GD: "Goal difference", leg_Pts: "Points",
    pending: "Pending", spread: "Points spread", movers: "Biggest movers", standings: "Standings",
    predicted: "Your pick", actual: "Actual", champPick: "Champion pick", qualified: "Qualified",
    howScoring: "How scoring works", tapPlayer: "Tap a player for their breakdown",
    r_R32: "Round of 32", r_R16: "Round of 16", r_QF: "Quarter-finals", r_SF: "Semi-finals", r_F: "Final",
    selectPlayer: "Select a player", group: "Group", winnerAdv: "advances",
    rule_edge: "Pick the higher-ranked team and they win the match", rule_exact: "Team finishes in the exact position you predicted",
    rule_in: "Team is in the group but in a different position", rule_ko: "Correct knockout-round winner", rule_champ: "Correct champion",
    nav_more: "More", nav_matches: "Matches", nav_predictions: "Predictions", nav_consensus: "Consensus", nav_trends: "Trends", nav_scorers: "Goals", nav_help: "Help", nav_mypicks: "My picks", mypicksSignIn: "Open your personal sign-in link (sent on WhatsApp) to fill and edit your predictions.",
    nav_today: "Today", liveNow: "Live now", noMatches: "No matches on this day.", noEvents: "No data yet.", predBacking: "backing", whoBacked: "Who backed whom", back: "Back", upcoming: "Upcoming",
    liveLbl: "LIVE", liveUpdates: "Live updates", hide: "Hide", openMatch: "Open match", kickoff: "Kick-off", fullTime: "Full-time", goalEx: "GOAL!",
    nextMatch: "Next match", todayComing: "Today — coming up", todayDone: "Today — completed", noComing: "No more matches today.", noDone: "No results yet today.", latestResults: "Latest results", seeAll: "See all",
    nav_points: "Points", livePoints: "Live points", livePtsHint: "recalculated from results", howCalc: "How points are calculated", pendingLive: "Pending", fromLive: "from live matches",
    groupBreakdown: "Group-by-group breakdown", tapExpand: "tap to expand", beat: "beat", champPending: "Champion not decided yet", ifCorrect: "if correct",
    admin: "Admin", adminLogin: "Admin login", password: "Password", wrongPw: "Incorrect password", login: "Log in", demoPw: "Demo password", logout: "Log out",
    nav_settings: "Settings", nav_results: "Results", nav_playerpicks: "Player picks", nav_playerreport: "Position report", nav_audit: "Audit log", nav_backup: "Backup", nav_health: "Health", nav_sync: "Sync results", nav_repair: "Repair", nav_export: "Export", nav_champions: "Champion picks", nav_knockout: "Knockout fixtures",
    nav_editpicks: "Edit predictions", editPicksHint: "Select a player and correct their group order, champion or knockout bracket. Changes save immediately and override any prediction lock.", editPicksSaved: "Saved",
    importBrackets: "Import brackets", importHint: "Paste JSON mapping each player to their knockout slots, e.g. {\"Dani Haddad\":{\"R32#0\":\"Germany\",...}}. Slots: R32#0–15, R16#0–7, QF#0–3, SF#0–1, F#0. Applies to matching players and saves.", importApply: "Apply import", importBad: "Invalid JSON — check and try again.",
    koFixturesHint: "Enter the real knockout matchups and kickoff times. Seed the Round of 32 from the current standings, then correct the teams to the actual draw. Saving powers the champion lock, players' knockout picks and the results editor.", koSeedR32: "Seed R32 from standings", koSave: "Save fixtures", koSaved: "Fixtures saved", koFixtures: "Fixtures set", koFirstKick: "First kickoff", koHome: "Home", koAway: "Away", koOverrideNote: "Showing the live-synced knockout fixtures. Edits here override the feed; Save to keep them.",
    champEntryHint: "Set each player's World Cup winner pick. It scores +1 once the actual champion is decided.", champSetCount: "Picks set",
    nav_players: "Players & login", playersHint: "Set each player's phone, then tap WhatsApp to send them their personal sign-in code from your own number (free). They open the app → More → My picks and enter the code.", phonePh: "+9715xxxxxxxx", waSend: "WhatsApp", copyCode: "Copy code", champLock: "Champion pick lock", signedInAs: "Signed in as", lockBy: "You can change this until", locked: "locked",
    waMsg1: "Hi", waMsg2: "here's your World Cup league sign-in — tap to set your champion pick:", waMsg3: "(Keep this link private — it's just for you.)",
    waCodeMsg: "your World Cup league sign-in code is:", waCodeMsg2: "Open the app → More → My picks, and enter this code. Keep it private — it's just for you.",
    codeTitle: "Enter your code", codeHint: "Enter the 4-digit sign-in code your league admin sent you on WhatsApp.", codePh: "e.g. 1234", codeBad: "That code isn't recognised — check it and try again.", codeGo: "Sign in", regenCode: "New code",
    waRemind: "Remind", waRemindMsg1: "here's a reminder to set your World Cup picks before they lock", waRemindMsg2: "tap to open:", lockAuto: "Auto-locks 4h before the first knockout match", lockManual: "Manual override (leave blank to auto-lock 4h before the first knockout)", lockAutoTba: "Will auto-lock 4h before the first knockout match (schedule pending)",
    picksMade: "Your picks", randomFill: "Fill randomly (unique to me)", randomConfirm: "Fill all your open predictions with a random draw? Each player gets a different one. You can still edit afterwards.",
    groupPredHint: "Order each group 1–4. Open until your league admin sets a deadline.", groupLockedHint: "Group predictions are locked.", groupLockAuto: "Auto-locks at the first group match", groupLock: "Group predictions lock", groupLockOpen: "Open — set a time to close entry (e.g. the first group kickoff)",
    koPicks: "Knockout picks", koOpensWhen: "Knockout picks open once the group stage finishes.", koLockHint: "Each pick locks 4 hours before its kickoff.", koProjected: "Projected from the current standings — pick now; matchups may still shift until the groups finish. Each pick locks 4h before kickoff.", koPreview: "Preview projected from the current standings. Picks open once the knockout fixtures are confirmed; each pick will lock 4h before its kickoff.", koLockBy: "locks 4h before kickoff", pickWinner: "Pick the winner", koTba: "Awaiting earlier results", koTba2: "TBD", koVs: "v",
    r16CandHint: "The Round-of-16 bracket is fixed. For each tie, pick the winner from its possible teams now — scored against the real result. Locks at the champion deadline.", r16TieFrom: "from",
    brkOverlayHint: "Picks turn green when correct, red when wrong, as results come in. Scroll to see the whole bracket.", shareBracket: "Share image", brkTapZoom: "Tap the bracket for a full-size image to save or share.", gkoSwipe: "Swipe to change round", gkoTapTeam: "Tap a team to trace their run", gkoTracing: "Tracing — tap anywhere to clear", yourChampion: "Your champion",
    brkTabLive: "Current state", brkTabPred: "Prediction", brkAlive: "alive", brkDecided: "decided",
    brkDiagram: "Diagram", brkList: "List", bdgTapTeam: "tap a team for its path · pinch or +/− to zoom", bdgTurn: "Turn phone to read", bdgPath: "path to the final", bdgRotate: "Rotate your phone to view the bracket — or switch to List",
    koBracket: "Knockout bracket", koBracketHint: "Pick a winner in every tie from the Round of 32 to the Final — winners advance, and your Final winner is your champion. Locks at the champion deadline; each correct pick scores +1.", koBracketLocked: "Bracket locked. ✓ = correct, ✕ = wrong, as results come in.",
    resultsEditor: "Results editor", resultsHint: "Enter a score to mark a match finished — standings, points and the bracket update instantly.", setChampion: "Set champion",
    entryFee: "Entry fee", currency: "Currency", distribution: "Prize distribution", winnerTakes: "Winner takes all", topTwo: "Split top 2", topThree: "Split top 3", deadline: "Predictions deadline", lockPicks: "Lock predictions", prizePool: "Prize pool",
    exportData: "Export data", importData: "Import data", pasteJson: "Paste backup JSON here…", copy: "Copy", copied: "copied", loaded: "loaded", badJson: "invalid JSON", load: "Load",
    expPreds: "Players' predictions", expResults: "Group results", expKnockout: "Knockout results", expHint: "Download a snapshot of the live data. CSV opens in Excel/Sheets; JSON is a full backup.", dlCsv: "Download CSV", dlJson: "Download JSON", expPlayersN: "players", expFinishedN: "finished", expScheduledN: "scheduled", expChampDecided: "champion decided", expChampPending: "champion pending", expCheck: "These exports reflect the data the app is showing right now — if the player names here look wrong, the app is on sample data and didn't load the live database.",
    pdfTitle: "PDF report", pdfHint: "Generates a printable page — pick “Save as PDF” in the print dialog. Choose one player, or the full ranked list.", pdfPlayer: "Player PDF", pdfFull: "Full list PDF", pdfBanked: "Banked", pdfProj: "Projected", pdfLegend: "points = +1 per team in its exact current position · updates live as results come in", pdfNote: "Group columns show exact-position hits (out of 4). Knockout & champion are not scored yet.",
    hPlayers: "Players", hPreds: "All group predictions complete", hChamp: "All champion picks set", hMatches: "Matches finished", hGroups: "Groups complete", hEngine: "Engine totals reconcile",
    noChanges: "No changes yet.", repairHint: "Normalize the dataset: backfill missing fields and re-derive results.", runRepair: "Run repair", repairDone: "Dataset normalized.",
    syncHint: "Live sync pulls fixtures and results from TheSportsDB. Connect the data layer to enable.", syncNow: "Sync now", reportHint: "Points by category per player. PDF export ships with the data layer.",
    tab_events: "Events", tab_lineups: "Lineups", tab_stats: "Stats", tab_predictions: "Predictions", formation: "Formation", bench: "Bench",
    stat_possession: "Possession", stat_shots: "Shots", stat_sot: "Shots on target", stat_corners: "Corners", stat_fouls: "Fouls", stat_offsides: "Offsides",
    champConsensus: "Champion pick consensus", topWinners: "Most-picked group winners", predGridHint: "Predicted group winner per player — tap a row for full picks",
    predKoTitle: "Knockout — head to head", predKoHint: "How the league split its winner pick in each knockout tie.", predKoEmpty: "Knockout ties appear here once the matchups are set.",
    predKoCompare: "Knockout comparison", predKoCompareHint: "Each player's champion, finalists and semi-finalists side by side — tap a row for their full bracket.", predHitKo: "reached that round", koFinalists: "Finalists", koSemis: "Semi-finalists",
    trPoints: "Points over time", trRace: "Position race", trRaceHint: "lower line = higher rank", trComp: "Where points come from", trCompHint: "group · knockout · champion", trSurv: "Bracket survival", trSurvHint: "correct knockout picks still standing each round",
    predHitGroup: "Matches the actual group winner", trendsHint: "cumulative points", scorersNote: "Top scoring teams (computed from results). Player-level scorers arrive with the live data layer.",
    sample: "Sample data — engine is live",
    ht_full: "HALF-TIME", ft_full: "FULL-TIME",
    brkIllustrative: "Round-of-32 pairings are illustrative — players predict group order, not exact matchups.", brkLive: "Drawn from the live knockout fixtures — matchups and winners update as the feed does.",
    brkFills: "The bracket fills in once every group is complete.",
    brkProjected: "projected", brkProjNote: "Based on the current group standings — updates live as results come in.",
    noPlayers: "No players yet. Add predictions to get started.",
    koNeedsWinner: "needs a winner", koPenWonBy: "Draw — won on penalties by:",
    loadingData: "Loading live data…", liveData: "Live data",
    syncHint2: "Pull finished scores from TheSportsDB and save them to the database so everyone sees them.",
    syncing: "Syncing…", feedReach: "Feed reachable", feedEvents: "Events fetched", feedCompleted: "Completed found", feedSaved: "Saved to DB", feedKo: "Knockout fixtures synced", feedCleared: "Phantom results cleared", feedMissing: "Still missing a score",
    timezone: "Display timezone", tzCheck: "Timezone check", tzApp: "App timezone", tzAppNow: "App time now", tzDevice: "Device timezone", tzDeviceNow: "Device time now", tzNote: "Times are shown in the app timezone above, not the device's — change it here if needed.",
    scoringTitle: "Points per correct prediction", scoringHint: "Set how many points each correct knockout-round winner (and the champion) is worth. Applies instantly to every player's total.", scoringReset: "Reset to default",
    noDetail: "No detailed data for this match yet (timelines/lineups can be missing or delayed).",
    p_howAdd: "How your points add up", p_correct: "correct", p_of: "of",
    p_winner_t: "Match winners", p_winner_d: "+1 each time your higher-ranked team wins its group match",
    p_pos_t: "Group standings", p_pos_d: "+1 for each team you place in its exact final position",
    p_ko_t: "Knockout winners", p_ko_d: "+1 for each knockout tie where you pick the winner (R16, QF, SF, Final)",
    p_champ_t: "Champion", p_champ_d: "+1 for correctly picking the World Cup winner",
    p_exact: "exact", p_ingrp: "in group", p_yes: "correct", p_no: "missed",
    inProgress: "in progress", gcHint: "Your prediction next to the actual standings, with the points each pick earned.", gcProj: "Live: +1 for each team in its exact final position. Rises/falls as results come in, locks once the group finishes.",
    nav_overview: "Dashboard", ovBeta: "Preview", ovBetaNote: "A new home-screen concept — preview only. The current Home is unchanged. Tell us if you'd like to make this the default.",
    ovProgress: "Tournament progress", ovMatches: "matches", ovPlayed: "played", ovOf: "of", ovComplete: "complete", ovGroupStage: "Group stage", ovKnockout: "Knockout", ovLeftToPlay: "left to play",
    ovLeader: "Leading", ovLeads: "leads by", ovTied: "Tied at the top", ovChasing: "chasing", ovPodium: "Top of the table", ovFullTable: "Full table",
    ovStats: "Tournament stats", ovGoals: "Goals scored", ovPerMatch: "per match", ovBiggestWin: "Biggest win", ovTopChamp: "Crowd's champion", ovTopChampN: "of players", ovNoChamp: "No clear favourite yet",
    ovResultsCalled: "Latest results — who called it", ovBacked: "backed", ovDrawNoCall: "Draw — no pick scored", ovBackingNext: "Who the league is backing", ovPulse: "League prediction pulse", ovAvgPts: "Avg points / player", ovHitRate: "Correct-call rate",
    ovLiveTitle: "Happening now", ovUpNext: "Up next", ovNothingLive: "No live matches right now.", ovYourRank: "Your position", ovSignInSee: "Sign in to see your standing.", ovViewBracket: "View bracket", ovNoData: "Data fills in as matches are played.",
  },
  ar: {
    brand: "كأس العالم 2026", dir: "rtl",
    nav_home: "الرئيسية", nav_table: "الترتيب", nav_groups: "المجموعات", nav_bracket: "الأدوار", nav_profile: "الملف",
    nav_team: "الفرق", teamFixtures: "مباريات الفريق", matchesLabel: "المباريات", pickTeam: "اختر فريقاً", viewMatches: "عرض المباريات",
    leader: "المتصدر الحالي", phase_group: "دور المجموعات", phase_ko: "الأدوار الإقصائية", phase_done: "انتهت", phase_pre: "قبل البطولة",
    matchesDone: "مباريات المجموعات", pts: "نقطة", rank: "المركز", player: "اللاعب", points: "النقاط",
    breakdown: "تفصيل النقاط", groupMatch: "مباريات المجموعات", groupRank: "ترتيب المجموعات", knockout: "الإقصائيات", champion: "البطل",
    pos1: "الأول", pos2: "الثاني", pos3: "الثالث", pos4: "الرابع",
    P: "لعب", W: "فوز", D: "تعادل", L: "خسارة", GD: "الفارق", GF: "له", GA: "عليه", Pts: "نقاط",
    legend: "دليل", leg_P: "لعب", leg_W: "فوز", leg_D: "تعادل", leg_L: "خسارة", leg_GF: "الأهداف له", leg_GA: "الأهداف عليه", leg_GD: "فارق الأهداف", leg_Pts: "النقاط",
    pending: "قيد الانتظار", spread: "توزيع النقاط", movers: "أبرز التغيرات", standings: "الترتيب",
    predicted: "توقعك", actual: "الفعلي", champPick: "توقع البطل", qualified: "المتأهلون",
    howScoring: "طريقة احتساب النقاط", tapPlayer: "اضغط على لاعب لعرض التفصيل",
    r_R32: "دور الـ32", r_R16: "دور الـ16", r_QF: "ربع النهائي", r_SF: "نصف النهائي", r_F: "النهائي",
    selectPlayer: "اختر لاعباً", group: "المجموعة", winnerAdv: "يتأهل",
    rule_edge: "اختر الفريق الأعلى ترتيباً ويفوز بالمباراة", rule_exact: "الفريق ينهي في المركز الذي توقعته بالضبط",
    rule_in: "الفريق في المجموعة لكن في مركز مختلف", rule_ko: "توقع الفائز الصحيح في الدور الإقصائي", rule_champ: "توقع البطل الصحيح",
    nav_more: "المزيد", nav_matches: "المباريات", nav_predictions: "التوقعات", nav_consensus: "الإجماع", nav_trends: "التطور", nav_scorers: "الأهداف", nav_help: "المساعدة", nav_mypicks: "توقعاتي", mypicksSignIn: "افتح رابط الدخول الخاص بك (المُرسل عبر واتساب) لتعبئة توقّعاتك وتعديلها.",
    nav_today: "اليوم", liveNow: "مباشر الآن", noMatches: "لا مباريات في هذا اليوم.", noEvents: "لا توجد بيانات بعد.", predBacking: "مؤيد", whoBacked: "من أيّد مَن", back: "رجوع", upcoming: "قادمة",
    liveLbl: "مباشر", liveUpdates: "تحديثات مباشرة", hide: "إخفاء", openMatch: "فتح المباراة", kickoff: "انطلاق المباراة", fullTime: "انتهت المباراة", goalEx: "هدف!",
    nextMatch: "المباراة القادمة", todayComing: "اليوم — قادمة", todayDone: "اليوم — انتهت", noComing: "لا مزيد من المباريات اليوم.", noDone: "لا نتائج بعد اليوم.", latestResults: "أحدث النتائج", seeAll: "عرض الكل",
    nav_points: "النقاط", livePoints: "النقاط المباشرة", livePtsHint: "تُحتسب من النتائج", howCalc: "كيف تُحتسب النقاط", pendingLive: "قيد الاحتساب", fromLive: "من المباريات المباشرة",
    groupBreakdown: "تفصيل لكل مجموعة", tapExpand: "اضغط للتوسيع", beat: "تغلّب على", champPending: "البطل لم يُحسم بعد", ifCorrect: "إذا صح",
    admin: "الإدارة", adminLogin: "دخول الإدارة", password: "كلمة المرور", wrongPw: "كلمة المرور غير صحيحة", login: "دخول", demoPw: "كلمة المرور التجريبية", logout: "خروج",
    nav_settings: "الإعدادات", nav_results: "النتائج", nav_playerpicks: "توقعات اللاعب", nav_playerreport: "تقرير المراكز", nav_audit: "سجل التغييرات", nav_backup: "نسخ احتياطي", nav_health: "الصحة", nav_sync: "مزامنة النتائج", nav_repair: "إصلاح", nav_export: "تصدير", nav_champions: "اختيارات البطل", nav_knockout: "مباريات الإقصائيات",
    nav_editpicks: "تعديل التوقّعات", editPicksHint: "اختر لاعباً وعدّل ترتيب مجموعاته أو بطله أو جدوله الإقصائي. تُحفظ التغييرات فوراً وتتجاوز أي إغلاق.", editPicksSaved: "تم الحفظ",
    importBrackets: "استيراد الجداول", importHint: "ألصق JSON يربط كل لاعب بخاناته الإقصائية. الخانات: R32#0–15, R16#0–7, QF#0–3, SF#0–1, F#0. يُطبَّق على اللاعبين المطابقين ويُحفظ.", importApply: "تطبيق الاستيراد", importBad: "JSON غير صالح — تحقّق وحاول مجدداً.",
    koFixturesHint: "أدخل مواجهات الأدوار الإقصائية الحقيقية وأوقات انطلاقها. عبّئ دور الـ32 من الترتيب الحالي ثم صحّح الفرق وفق القرعة الفعلية. الحفظ يُفعّل إغلاق البطل وتوقّعات اللاعبين ومحرّر النتائج.", koSeedR32: "تعبئة دور الـ32 من الترتيب", koSave: "حفظ المباريات", koSaved: "تم حفظ المباريات", koFixtures: "المباريات المحدّدة", koFirstKick: "أول انطلاق", koHome: "المضيف", koAway: "الضيف", koOverrideNote: "تُعرض مباريات الأدوار الإقصائية المتزامنة مباشرةً. التعديلات هنا تتجاوز الخدمة؛ اضغط حفظ للإبقاء عليها.",
    champEntryHint: "حدّد توقع بطل كأس العالم لكل لاعب. يُحتسب +1 عند تحديد البطل فعلياً.", champSetCount: "اختيارات محددة",
    nav_players: "اللاعبون والدخول", playersHint: "أدخل رقم كل لاعب ثم اضغط واتساب لإرسال رمز الدخول الخاص به من رقمك (مجاناً). يفتح التطبيق ← المزيد ← توقعاتي ويُدخل الرمز.", phonePh: "+9715xxxxxxxx", waSend: "واتساب", copyCode: "نسخ الرمز", champLock: "إغلاق اختيار البطل", signedInAs: "مسجّل الدخول باسم", lockBy: "يمكنك التغيير حتى", locked: "مغلق",
    waMsg1: "مرحباً", waMsg2: "هذا رابط دخولك لدوري كأس العالم — اضغط لاختيار البطل:", waMsg3: "(احتفظ بالرابط لنفسك — خاص بك.)",
    waCodeMsg: "رمز دخولك لدوري كأس العالم هو:", waCodeMsg2: "افتح التطبيق ← المزيد ← توقعاتي وأدخل هذا الرمز. احتفظ به لنفسك — خاص بك.",
    codeTitle: "أدخل رمزك", codeHint: "أدخل رمز الدخول المكوّن من 4 أرقام الذي أرسله لك مشرف الدوري عبر واتساب.", codePh: "مثال 1234", codeBad: "هذا الرمز غير معروف — تحقق منه وحاول مجدداً.", codeGo: "دخول", regenCode: "رمز جديد",
    waRemind: "تذكير", waRemindMsg1: "تذكير باختيار توقّعاتك في دوري كأس العالم قبل إغلاقها", waRemindMsg2: "اضغط للفتح:", lockAuto: "يُغلق تلقائياً قبل 4 ساعات من أول مباراة إقصائية", lockManual: "تجاوز يدوي (اتركه فارغاً ليُغلق تلقائياً قبل 4 ساعات من أول مباراة إقصائية)", lockAutoTba: "سيُغلق تلقائياً قبل 4 ساعات من أول مباراة إقصائية (الجدول قيد الانتظار)",
    picksMade: "اختياراتك", randomFill: "تعبئة عشوائية (خاصة بي)", randomConfirm: "تعبئة كل توقّعاتك المفتوحة بقرعة عشوائية؟ لكل لاعب قرعة مختلفة. يمكنك التعديل لاحقاً.",
    groupPredHint: "رتّب كل مجموعة من 1 إلى 4. مفتوح حتى يحدّد المشرف موعداً للإغلاق.", groupLockedHint: "توقّعات المجموعات مغلقة.", groupLockAuto: "يُغلق تلقائياً عند أول مباراة في المجموعات", groupLock: "إغلاق توقّعات المجموعات", groupLockOpen: "مفتوح — حدّد وقتاً لإغلاق الإدخال (مثلاً أول مباراة في المجموعات)",
    koPicks: "توقّعات الأدوار الإقصائية", koOpensWhen: "تُفتح توقّعات الأدوار الإقصائية بعد انتهاء دور المجموعات.", koLockHint: "يُغلق كل اختيار قبل 4 ساعات من موعد المباراة.", koProjected: "متوقّعة من الترتيب الحالي — اختر الآن؛ قد تتغيّر المواجهات حتى انتهاء المجموعات. يُغلق كل اختيار قبل 4 ساعات من المباراة.", koPreview: "معاينة متوقّعة من الترتيب الحالي. تُفتح التوقّعات بعد تأكيد مباريات الأدوار الإقصائية؛ ويُغلق كل اختيار قبل 4 ساعات من موعده.", koLockBy: "يُغلق قبل 4 ساعات من المباراة", pickWinner: "اختر الفائز", koTba: "بانتظار النتائج السابقة", koTba2: "غير محدد", koVs: "ضد",
    r16CandHint: "جدول دور الـ16 ثابت. لكل مواجهة، اختر الفائز الآن من الفرق المحتملة — وتُحتسب وفق النتيجة الفعلية. يُغلق عند موعد إغلاق توقّع البطل.", r16TieFrom: "من",
    brkOverlayHint: "تتحوّل التوقّعات إلى الأخضر عند الصواب والأحمر عند الخطأ مع ظهور النتائج. مرّر لرؤية الجدول كاملاً.", shareBracket: "مشاركة صورة", brkTapZoom: "اضغط على الجدول للحصول على صورة كاملة للحفظ أو المشاركة.", gkoSwipe: "مرّر لتغيير الدور", gkoTapTeam: "اضغط على فريق لتتبّع مشواره", gkoTracing: "تتبّع — اضغط أي مكان للإلغاء", yourChampion: "بطلك",
    brkTabLive: "الوضع الحالي", brkTabPred: "التوقّع", brkAlive: "ما زال قائماً", brkDecided: "محسومة",
    brkDiagram: "المخطط", brkList: "قائمة", bdgTapTeam: "اضغط فريقاً لعرض طريقه · قرّب بإصبعين أو +/−", bdgTurn: "أدِر الهاتف للقراءة", bdgPath: "الطريق إلى النهائي", bdgRotate: "أدِر هاتفك لعرض المخطط — أو بدّل إلى القائمة",
    koBracket: "جدول الأدوار الإقصائية", koBracketHint: "اختر الفائز في كل مواجهة من دور الـ32 حتى النهائي — يتأهّل الفائزون، والفائز بالنهائي هو بطلك. يُغلق عند موعد إغلاق البطل؛ كل توقّع صحيح يمنح نقطة.", koBracketLocked: "الجدول مُغلق. ✓ = صحيح، ✕ = خاطئ، مع ظهور النتائج.",
    resultsEditor: "محرّر النتائج", resultsHint: "أدخل النتيجة لإنهاء المباراة — يُحدّث الترتيب والنقاط والأدوار فوراً.", setChampion: "تعيين البطل",
    entryFee: "رسوم الاشتراك", currency: "العملة", distribution: "توزيع الجوائز", winnerTakes: "الفائز يأخذ الكل", topTwo: "أفضل اثنين", topThree: "أفضل ثلاثة", deadline: "موعد إغلاق التوقعات", lockPicks: "قفل التوقعات", prizePool: "مجموع الجوائز",
    exportData: "تصدير البيانات", importData: "استيراد البيانات", pasteJson: "الصق نسخة JSON هنا…", copy: "نسخ", copied: "تم النسخ", loaded: "تم التحميل", badJson: "JSON غير صالح", load: "تحميل",
    expPreds: "توقعات اللاعبين", expResults: "نتائج المجموعات", expKnockout: "نتائج الإقصائيات", expHint: "نزّل نسخة من البيانات الحية. ملف CSV يفتح في Excel/Sheets، وJSON نسخة احتياطية كاملة.", dlCsv: "تنزيل CSV", dlJson: "تنزيل JSON", expPlayersN: "لاعب", expFinishedN: "منتهية", expScheduledN: "مجدولة", expChampDecided: "تحدّد البطل", expChampPending: "البطل قيد الانتظار", expCheck: "تعكس هذه الملفات البيانات المعروضة حالياً — إذا بدت أسماء اللاعبين خاطئة فالتطبيق يعمل على بيانات تجريبية ولم يحمّل قاعدة البيانات الحية.",
    pdfTitle: "تقرير PDF", pdfHint: "ينشئ صفحة قابلة للطباعة — اختر «حفظ كـ PDF» في نافذة الطباعة. اختر لاعباً واحداً أو القائمة الكاملة.", pdfPlayer: "PDF للاعب", pdfFull: "PDF للقائمة الكاملة", pdfBanked: "محقّقة", pdfProj: "متوقعة", pdfLegend: "النقاط = +1 لكل فريق في مركزه الحالي الصحيح · تتحدّث مباشرةً مع ورود النتائج", pdfNote: "أعمدة المجموعات تعرض المراكز الصحيحة (من 4). الأدوار الإقصائية والبطل لم تُحتسب بعد.",
    hPlayers: "اللاعبون", hPreds: "اكتمال توقعات المجموعات", hChamp: "تعيين كل توقعات البطل", hMatches: "المباريات المنتهية", hGroups: "المجموعات المكتملة", hEngine: "تطابق مجاميع المحرّك",
    noChanges: "لا تغييرات بعد.", repairHint: "توحيد البيانات: استكمال الحقول الناقصة وإعادة احتساب النتائج.", runRepair: "تشغيل الإصلاح", repairDone: "تم توحيد البيانات.",
    syncHint: "المزامنة المباشرة تجلب المباريات والنتائج من TheSportsDB. اربط طبقة البيانات للتفعيل.", syncNow: "مزامنة الآن", reportHint: "النقاط حسب الفئة لكل لاعب. تصدير PDF يأتي مع طبقة البيانات.",
    tab_events: "الأحداث", tab_lineups: "التشكيلات", tab_stats: "الإحصائيات", tab_predictions: "التوقعات", formation: "الخطة", bench: "البدلاء",
    stat_possession: "الاستحواذ", stat_shots: "التسديدات", stat_sot: "على المرمى", stat_corners: "الركنيات", stat_fouls: "الأخطاء", stat_offsides: "تسلل",
    champConsensus: "إجماع توقع البطل", topWinners: "الأكثر توقعاً كمتصدر", predGridHint: "المتصدر المتوقع لكل لاعب — اضغط الصف لكل التوقعات",
    predKoTitle: "الأدوار الإقصائية — مواجهة مباشرة", predKoHint: "كيف انقسم اللاعبون في توقّع الفائز بكل مواجهة إقصائية.", predKoEmpty: "تظهر المواجهات هنا بمجرد تحديدها.",
    predKoCompare: "مقارنة الأدوار الإقصائية", predKoCompareHint: "بطل كل لاعب والمتأهلون للنهائي ونصف النهائي جنباً إلى جنب — اضغط الصف لكامل جدوله.", predHitKo: "وصل لذلك الدور", koFinalists: "متأهلو النهائي", koSemis: "نصف النهائي",
    trPoints: "النقاط عبر الوقت", trRace: "سباق المراكز", trRaceHint: "الخط الأدنى = مركز أعلى", trComp: "مصدر النقاط", trCompHint: "المجموعات · الإقصائي · البطل", trSurv: "صمود التوقّعات", trSurvHint: "التوقّعات الإقصائية الصحيحة الباقية بكل دور",
    predHitGroup: "يطابق المتصدر الفعلي", trendsHint: "النقاط التراكمية", scorersNote: "الفرق الأكثر تسجيلاً (محسوبة من النتائج). الهدّافون يصلون مع طبقة البيانات المباشرة.",
    sample: "بيانات تجريبية — المحرّك يعمل",
    ht_full: "نهاية الشوط الأول", ft_full: "نهاية المباراة",
    brkIllustrative: "مواجهات دور الـ32 توضيحية — يتوقع اللاعبون ترتيب المجموعات لا المواجهات بالضبط.", brkLive: "مأخوذة من مباريات الأدوار الإقصائية المباشرة — تتحدّث المواجهات والفائزون مع تحديث الخدمة.",
    brkFills: "تكتمل الأدوار الإقصائية بعد انتهاء جميع المجموعات.",
    brkProjected: "متوقع", brkProjNote: "مبني على ترتيب المجموعات الحالي — يتحدّث مباشرةً مع ورود النتائج.",
    noPlayers: "لا يوجد لاعبون بعد. أضف التوقعات للبدء.",
    koNeedsWinner: "يلزم تحديد فائز", koPenWonBy: "تعادل — الفائز بركلات الترجيح:",
    loadingData: "جارٍ تحميل البيانات…", liveData: "بيانات مباشرة",
    syncHint2: "اجلب نتائج المباريات المنتهية من TheSportsDB واحفظها في قاعدة البيانات ليراها الجميع.",
    syncing: "جارٍ المزامنة…", feedReach: "وصول الخدمة", feedEvents: "الأحداث المجلوبة", feedCompleted: "المنتهية الموجودة", feedSaved: "حُفظت في القاعدة", feedKo: "مباريات إقصائية تمت مزامنتها", feedCleared: "نتائج وهمية أُزيلت", feedMissing: "بلا نتيجة بعد",
    timezone: "المنطقة الزمنية للعرض", tzCheck: "فحص المنطقة الزمنية", tzApp: "منطقة التطبيق", tzAppNow: "وقت التطبيق الآن", tzDevice: "منطقة الجهاز", tzDeviceNow: "وقت الجهاز الآن", tzNote: "تُعرض الأوقات بمنطقة التطبيق أعلاه وليس بمنطقة الجهاز — غيّرها هنا إذا لزم.",
    scoringTitle: "نقاط كل توقّع صحيح", scoringHint: "حدّد عدد النقاط لكل فائز صحيح في الأدوار الإقصائية (والبطل). يُطبَّق فوراً على مجموع كل لاعب.", scoringReset: "إعادة للافتراضي",
    noDetail: "لا تتوفر بيانات تفصيلية بعد (قد تتأخر التشكيلات والأحداث).",
    p_howAdd: "كيف تتكوّن نقاطك", p_correct: "صحيحة", p_of: "من",
    p_winner_t: "الفائز بالمباراة", p_winner_d: "+1 كلما فاز فريقك الأعلى ترتيباً في مباراة المجموعة",
    p_pos_t: "ترتيب المجموعة", p_pos_d: "+1 لكل فريق تضعه في مركزه النهائي الصحيح",
    p_ko_t: "الأدوار الإقصائية", p_ko_d: "+1 لكل مواجهة إقصائية تختار فائزها (دور 16، الربع، النصف، النهائي)",
    p_champ_t: "البطل", p_champ_d: "+1 لاختيار بطل كأس العالم بشكل صحيح",
    p_exact: "صحيح", p_ingrp: "في المجموعة", p_yes: "صحيح", p_no: "خطأ",
    inProgress: "قيد اللعب", gcHint: "توقعك بجانب الترتيب الفعلي، مع النقاط التي حققها كل اختيار.", gcProj: "مباشر: +1 لكل فريق في مركزه النهائي الصحيح. يتغيّر مع النتائج ويُثبَّت عند انتهاء المجموعة.",
    nav_overview: "اللوحة", ovBeta: "معاينة", ovBetaNote: "تصميم جديد للصفحة الرئيسية — للمعاينة فقط. الصفحة الحالية لم تتغيّر. أخبرنا إن أردت اعتماده.",
    ovProgress: "تقدّم البطولة", ovMatches: "مباراة", ovPlayed: "لُعبت", ovOf: "من", ovComplete: "مكتملة", ovGroupStage: "دور المجموعات", ovKnockout: "الأدوار الإقصائية", ovLeftToPlay: "متبقية",
    ovLeader: "المتصدّر", ovLeads: "يتقدّم بفارق", ovTied: "تعادل في الصدارة", ovChasing: "يطارد", ovPodium: "صدارة الترتيب", ovFullTable: "الترتيب الكامل",
    ovStats: "إحصاءات البطولة", ovGoals: "الأهداف", ovPerMatch: "لكل مباراة", ovBiggestWin: "أكبر فوز", ovTopChamp: "بطل الجمهور", ovTopChampN: "من اللاعبين", ovNoChamp: "لا مرشّح واضح بعد",
    ovResultsCalled: "آخر النتائج — مَن توقّعها", ovBacked: "توقّعوا", ovDrawNoCall: "تعادل — لا نقاط", ovBackingNext: "مَن يدعمه اللاعبون", ovPulse: "نبض التوقّعات", ovAvgPts: "متوسط النقاط / لاعب", ovHitRate: "نسبة التوقّع الصحيح",
    ovLiveTitle: "يحدث الآن", ovUpNext: "التالي", ovNothingLive: "لا مباريات مباشرة الآن.", ovYourRank: "مركزك", ovSignInSee: "سجّل الدخول لرؤية ترتيبك.", ovViewBracket: "عرض الأدوار", ovNoData: "تُملأ البيانات مع لعب المباريات.",
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
  const completed = [];
  for (let i = 0; i < 6; i++) {
    const r = matchResult(g, i, data);
    if (!r.complete) continue;
    completed.push(r);
    const H = ensure(r.home), A = ensure(r.away);
    H.P++; A.P++; H.GF += r.hs; H.GA += r.as; A.GF += r.as; A.GA += r.hs;
    if (r.hs > r.as) { H.W++; A.L++; H.Pts += 3; }
    else if (r.as > r.hs) { A.W++; H.L++; A.Pts += 3; }
    else { H.D++; A.D++; H.Pts++; A.Pts++; }
    H.GD = H.GF - H.GA; A.GD = A.GF - A.GA;
  }
  // FIFA order: overall Pts → GD → GF, then a head-to-head mini-table among the
  // teams still level (H2H Pts → H2H GD → H2H GF), then alphabetical as the final
  // stable fallback (fair-play card data isn't available from the feed).
  //
  // FIFA's full rule re-resolves a still-level *subset* recursively. We don't,
  // because it can never change a 4-team group: the largest tied set is all 4,
  // whose H2H mini-table just reproduces the overall table (still level →
  // alphabetical); any strict sub-group can only stay level if the whole set is.
  // Verified equivalent to the recursive form over 200k random 4-team groups.
  const rows = Object.values(row).sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF || 0);
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].Pts === rows[i].Pts && rows[j].GD === rows[i].GD && rows[j].GF === rows[i].GF) j++;
    if (j - i > 1) {
      const tied = new Set(rows.slice(i, j).map((r) => teamKey(r.team)));
      const h = {}; tied.forEach((k) => (h[k] = { Pts: 0, GF: 0, GA: 0 }));
      completed.forEach((r) => {
        const hk = teamKey(r.home), ak = teamKey(r.away);
        if (!tied.has(hk) || !tied.has(ak)) return;
        h[hk].GF += r.hs; h[hk].GA += r.as; h[ak].GF += r.as; h[ak].GA += r.hs;
        if (r.hs > r.as) h[hk].Pts += 3; else if (r.as > r.hs) h[ak].Pts += 3; else { h[hk].Pts++; h[ak].Pts++; }
      });
      const sub = rows.slice(i, j).sort((a, b) => {
        const ha = h[teamKey(a.team)], hb = h[teamKey(b.team)];
        return (hb.Pts - ha.Pts) || ((hb.GF - hb.GA) - (ha.GF - ha.GA)) || (hb.GF - ha.GF) || a.team.localeCompare(b.team);
      });
      for (let k = 0; k < sub.length; k++) rows[i + k] = sub[k];
    }
    i = j;
  }
  return rows;
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
    // Flat group points: +1 for each team in its exact final position (all four).
    // Live: recomputed every render and locks once the group is complete.
    {
      const table = computeGroupTable(g, data), pred = playerGroupPred(p, g);
      const locked = groupComplete(g, data);
      const actualTop2 = new Set([table[0], table[1]].filter(Boolean).map((x) => teamKey(x.team)));
      for (let pos = 0; pos < 4; pos++) {
        const actual = table[pos] ? table[pos].team : null, pick = pred[pos] || null;
        let got = 0, reason = "miss";
        if (pick && actual && sameTeam(pick, actual)) { got = SCORING.groupPos[pos]; reason = "exact"; }
        else if (pick && pos < 2 && actualTop2.has(teamKey(pick))) { got = SCORING.qualifierWrongSlot; reason = "qualifier"; }
        gRank += got;
        detail.ranking.push({ g, pos: pos + 1, pick, actual, got, reason, locked });
      }
    }
  }
  // Full-bracket scoring: every slot (R32→F) is reconciled to the real result by
  // team membership, so a pick scores even if an earlier round was wrong.
  const kp = (p && p.knockout) || {}, koPts = koPointsFor(data);
  for (const [code, n] of KO_SEQ) {
    for (let i = 0; i < n; i++) {
      const pick = kp[koSlotId(code, i)]; if (!pick) continue;
      const actualW = koSlotActualWinner(code, i, data); if (!actualW) continue;
      const got = sameTeam(pick, actualW) ? (koPts[code] || 0) : 0;
      ko += got;
      detail.knockout.push({ mid: koSlotId(code, i), round: code, predW: pick, actualW, got });
    }
  }
  if (data.champion) { const got = p && sameTeam(p.champion, data.champion) ? champPointsFor(data) : 0; champ = got; detail.champion = { pick: p && p.champion, actual: data.champion, got }; }
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
// The fixed WC2026 knockout draw, as 16 Round-of-32 ties (top→bottom: left half,
// then right half) that feed R16 → QF → SF → Final. Winners propagate; a player
// predicts a winner for every slot. Each slot is scored against the REAL result by
// team membership: for slot i of round R, find the real R-round match whose two
// teams both lie in the slot's reachable team set (its R32 subtree) and award the
// round's points if the player's pick matches that match's winner — so a pick still
// scores even if the player got an earlier round wrong.
const R32_TIES = [
  ["Germany", "Paraguay"], ["France", "Sweden"],
  ["South Africa", "Canada"], ["Netherlands", "Morocco"],
  ["Portugal", "Croatia"], ["Spain", "Austria"],
  ["USA", "Bosnia-Herzegovina"], ["Belgium", "Senegal"],
  ["Brazil", "Japan"], ["Ivory Coast", "Norway"],
  ["Mexico", "Ecuador"], ["England", "DR Congo"],
  ["Argentina", "Cape Verde"], ["Australia", "Egypt"],
  ["Switzerland", "Algeria"], ["Colombia", "Ghana"],
];
const KO_SEQ = [["R32", 16], ["R16", 8], ["QF", 4], ["SF", 2], ["F", 1]]; // outermost→final
const KO_SPAN = { R32: 1, R16: 2, QF: 4, SF: 8, F: 16 };                   // R32 ties per slot
const koSlotId = (code, i) => `${code}#${i}`;
const KO_FINAL_ID = "F#0";
// teams that could reach slot i of round `code` (leaves of its R32 subtree)
function koSlotLeaves(code, i) {
  const span = KO_SPAN[code], out = [];
  for (let k = i * span; k < i * span + span; k++) out.push(...R32_TIES[k]);
  return out;
}
// the two contenders entering a slot, from the player's child-slot picks (null = TBD)
function koSlotContenders(picks, code, i) {
  if (code === "R32") return R32_TIES[i].slice();
  const child = KO_SEQ[KO_SEQ.findIndex(([c]) => c === code) - 1][0];
  return [picks[koSlotId(child, 2 * i)] || null, picks[koSlotId(child, 2 * i + 1)] || null];
}
// drop any pick that is no longer a valid contender after an upstream change (cascades)
function koPrune(picks) {
  for (const [code, n] of KO_SEQ) {
    if (code === "R32") continue;
    for (let i = 0; i < n; i++) {
      const id = koSlotId(code, i), cont = koSlotContenders(picks, code, i).filter(Boolean);
      if (picks[id] && !cont.some((tm) => sameTeam(tm, picks[id]))) delete picks[id];
    }
  }
  return picks;
}
// the real winner of a slot once that match is played (matched by team membership)
function koSlotActualWinner(code, i, data) {
  const set = new Set(koSlotLeaves(code, i).map(teamKey));
  const m = (data.matches || []).find((x) => x.stage === "ko" && x.round === code && x.home && x.away && set.has(teamKey(x.home)) && set.has(teamKey(x.away)));
  return m ? (data.knockoutResults || {})[m.mid] || null : null;
}
// 3-letter codes for the compact bracket boxes (FIFA-style; falls back to first 3).
const TEAM3 = {
  Germany: "GER", Paraguay: "PAR", France: "FRA", Sweden: "SWE", "South Africa": "RSA", Canada: "CAN",
  Netherlands: "NED", Morocco: "MAR", Portugal: "POR", Croatia: "CRO", Spain: "ESP", Austria: "AUT",
  USA: "USA", "Bosnia-Herzegovina": "BIH", Belgium: "BEL", Senegal: "SEN", Brazil: "BRA", Japan: "JPN",
  "Ivory Coast": "CIV", Norway: "NOR", Mexico: "MEX", Ecuador: "ECU", England: "ENG", "DR Congo": "COD",
  Argentina: "ARG", "Cape Verde": "CPV", Australia: "AUS", Egypt: "EGY", Switzerland: "SUI", Algeria: "ALG",
  Colombia: "COL", Ghana: "GHA",
};
const code3 = (tm) => { const c = canonTeam(tm); return c ? (TEAM3[c] || c.slice(0, 3).toUpperCase()) : ""; };
// TheSportsDB intRound -> our round code. CONFIRMED against the live 2026 feed:
// group matchdays are intRound 1/2/3 and the Round of 32 is intRound 32. The
// later rounds follow the same round-of-N scheme (16/8/4/2) — they aren't in the
// feed until the draw is made, so they're auto-verified as they appear; the admin
// Knockout screen overrides anything the feed gets wrong.
const KO_INTROUND = { "32": "R32", "16": "R16", "8": "QF", "4": "SF", "2": "F" };
const GROUP_INTROUND = new Set(["1", "2", "3"]);
const isRealTeam = (t) => !!t && GROUP_KEYS.some((g) => GROUPS[g].some((x) => sameTeam(x, t)));
function parseFeedTs(ts) { if (!ts) return 0; const s = /[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + "Z"; const v = Date.parse(s); return Number.isFinite(v) ? v : 0; }
// Extract knockout fixtures from the season feed. A match is a knockout iff its
// intRound isn't a group matchday (1/2/3) OR it falls after the last group date
// (catches the Final, which on the round-of-N scheme reuses code 2). Group MD3 and
// R32 share dates (28 Jun), so intRound — not date alone — does the separation.
function koFixturesFromSeason(season) {
  if (!season || !season.length) return [];
  const lastGroupDate = season.filter((e) => GROUP_INTROUND.has(String(e.round))).map((e) => e.date).filter(Boolean).sort().pop() || "";
  return season.filter((e) => !GROUP_INTROUND.has(String(e.round)) || (e.date && e.date > lastGroupDate)).map((e) => {
    const round = KO_INTROUND[String(e.round)]; if (!round) return null; // e.g. 3rd-place — not in scored bracket
    const finished = e.finished && e.homeScore != null && e.awayScore != null;
    return {
      mid: `${round}_${e.eventId}`, round,
      home: isRealTeam(e.home) ? canonTeam(e.home) : null, away: isRealTeam(e.away) ? canonTeam(e.away) : null,
      venue: e.venue || "", kickoffUtc: e.ts ? new Date(parseFeedTs(e.ts)).toISOString() : null,
      home_score: finished ? Number(e.homeScore) : null, away_score: finished ? Number(e.awayScore) : null, winner: null, eventId: e.eventId,
    };
  }).filter(Boolean);
}
// Build engine match objects (stage "ko") from KO fixtures — used by boot + Sync.
function koMatchObjsFromFixtures(fixtures) {
  return (fixtures || []).map((f, i) => ({
    id: f.mid, stage: "ko", group: null, idx: i, mid: f.mid, round: f.round, home: f.home, away: f.away, venue: f.venue || "",
    ko: f.kickoffUtc ? Date.parse(f.kickoffUtc) : 0, real: true,
    finalH: f.home_score != null ? Number(f.home_score) : null, finalA: f.away_score != null ? Number(f.away_score) : null,
    penWinner: f.winner || null, eventId: f.eventId || null, allEvents: [], allStats: null, lineups: null,
  }));
}
// Fill the shootout winner on drawn knockout fixtures. The season feed flags a
// penalty tie as status PEN with the level score but no winner; the actual
// result lives on the per-event record (intHome/AwayScoreExtra), so look those
// up and stamp the winner. Best-effort and premium-only — when it can't run,
// recomputeLive's next-round inference still resolves any tie that advanced.
async function fillKoPenWinners(koFix, key) {
  const need = (koFix || []).filter((r) => r.home_score != null && r.away_score != null && Number(r.home_score) === Number(r.away_score) && !r.winner && r.eventId).map((r) => ({ key: r.mid, eventId: r.eventId }));
  if (!need.length) return koFix;
  try {
    const pens = await fetchEventFinals(need, key);
    const byMid = {}; pens.forEach((f) => { if (f.penWinner) byMid[f.key] = f.penWinner; });
    koFix.forEach((r) => { if (!r.winner && byMid[r.mid]) r.winner = byMid[r.mid]; });
  } catch (e) { /* best-effort; inference covers advanced ties */ }
  return koFix;
}
function buildBracket(data) {
  // If real knockout fixtures exist (synced from the live feed or admin-entered),
  // the bracket is drawn straight from them — real matchups and real progression.
  const koMs = (data.matches || []).filter((m) => m.stage === "ko");
  if (koMs.length) {
    const kr = data.knockoutResults || {};
    return KO_ROUNDS.map(([rk]) => ({
      round: rk,
      ties: koMs.filter((m) => m.round === rk).sort((a, b) => (a.ko || 0) - (b.ko || 0))
        .map((m) => ({ mid: m.mid, home: m.home || null, away: m.away || null, winner: kr[m.mid] || null, ko: m.ko || null, venue: m.venue || "" })),
    })).filter((r) => r.ties.length);
  }
  // Otherwise project from the CURRENT standings so it populates live and updates as
  // results land (computeGroupTable always returns the 4 group teams, ordered by
  // current points). While any group is unfinished the qualifiers are projected.
  const tables = {}; GROUP_KEYS.forEach((g) => (tables[g] = computeGroupTable(g, data)));
  const winners = GROUP_KEYS.map((g) => tables[g][0] && tables[g][0].team);
  const runners = GROUP_KEYS.map((g) => tables[g][1] && tables[g][1].team);
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
      ties.push({ mid: `${rk}_${k}`, home, away, winner, ko: null, venue: "" });
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
// The bracket slot id for a real knockout match (both its teams fall in the slot's
// reachable set). Players' bracket picks are keyed by slot, not the feed mid.
function koSlotForMatch(m) {
  if (!m || !m.home || !m.away) return null;
  const hk = teamKey(m.home), ak = teamKey(m.away), n = KO_SPAN[m.round] ? 16 / KO_SPAN[m.round] : 0;
  for (let i = 0; i < n; i++) { const set = new Set(koSlotLeaves(m.round, i).map(teamKey)); if (set.has(hk) && set.has(ak)) return koSlotId(m.round, i); }
  return null;
}
function matchPredictionTally(data, m) {
  const slotId = m.stage === "group" ? null : koSlotForMatch(m);
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
      const pk = (p.knockout && (p.knockout[slotId] || p.knockout[m.mid])) || null; // slot pick (fallback to legacy mid)
      backed = pk ? canonTeam(pk) : null;
      if (m.status === "finished") { const w = data.knockoutResults[m.mid]; got = backed && w && sameTeam(backed, w) ? koPointsFor(data)[m.round] || 0 : 0; }
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
      if (pick && sameTeam(pick, leader)) { const v = koPointsFor(data)[m.round] || 0; pts += v; items.push({ m, pick, val: v }); }
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
      // Past a sane match duration the game is OVER, even if a stale live feed
      // still reports it "live" — the clock wins. Show the feed's last score as
      // the result; otherwise "–" until a real result lands. (KO allows for ET.)
      const win = (m.stage === "ko" ? 210 : 150) * 60000;
      if (now - m.ko > win) return { ...m, status: "finished", minute: 90, ht: false, hs: lv ? lv.hs : null, as: lv ? lv.as : null, noScore: !lv, events: [], stats: null };
      return { ...m, status: "live", minute: lv && lv.minute != null ? lv.minute : Math.min(90, st.minute || 90), ht: lv ? !!lv.ht : !!st.ht, hs: lv ? lv.hs : null, as: lv ? lv.as : null, events: [], stats: null };
    }
    const st = statusOf(m.ko, now);
    if (st.status === "scheduled") return { ...m, ...st, events: [], hs: null, as: null, stats: null };
    if (st.status === "finished") return { ...m, ...st, events: m.allEvents, hs: m.finalH, as: m.finalA, stats: m.allStats };
    const events = m.allEvents.filter((e) => e.min <= st.minute);
    return { ...m, ...st, events, hs: goalsBy(events, "home"), as: goalsBy(events, "away"), stats: scaleStats(m.allStats, st.minute) };
  });
  const groupResults = {}, knockoutResults = {};
  // Shootout inference from the data source: TheSportsDB's eventsseason marks a
  // penalty decider as status "PEN" with the level 90/120-min score and NO winner
  // field, so a drawn knockout tie arrives with no recorded penWinner. The bracket
  // still reveals who advanced: the winner appears as a participant in a later-round
  // fixture. So for an undecided draw, if exactly one of its teams shows up in a
  // strictly-later knockout round, that team is the winner. (Ties whose next round
  // isn't scheduled yet stay undecided — correct, the source doesn't say yet.)
  const KO_RANK = { R32: 0, R16: 1, QF: 2, SF: 3, F: 4 };
  const koPlayed = matches.filter((m) => m.stage === "ko" && m.home && m.away);
  const advancedPast = (tk, rank) => koPlayed.some((m) => KO_RANK[m.round] > rank && (teamKey(m.home) === tk || teamKey(m.away) === tk));
  matches.forEach((m) => {
    if (m.status !== "finished" || m.finalH == null || m.finalA == null) return; // skip score-less "over" matches
    if (m.stage === "group") groupResults[matchKey(m.group, m.idx)] = { home: m.finalH, away: m.finalA };
    else {
      // A drawn knockout is decided on penalties: use the recorded shootout winner.
      let w = m.finalH > m.finalA ? canonTeam(m.home) : m.finalA > m.finalH ? canonTeam(m.away) : (m.penWinner ? canonTeam(m.penWinner) : null);
      // No recorded winner on a level tie: recover it from the data source by
      // seeing which side advanced to a later round.
      if (!w && m.finalH === m.finalA && m.home && m.away && KO_RANK[m.round] != null) {
        const r = KO_RANK[m.round], hk = teamKey(m.home), ak = teamKey(m.away);
        const hAdv = advancedPast(hk, r), aAdv = advancedPast(ak, r);
        if (hAdv && !aAdv) w = canonTeam(m.home);
        else if (aAdv && !hAdv) w = canonTeam(m.away);
      }
      if (w) knockoutResults[m.mid] = w;
    }
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
    const st = String(e.status || "").toLowerCase();
    if (/\bft\b|full|finish|aet|\bpen\b|complete|\bfinal\b|abandon|postpon/.test(st)) return; // not live anymore
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
/* Fill group-match finals from per-eventId premium lookups (fetchEventFinals).
   Only touches kicked-off group matches that still have no score, matched by
   the fixture's own eventId, and orients the feed's home/away to canonical. */
function applyEventFinals(matches, finals) {
  if (!finals || !finals.length) return matches;
  const byEv = {};
  finals.forEach((f) => { if (f && f.finished && f.eventId != null) byEv[String(f.eventId)] = f; });
  if (!Object.keys(byEv).length) return matches;
  return matches.map((m) => {
    if (m.stage !== "group" || m.finalH != null || !m.eventId) return m;
    const f = byEv[String(m.eventId)]; if (!f) return m;
    let hs = Number(f.homeScore), as = Number(f.awayScore);
    if (!Number.isFinite(hs) || !Number.isFinite(as)) return m;
    // Orient: swap only when the feed's home positively matches the canonical away.
    if (f.home && f.away && !sameTeam(f.home, m.home) && sameTeam(f.home, m.away)) { const tmp = hs; hs = as; as = tmp; }
    return { ...m, finalH: hs, finalA: as, resSource: "api-event" };
  });
}
function mapBlobToData(blob, resultRows, apiResults, playerRows) {
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
    players[name] = { groupPreds: p.groupPreds || p.predictions || p.groups || {}, champion: p.champion == null ? null : p.champion, knockout: p.knockoutPreds || p.knockout || {}, phone: p.phone || "", token: p.token || null, meta: p.meta };
  });
  // Secure mode: the authoritative picks live in the per-player rows table.
  // Overlay them over the blob so the leaderboard reflects gateway writes.
  // (Codes are NOT here — they're private; login goes through the function.)
  (playerRows || []).forEach((r) => {
    if (!r || !r.name) return;
    const cur = players[r.name] || { groupPreds: {}, champion: null, knockout: {}, phone: "", token: null, meta: null };
    players[r.name] = { ...cur, groupPreds: r.group_preds || cur.groupPreds || {}, champion: r.champion == null ? null : r.champion, knockout: r.knockout || cur.knockout || {}, phone: r.phone || cur.phone || "" };
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
      // resSource: "db" = persisted (blob/results table), "api" = transient feed
      // fill (not in the DB yet). Lets the admin Sync know what still needs saving.
      let resSource = hasRes ? "db" : null;
      // DB has no result yet → fall back to the API feed, but only once the
      // fixture has actually kicked off (guards bogus finals for future games).
      if (!hasRes && apiMap[key] && ko && ko <= now) { res = apiMap[key]; groupResults[key] = res; hasRes = true; resSource = "api"; }
      matches.push({ id: key, stage: "group", group: g, idx: i, mid: null, home, away, venue: s ? s.venue || "" : "", ko, real: true, eventId: s ? s.eventId || null : null, resSource, finalH: hasRes ? Number(res.home) : null, finalA: hasRes ? Number(res.away) : null, allEvents: [], allStats: null, lineups: null });
    }
  }
  const km = blob.knockoutMatches;
  const koList = Array.isArray(km) ? km : km && typeof km === "object" ? Object.values(km) : [];
  koList.forEach((s, i) => {
    if (!s || !(s.home || s.away)) return;
    const mid = s.mid || s.key || `${s.round || "KO"}_${i}`;
    matches.push({ id: mid, stage: "ko", group: null, idx: i, mid, round: s.round || (mid.split("_")[0] || "KO"), home: s.home, away: s.away, venue: s.venue || "", ko: Date.parse(s.kickoffUtc || s.date) || 0, real: true, finalH: s.home_score != null ? Number(s.home_score) : null, finalA: s.away_score != null ? Number(s.away_score) : null, penWinner: s.winner || s.penWinner || s.advance || null, allEvents: [], allStats: null, lineups: null });
  });
  matches.sort((a, b) => a.ko - b.ko);
  return { players, groupResults: { ...groupResults }, knockoutResults: { ...(blob.knockoutResults || {}) }, champion: blob.champion || null, championOverride: blob.champion || null, settings: blob.settings || { currency: "AED" }, auditLog: Array.isArray(blob.auditLog) ? blob.auditLog : [], matches, real: true, _blob: blob };
}
function applyAdminScore(m, h, a, winner) {
  const seed = hashStr(m.id + ":" + h + ":" + a);
  // Synthetic match details need lineups; real KO fixtures may not have them.
  let allEvents = [], allStats = null;
  if (m.lineups) { allEvents = genEvents(seed, h, a, m.lineups.home, m.lineups.away, null); allStats = genStats(seed, h, a); }
  // penWinner only meaningful on a drawn knockout (decided on penalties).
  const penWinner = m.stage === "ko" && h === a ? (winner || null) : null;
  return { ...m, adminLocked: true, status: "finished", minute: 90, ht: false, finalH: h, finalA: a, hs: h, as: a, penWinner, allEvents, allStats, events: allEvents, stats: allStats };
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
  if (!t) return <span className="team muted">TBD</span>;
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
function GroupCard({ g, data, t, delay, onOpenGroup }) {
  const table = useMemo(() => computeGroupTable(g, data), [g, data]);
  return (
    <div className="card gcard" style={{ animationDelay: `${delay}ms` }}>
      <button className="gtitle gtitle-btn" onClick={() => onOpenGroup && onOpenGroup(g)}>
        <span className="gbadge">{t("group")} {g}</span>
        <span className="gtitle-view">{t("viewMatches")} ›</span>
      </button>
      <div className="gtable">
        <div className="gtr gthead">
          <span className="gc-pos2">#</span><span className="gc-team2" />
          <span>{t("P")}</span><span>{t("W")}</span><span>{t("D")}</span><span>{t("L")}</span><span>{t("GF")}</span><span>{t("GA")}</span><span>{t("GD")}</span><span className="gc-ptsh">{t("Pts")}</span>
        </div>
        {table.map((r, i) => (
          <div className={"gtr" + (i < 2 ? " qual" : "")} key={r.team}>
            <span className="gc-pos2 num">{i + 1}</span>
            <span className="gc-team2"><Team t={r.team} /></span>
            <span className="num">{r.P}</span><span className="num">{r.W}</span><span className="num">{r.D}</span><span className="num">{r.L}</span>
            <span className="num">{r.GF}</span><span className="num">{r.GA}</span>
            <span className={"num " + (r.GD > 0 ? "pos" : r.GD < 0 ? "neg" : "")}>{r.GD > 0 ? "+" : ""}{r.GD}</span>
            <span className="gc-pts2 num">{r.Pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
/* Animated knockout bracket — official-style connected columns with kickoff times */
function Bracket({ data, t, lang }) {
  const rounds = useMemo(() => buildBracket(data), [data]);
  const reduce = useReducedMotion();
  if (!rounds || !rounds.length) return <div className="card empty">{t("brkFills")}</div>;
  return (
    <div className="brk-scroll">
      <div className="brk">
        {rounds.map((rd, ri) => (
          <div className="brk-col" key={rd.round} style={{ gap: `${Math.max(10, ri * 22 + 10)}px` }}>
            <div className="brk-rlabel">{t("r_" + rd.round)}</div>
            {rd.ties.map((tie, ti) => {
              const decided = !!tie.winner;
              const hw = tie.winner && sameTeam(tie.winner, tie.home), aw = tie.winner && sameTeam(tie.winner, tie.away);
              return (
                <div className={"brk-tie" + (decided ? " decided" : "")} key={tie.mid}
                  style={{ animation: reduce ? "none" : `tieIn .5s ease both`, animationDelay: `${ri * 220 + ti * 40}ms` }}>
                  {tie.ko ? <div className="brk-when">{fmtDay(tie.ko, lang)} · {fmtTime(tie.ko, lang)}</div> : null}
                  <div className="brk-box">
                    <div className={"brk-slot" + (hw ? " win" : tie.winner ? " lose" : "")}><Team t={tie.home} dim={!tie.home} />{hw && <span className="brk-tick">✓</span>}</div>
                    <div className={"brk-slot" + (aw ? " win" : tie.winner ? " lose" : "")}><Team t={tie.away} dim={!tie.away} />{aw && <span className="brk-tick">✓</span>}</div>
                  </div>
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
// Circular SVG progress ring used by the Overview dashboard.
function ProgressRing({ pct, size = 132, stroke = 12, children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct / 100)));
  return (
    <div className="ov-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grass)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div className="ov-ring-in">{children}</div>
    </div>
  );
}
// The Home dashboard — a status-at-a-glance view for a prediction league:
// tournament progress, who's winning, what's live/next with the league's
// backing, recent results and who called them, and the prediction pulse.
function Overview({ data, lb, lang, onOpen, t, go, player }) {
  const phase = currentPhase(data);
  const all = data.matches || [];
  const done = all.filter((m) => m.status === "finished");
  const liveNow = all.filter((m) => m.status === "live");
  const total = all.length || 1;
  const pct = Math.round((done.length / total) * 100);
  const grp = all.filter((m) => m.stage === "group");
  const grpDone = grp.filter((m) => m.status === "finished").length;
  const ko = all.filter((m) => m.stage !== "group");
  const koDone = ko.filter((m) => m.status === "finished").length;
  const nPlayers = Object.keys(data.players || {}).length || 1;
  const winnerOf = (m) => (m.finalH > m.finalA ? m.home : m.finalA > m.finalH ? m.away : null);
  // Results ↔ predictions: how the league called each finished match.
  const recentCalled = useMemo(() => recentResults(data, 5).map((m) => {
    const tl = matchPredictionTally(data, m), w = winnerOf(m);
    return { m, w, hits: tl.rows.filter((r) => r.got > 0).length, backed: tl.rows.filter((r) => r.backed).length };
  }), [data]);
  const timeline = useMemo(() => pointsTimeline(data), [data]);
  const trendTop = lb.slice(0, 5).map((r) => r.name);
  const comp = useMemo(() => lb.slice(0, 6).map((r) => ({ name: r.name, group: (r.groupMatch || 0) + (r.groupRank || 0), knockout: r.knockout || 0, champion: r.champ || 0 })), [lb]);
  const pulse = useMemo(() => {
    let correct = 0, called = 0;
    done.forEach((m) => { const tl = matchPredictionTally(data, m); correct += tl.rows.filter((r) => r.got > 0).length; if (winnerOf(m)) called += tl.rows.filter((r) => r.backed).length; });
    const avg = Math.round((lb.reduce((s, r) => s + r.total, 0) / nPlayers) * 10) / 10;
    return { correct, hitRate: called ? Math.round((correct / called) * 100) : 0, avg };
  }, [data, done.length, lb, nPlayers]);
  const champCount = {};
  Object.values(data.players || {}).forEach((p) => { const c = p.champion && canonTeam(p.champion); if (c) champCount[c] = (champCount[c] || 0) + 1; });
  const topChamp = Object.entries(champCount).sort((a, b) => b[1] - a[1])[0];
  const leader = lb[0], second = lb[1];
  const lead = leader && second ? leader.total - second.total : 0;
  const next = liveNow.length ? null : all.filter((m) => m.status === "scheduled").sort((a, b) => a.ko - b.ko)[0];
  const nextTally = useMemo(() => (next ? matchPredictionTally(data, next) : null), [data, next && next.id]);
  const me = player ? lb.find((r) => r.name === player) : null;
  const dt = new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: getAppTz() }).format(new Date(nowMs()));
  return (
    <div className="view">
      {/* progress + leader hero */}
      <div className="ov-hero card">
        <div className="ov-hero-top"><span className="ts-dot" /> {t(phase)} · <b>{dt}</b></div>
        <div className="ov-hero-grid">
          <ProgressRing pct={pct}>
            <div className="ov-ring-pct num">{pct}<span>%</span></div>
            <div className="ov-ring-lbl">{t("ovComplete")}</div>
          </ProgressRing>
          <div className="ov-hero-info">
            <div className="ov-hero-kpi"><b className="num">{done.length}</b><span>{t("ovOf")} {total} {t("ovMatches")} {t("ovPlayed")}</span></div>
            <div className="ov-bars">
              <div className="ov-bar-row"><span className="ov-bar-lbl">{t("ovGroupStage")}</span><div className="ov-bar"><span style={{ width: `${(grpDone / (grp.length || 1)) * 100}%` }} /></div><span className="ov-bar-n num">{grpDone}/{grp.length}</span></div>
              <div className="ov-bar-row"><span className="ov-bar-lbl">{t("ovKnockout")}</span><div className="ov-bar"><span className="ko" style={{ width: `${(koDone / (ko.length || 1)) * 100}%` }} /></div><span className="ov-bar-n num">{koDone}/{ko.length}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* who's winning */}
      {leader && (
        <button className="ov-leader card" onClick={() => go("table")}>
          <div className="ov-leader-crown">👑</div>
          <Avatar name={leader.name} />
          <div className="ov-leader-tx">
            <span className="ov-leader-cap">{lead > 0 ? t("ovLeader") : t("ovTied")}</span>
            <b className="ov-leader-name">{leader.name}</b>
            <span className="ov-leader-sub">{lead > 0 ? <>{t("ovLeads")} <b className="num">{lead}</b> {t("pts")}{second ? <> · {t("ovChasing")}: {second.name}</> : null}</> : second ? <>= {second.name}</> : null}</span>
          </div>
          <div className="ov-leader-pts"><b className="num">{leader.total}</b><span>{t("pts")}</span><span className="ov-go">{t("ovFullTable")} ›</span></div>
        </button>
      )}

      {/* live now / up next — with who the league is backing */}
      <div className="card">
        <h3 className="cardh">{liveNow.length ? <><span className="livedot" /> {t("ovLiveTitle")}</> : <>⏭️ {t("ovUpNext")}</>}</h3>
        {liveNow.length > 0 ? liveNow.map((m) => <MatchRow key={m.id} m={m} data={data} lang={lang} onOpen={onOpen} />)
          : next ? (
            <>
              <button className="nextcard" onClick={() => onOpen(next)}>
                <div className="nc-bg" />
                <div className="nc-label">{t("nextMatch")}</div>
                <div className="nc-fix">
                  <div className="nc-team"><span className="nc-fl">{flagOf(next.home)}</span><span className="nc-tn">{canonTeam(next.home)}</span></div>
                  <div className="nc-mid"><NextCountdown ko={next.ko} t={t} /><span className="nc-when">{fmtDay(next.ko, lang)} {fmtTime(next.ko, lang)}</span></div>
                  <div className="nc-team"><span className="nc-fl">{flagOf(next.away)}</span><span className="nc-tn">{canonTeam(next.away)}</span></div>
                </div>
                <div className="nc-stage">{next.stage === "group" ? `${t("group")} ${next.group}` : t("r_" + next.round)}</div>
              </button>
              {nextTally && nextTally.home + nextTally.away > 0 && (
                <div className="ov-back">
                  <span className="ov-back-h">{t("ovBackingNext")}</span>
                  <div className="ov-back-bar">
                    <span className="ov-back-side"><b className="num">{nextTally.home}</b> {canonTeam(next.home)}</span>
                    <span className="mpbar"><span className="mpfill h" style={{ width: `${(nextTally.home / (nextTally.home + nextTally.away)) * 100}%` }} /><span className="mpfill a" style={{ width: `${(nextTally.away / (nextTally.home + nextTally.away)) * 100}%` }} /></span>
                    <span className="ov-back-side end">{canonTeam(next.away)} <b className="num">{nextTally.away}</b></span>
                  </div>
                </div>
              )}
            </>
          ) : <div className="empty sm">{t("ovNothingLive")}</div>}
      </div>

      {/* latest results — who in the league called them */}
      <div className="card">
        <h3 className="cardh">📋 {t("ovResultsCalled")} <button className="seeall" onClick={() => go("today")}>{t("seeAll")}</button></h3>
        {recentCalled.length === 0 && <div className="empty sm">{t("ovNoData")}</div>}
        {recentCalled.map(({ m, w, hits, backed }) => (
          <button key={m.id} className="ov-res" onClick={() => onOpen(m)}>
            <div className="ov-res-fix">
              <span className="ov-res-side"><span className="fl">{flagOf(m.home)}</span><span className="ov-res-tn">{canonTeam(m.home)}</span></span>
              <span className="ov-res-sc num">{m.finalH}–{m.finalA}</span>
              <span className="ov-res-side end"><span className="ov-res-tn">{canonTeam(m.away)}</span><span className="fl">{flagOf(m.away)}</span></span>
            </div>
            <div className="ov-res-call">
              {w ? <><span className={"ov-call-pill" + (hits > (backed || nPlayers) / 2 ? " hot" : "")}>{hits}/{backed || nPlayers}</span> {t("ovBacked")} <b>{canonTeam(w)}</b></>
                : <span className="ov-call-draw">🤝 {t("ovDrawNoCall")}</span>}
            </div>
          </button>
        ))}
      </div>

      {/* league prediction pulse */}
      <div className="card">
        <h3 className="cardh">🎯 {t("ovPulse")}</h3>
        <div className="ov-stats">
          <div className="ov-stat"><span className="ov-stat-v num">{pulse.avg}</span><span className="ov-stat-k">{t("ovAvgPts")}</span></div>
          <div className="ov-stat"><span className="ov-stat-v num">{pulse.hitRate}%</span><span className="ov-stat-k">{t("ovHitRate")}</span></div>
          <div className="ov-stat ov-stat-wide">
            <span className="ov-stat-k">👑 {t("ovTopChamp")}</span>
            {topChamp ? <span className="ov-stat-big">{flagOf(topChamp[0])} {topChamp[0]} <b className="num">{topChamp[1]}</b>/{nPlayers} {t("ovTopChampN")}</span> : <span className="ov-stat-big dim">{t("ovNoChamp")}</span>}
          </div>
        </div>
      </div>

      {/* podium mini */}
      <div className="card">
        <h3 className="cardh">🏅 {t("ovPodium")} <button className="seeall" onClick={() => go("table")}>{t("seeAll")}</button></h3>
        {lb.slice(0, 5).map((r, i) => (
          <button key={r.name} className="ov-rankrow" onClick={() => go("table")}>
            <span className={"ov-rk num" + (i === 0 ? " gold" : "")}>{i + 1}</span>
            <Avatar name={r.name} />
            <span className="ov-rk-name">{r.name}</span>
            <span className="ov-rk-pts num">{r.total}</span>
          </button>
        ))}
      </div>

      {/* points trends */}
      {timeline.length > 1 && (
        <div className="card">
          <h3 className="cardh">📈 {t("nav_trends")} <button className="seeall" onClick={() => go("trends")}>{t("seeAll")}</button></h3>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={timeline} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} width={28} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {trendTop.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} dot={{ r: 2 }} animationDuration={1000} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* where points come from */}
      <div className="card">
        <h3 className="cardh">🧱 {t("trComp")} <button className="seeall" onClick={() => go("trends")}>{t("seeAll")}</button></h3>
        <ResponsiveContainer width="100%" height={Math.max(180, comp.length * 34)}>
          <BarChart layout="vertical" data={comp} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11, fill: "var(--ink)" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)" }} cursor={{ fill: "rgba(25,195,125,.06)" }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="group" stackId="a" fill="var(--grass-d)" name={t("groupRank")} radius={[4, 0, 0, 4]} />
            <Bar dataKey="knockout" stackId="a" fill="var(--gold)" name={t("knockout")} />
            <Bar dataKey="champion" stackId="a" fill="var(--gold-d)" name={t("champion")} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* your position */}
      {me ? (
        <button className="ov-you card" onClick={() => go("bracket")}>
          <div className="ov-you-tx"><span className="ov-leader-cap">{t("ovYourRank")}</span><b>#{me.rank} · {me.name}</b></div>
          <div className="ov-you-pts"><b className="num">{me.total}</b> {t("pts")} <span className="ov-go">{t("ovViewBracket")} ›</span></div>
        </button>
      ) : <button className="ov-you card sub" onClick={() => go("mypicks")}><span className="hint">{t("ovSignInSee")}</span></button>}
    </div>
  );
}
function Leaderboard({ data, lb, prevRanks, name, setName, t, go }) {
  const top3 = lb.slice(0, 3), order = [top3[1], top3[0], top3[2]];
  const sel = lb.find((r) => r.name === name) || lb[0];
  const [grpOpen, setGrpOpen] = useState(false);
  const detRef = useRef();
  const pick = (n) => { setName(n); setTimeout(() => detRef.current && detRef.current.scrollIntoView({ behavior: "smooth", block: "start" }), 70); };
  return (
    <div className="view">
      <div className="podium">
        {order.map((r, i) => r && (
          <div className={"pod" + (r.rank === 1 ? " p1" : "") + (sel && r.name === sel.name ? " sel" : "")} key={r.name} onClick={() => pick(r.name)} style={{ animationDelay: `${i * 90}ms` }}>
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
        <LeaderboardBars lb={lb} prevRanks={prevRanks} t={t} onPick={pick} />
      </div>
      {sel && (
        <>
          <div className="card slim selhead" ref={detRef}>
            <Avatar name={sel.name} />
            <div className="selhead-tx"><b>{sel.name}</b><span className="hint">{t("rank")} #{sel.rank} · {sel.total} {t("pts")}</span></div>
            <button className="seeall" onClick={() => go("profile", sel.name)}>{t("nav_profile")} ›</button>
          </div>
          <PointsHow row={sel} t={t} />
          <KnockoutCompare p={data.players[sel.name]} data={data} t={t} name={sel.name} />
          <div className="card slim">
            <button className="mypick-lbl collapse" onClick={() => setGrpOpen((v) => !v)} aria-expanded={grpOpen}>
              <span>📂 {t("groupBreakdown")}{!grpOpen && <span className="coll-lock"> · {t("tapExpand")}</span>}</span>
              <span className="coll-chev">{grpOpen ? "▾" : "▸"}</span>
            </button>
            {grpOpen && <p className="hint block">{t("gcHint")}</p>}
          </div>
          {grpOpen && GROUP_KEYS.map((g) => <GroupCompare key={g} g={g} p={data.players[sel.name]} data={data} t={t} name={sel.name} />)}
        </>
      )}
    </div>
  );
}
function Groups({ data, t, lang, onOpenGroup }) {
  const [tab, setTab] = useState("groups"); // "groups" | "ko"
  return (
    <div className="view">
      <div className="brk-tabs" role="tablist">
        <button role="tab" className={"brk-tab" + (tab === "groups" ? " on" : "")} onClick={() => setTab("groups")}>📊 {t("nav_groups")}</button>
        <button role="tab" className={"brk-tab" + (tab === "ko" ? " on" : "")} onClick={() => setTab("ko")}>🏆 {t("knockout")}</button>
      </div>
      {tab === "groups" ? (
        <>
          <div className="card slim glegend">
            <span className="glegend-h">{t("legend")}</span>
            <span className="glegend-i"><b>{t("P")}</b> {t("leg_P")}</span>
            <span className="glegend-i"><b>{t("W")}</b> {t("leg_W")}</span>
            <span className="glegend-i"><b>{t("D")}</b> {t("leg_D")}</span>
            <span className="glegend-i"><b>{t("L")}</b> {t("leg_L")}</span>
            <span className="glegend-i"><b>{t("GF")}</b> {t("leg_GF")}</span>
            <span className="glegend-i"><b>{t("GA")}</b> {t("leg_GA")}</span>
            <span className="glegend-i"><b>{t("GD")}</b> {t("leg_GD")}</span>
            <span className="glegend-i"><b>{t("Pts")}</b> {t("leg_Pts")}</span>
          </div>
          <div className="gwrap">
            {GROUP_KEYS.map((g, i) => <GroupCard g={g} data={data} t={t} key={g} delay={i * 40} onOpenGroup={onOpenGroup} />)}
          </div>
        </>
      ) : (
        <div className="card">
          <KnockoutBracketG data={data} t={t} lang={lang} />
        </div>
      )}
    </div>
  );
}
// A player's full predicted bracket in the classic template layout (left half →
// trophy → right half). Each pick is coloured green/red once its real result lands.
// ---- Knockout bracket renderer (canvas) -------------------------------
// One renderer for both the on-screen bracket (scales to fit the screen, so the
// whole diagram is always visible) and the shareable PNG. Draws boxes, 3-letter
// codes, real connector lines, the trophy/champion and (for share) a points line.
function rrPath(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
function drawBracket(canvas, opts) {
  const { data, t } = opts, header = !!opts.header, S = 2, W = 1720, H = header ? 1140 : 900;
  const dark = !header; // on-screen diagram gets a premium dark backdrop; share image stays light
  canvas.width = W * S; canvas.height = H * S;
  const x = canvas.getContext("2d"); x.setTransform(S, 0, 0, S, 0, 0);
  if (dark) {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0d2a1e"); g.addColorStop(.5, "#0a2017"); g.addColorStop(1, "#081912");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const rg = x.createRadialGradient(W / 2, H / 2 - 40, 12, W / 2, H / 2 - 40, 320); rg.addColorStop(0, "rgba(245,196,81,.16)"); rg.addColorStop(1, "rgba(245,196,81,0)");
    x.fillStyle = rg; x.fillRect(0, 0, W, H);
  } else { x.fillStyle = "#f7f8fa"; x.fillRect(0, 0, W, H); }
  if (header) {
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = "#0e2a47"; x.font = "800 25px Arial, sans-serif"; x.fillText("2026 FIFA WORLD CUP · KNOCKOUT", W / 2, 32);
    x.fillStyle = "#c2143b"; x.font = "800 17px Arial, sans-serif"; x.fillText("— " + (opts.name || "") + " —", W / 2, 60);
  }
  const connCol = dark ? "rgba(255,255,255,.22)" : "#cdd5de";
  let res = null;
  if (opts.mode === "results") { res = {}; for (const [code, n] of KO_SEQ) for (let i = 0; i < n; i++) { const w = koSlotActualWinner(code, i, data); if (w) res[koSlotId(code, i)] = w; } }
  const slotInfo = (code, i) => {
    const id = koSlotId(code, i);
    if (opts.mode === "results") {
      const [a, b] = koSlotContenders(res, code, i).map((tt) => tt ? canonTeam(tt) : null);
      const w = res[id] ? canonTeam(res[id]) : null;
      return { a, b, winner: w, status: w ? "correct" : null };
    }
    const [a, b] = koSlotContenders(opts.picks, code, i).map((tt) => tt ? canonTeam(tt) : null);
    const pick = opts.picks[id] ? canonTeam(opts.picks[id]) : null;
    const actual = koSlotActualWinner(code, i, data);
    const status = !pick ? null : actual ? (sameTeam(pick, actual) ? "correct" : "wrong") : "pending";
    return { a, b, winner: pick, status };
  };
  // "path to win" trace: highlight the slots a tapped team wins through.
  const traceK = opts.trace ? teamKey(opts.trace) : null;
  const src = opts.mode === "results" ? res : opts.picks;
  const pathSet = new Set();
  if (traceK) {
    // walk the team's road: its slot each round, stopping where it's eliminated
    // or the result is undecided (the frontier) — so a tap always shows a path.
    for (const [code, n] of KO_SEQ) {
      let si = -1;
      for (let i = 0; i < n; i++) if (koSlotLeaves(code, i).some((tt) => teamKey(tt) === traceK)) { si = i; break; }
      if (si < 0) break;
      const id = koSlotId(code, si); pathSet.add(id);
      const w = src && src[id];
      if (!w || teamKey(w) !== traceK) break;
    }
  }
  const top = header ? 96 : 24, bottom = H - (header ? 64 : 24), areaH = bottom - top;
  const boxW = 176, boxH = 56, colGap = 18, stepX = boxW + colGap;
  const lx = [14, 14 + stepX, 14 + 2 * stepX, 14 + 3 * stepX];
  const rx = lx.map((v) => W - boxW - v);
  const cxx = W / 2 - boxW / 2, spacing = areaH / 8;
  const yOf = (r, i) => top + spacing * Math.pow(2, r) * (i + 0.5);
  const boxCenter = (code, i) => {
    if (code === "F") return { cx: cxx + boxW / 2, cy: H / 2 - 30 };
    const rIdx = { R32: 0, R16: 1, QF: 2, SF: 3 }[code], n = [8, 4, 2, 1][rIdx], right = i >= n, li = right ? i - n : i;
    return { cx: (right ? rx[rIdx] : lx[rIdx]) + boxW / 2, cy: yOf(rIdx, li) };
  };
  const COL = { correct: ["#e6f4ea", "#137a3b"], wrong: ["#fdecea", "#b71c1c"], pending: ["#eef1f4", "#16324f"] };
  const fit = (str, maxW) => { if (x.measureText(str).width <= maxW) return str; let s = str; while (s.length > 1 && x.measureText(s + "…").width > maxW) s = s.slice(0, -1); return s + "…"; };
  const drawMatch = (px, cy, info, slotId) => {
    if (opts.hits) opts.hits.push({ x: px, y: cy - boxH / 2, w: boxW, h: boxH, a: info.a, b: info.b });
    const onPath = slotId && pathSet.has(slotId), dim = traceK && !onPath;
    x.save(); if (dim) x.globalAlpha = 0.22;
    rrPath(x, px, cy - boxH / 2, boxW, boxH, 11);
    if (dark) { x.shadowColor = onPath ? "rgba(245,196,81,.55)" : "rgba(0,0,0,.35)"; x.shadowBlur = onPath ? 16 : 9; x.shadowOffsetY = 3; }
    x.fillStyle = "#fff"; x.fill(); x.shadowColor = "transparent"; x.shadowBlur = 0; x.shadowOffsetY = 0;
    x.strokeStyle = onPath ? "#e6a31e" : (dark ? "#e6ecea" : "#d3d9e0"); x.lineWidth = onPath ? 3 : 1; x.stroke();
    x.beginPath(); x.moveTo(px + 8, cy); x.lineTo(px + boxW - 8, cy); x.strokeStyle = "#eef2f6"; x.lineWidth = 1; x.stroke();
    x.textBaseline = "middle";
    const slot = (tm, sy) => {
      const isW = info.winner && tm && sameTeam(tm, info.winner);
      if (isW && info.status) { x.fillStyle = COL[info.status][0]; rrPath(x, px + 3, sy - 13, boxW - 6, 26, 7); x.fill(); }
      x.textAlign = "left"; x.font = "20px Arial, sans-serif";
      if (tm) x.fillText(flagOf(tm), px + 11, sy + 1);
      x.font = "700 16px Arial, sans-serif";
      x.fillStyle = !tm ? "#9aa6b2" : (isW && info.status) ? COL[info.status][1] : (info.winner ? "#9aa6b2" : "#16324f");
      const label = tm ? fit(canonTeam(tm), boxW - 52) : "—";
      x.fillText(label, px + 40, sy + 1);
      if (info.winner && tm && !isW) { const tw = x.measureText(label).width; x.strokeStyle = "#b3bdc6"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(px + 40, sy + 1); x.lineTo(px + 40 + tw, sy + 1); x.stroke(); }
    };
    slot(info.a, cy - 14); slot(info.b, cy + 14);
    x.restore();
  };
  const connector = (cols, r, side) => {
    const parents = 8 / Math.pow(2, r + 1); x.strokeStyle = connCol; x.lineWidth = 1.4;
    for (let i = 0; i < parents; i++) {
      const c1 = yOf(r, 2 * i), c2 = yOf(r, 2 * i + 1), py = yOf(r + 1, i);
      const edge = side === "L" ? cols[r] + boxW : cols[r];
      const mid = side === "L" ? cols[r] + boxW + colGap / 2 : cols[r] - colGap / 2;
      const pedge = side === "L" ? cols[r + 1] : cols[r + 1] + boxW;
      x.beginPath(); x.moveTo(edge, c1); x.lineTo(mid, c1); x.moveTo(edge, c2); x.lineTo(mid, c2); x.moveTo(mid, c1); x.lineTo(mid, c2); x.moveTo(mid, py); x.lineTo(pedge, py); x.stroke();
    }
  };
  const seq = [["R32", 8], ["R16", 4], ["QF", 2], ["SF", 1]], off = { R32: 8, R16: 4, QF: 2, SF: 1 };
  // gold "path to win", drawn first so boxes overlay it (shows in the gaps);
  // animates on (traceProgress 0→1) when a team is tapped.
  if (traceK && pathSet.size) {
    const pp = [];
    for (const [code, n] of KO_SEQ) { let ci = -1; for (let i = 0; i < n; i++) if (pathSet.has(koSlotId(code, i))) { ci = i; break; } if (ci >= 0) pp.push(boxCenter(code, ci)); }
    const segs = []; let total = 0;
    for (let i = 1; i < pp.length; i++) { const d = Math.hypot(pp[i].cx - pp[i - 1].cx, pp[i].cy - pp[i - 1].cy); segs.push(d); total += d; }
    let draw = total * (opts.traceProgress == null ? 1 : opts.traceProgress);
    // soft glow underlay then the bright core line
    x.save(); x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "rgba(255,210,70,.85)"; x.lineWidth = 9; x.shadowColor = "rgba(255,200,60,.9)"; x.shadowBlur = 22; x.beginPath();
    if (pp.length) {
      x.moveTo(pp[0].cx, pp[0].cy);
      for (let i = 1; i < pp.length; i++) { const seg = segs[i - 1]; if (draw >= seg) { x.lineTo(pp[i].cx, pp[i].cy); draw -= seg; } else { const f = seg ? draw / seg : 0; x.lineTo(pp[i - 1].cx + (pp[i].cx - pp[i - 1].cx) * f, pp[i - 1].cy + (pp[i].cy - pp[i - 1].cy) * f); draw = 0; break; } }
    }
    x.stroke();
    x.strokeStyle = "#ffd84d"; x.lineWidth = 4.5; x.shadowBlur = 0; x.stroke();
    x.restore();
  }
  [0, 1, 2].forEach((r) => connector(lx, r, "L"));
  x.strokeStyle = connCol; x.lineWidth = 1.4; x.beginPath(); x.moveTo(lx[3] + boxW, yOf(3, 0)); x.lineTo(cxx, H / 2 - 30); x.stroke();
  [0, 1, 2].forEach((r) => connector(rx, r, "R"));
  x.strokeStyle = connCol; x.lineWidth = 1.4; x.beginPath(); x.moveTo(rx[3], yOf(3, 0)); x.lineTo(cxx + boxW, H / 2 - 30); x.stroke();
  seq.forEach(([code, n], r) => { for (let i = 0; i < n; i++) drawMatch(lx[r], yOf(r, i), slotInfo(code, i), koSlotId(code, i)); });
  seq.forEach(([code, n], r) => { for (let i = 0; i < n; i++) drawMatch(rx[r], yOf(r, i), slotInfo(code, off[code] + i), koSlotId(code, off[code] + i)); });
  drawMatch(cxx, H / 2 - 30, slotInfo("F", 0), "F#0");
  x.textAlign = "center"; x.textBaseline = "alphabetic"; x.fillStyle = dark ? "rgba(255,255,255,.55)" : "#6b7a8d"; x.font = "800 12px Arial, sans-serif"; x.fillText((t("r_F") || "Final").toUpperCase(), W / 2, H / 2 + 4);
  x.font = "40px Arial, sans-serif"; x.save(); if (dark) { x.shadowColor = "rgba(245,196,81,.9)"; x.shadowBlur = 26; } x.fillText("🏆", W / 2, H / 2 - 84); x.restore();
  const ci = slotInfo("F", 0), champ = ci.winner;
  rrPath(x, cxx - 14, H / 2 + 18, boxW + 28, 34, 10);
  if (champ && ci.status && ci.status !== "pending") { x.fillStyle = COL[ci.status][0]; x.fill(); x.strokeStyle = COL[ci.status][1]; } else { const cg = x.createLinearGradient(0, H / 2 + 18, 0, H / 2 + 52); cg.addColorStop(0, "#ffd970"); cg.addColorStop(1, "#f0b429"); x.fillStyle = cg; x.fill(); x.strokeStyle = "#caa033"; }
  x.lineWidth = 1.5; x.stroke();
  x.fillStyle = champ && ci.status && ci.status !== "pending" ? COL[ci.status][1] : "#3a2c00"; x.font = "800 17px Arial, sans-serif"; x.fillText("👑 " + (champ ? fit(champ, boxW + 8) : "—"), W / 2, H / 2 + 41);
  if (header) { x.fillStyle = "#0e2a47"; x.font = "800 14px Arial, sans-serif"; x.fillText(`${opts.koPts} ${t("knockout")} pts · ${opts.totalPts} ${t("pts")}`, W / 2, H - 32); }
}
function makeBracketCanvas(opts) { const c = document.createElement("canvas"); drawBracket(c, opts); return c; }
// Crisp DOM two-sided bracket (left ▸ trophy ◂ right), upright & readable.
// Scroll to roam, pinch / +− / ctrl-wheel to zoom, tap a team for its animated
// gold "path to win".
const BR = { BW: 160, BH: 58, stepX: 192, rowH: 78, VPAD: 22, W: 1720, H: 664 };
function brYOf(r, i) { return BR.VPAD + BR.rowH * Math.pow(2, r) * (i + 0.5); }
const brLX = [0, BR.stepX, 2 * BR.stepX, 3 * BR.stepX];
const brRX = brLX.map((v) => BR.W - BR.BW - v);
const brFinalX = (BR.W - BR.BW) / 2, brFinalY = BR.H / 2;
function brBoxCenter(code, i) {
  if (code === "F") return { cx: brFinalX + BR.BW / 2, cy: brFinalY };
  const r = { R32: 0, R16: 1, QF: 2, SF: 3 }[code], n = [8, 4, 2, 1][r], right = i >= n, li = right ? i - n : i;
  return { cx: (right ? brRX[r] : brLX[r]) + BR.BW / 2, cy: brYOf(r, li) };
}
function BracketDiagram({ data, picks, mode, t }) {
  const vpRef = useRef(null);
  const [trace, setTrace] = useState(null);
  const [z, setZ] = useState(1);
  const zRef = useRef(1);
  // Rotated 90° in portrait (turn the phone), upright in landscape.
  const [portrait, setPortrait] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(orientation: portrait)").matches : true));
  const portRef = useRef(portrait); portRef.current = portrait;
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const on = () => setPortrait(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, []);
  const stageW = (zz) => (portRef.current ? BR.H : BR.W) * zz;
  const stageH = (zz) => (portRef.current ? BR.W : BR.H) * zz;
  const setZoom = (nz, ax, ay) => {
    const vp = vpRef.current; if (!vp) return;
    nz = Math.max(0.2, Math.min(2.4, nz));
    const oz = zRef.current, px = ax == null ? vp.clientWidth / 2 : ax, py = ay == null ? vp.clientHeight / 2 : ay;
    const fx = (vp.scrollLeft + px) / Math.max(1, stageW(oz)), fy = (vp.scrollTop + py) / Math.max(1, stageH(oz));
    zRef.current = nz; setZ(nz);
    requestAnimationFrame(() => { vp.scrollLeft = fx * stageW(nz) - px; vp.scrollTop = fy * stageH(nz) - py; });
  };
  // pinch-to-zoom (and ctrl-wheel) via non-passive listeners; single-finger pans natively
  useEffect(() => {
    const vp = vpRef.current; if (!vp) return;
    let pd = null;
    const dist = (tt) => Math.hypot(tt[0].clientX - tt[1].clientX, tt[0].clientY - tt[1].clientY);
    const ts = (e) => { if (e.touches.length === 2) pd = { d: dist(e.touches), z: zRef.current }; };
    const tm = (e) => { if (e.touches.length === 2 && pd) { e.preventDefault(); const r = vp.getBoundingClientRect(), mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2; setZoom(pd.z * dist(e.touches) / pd.d, mx - r.left, my - r.top); } };
    const te = (e) => { if (e.touches.length < 2) pd = null; };
    const wheel = (e) => { if (e.ctrlKey) { e.preventDefault(); const r = vp.getBoundingClientRect(); setZoom(zRef.current * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - r.left, e.clientY - r.top); } };
    vp.addEventListener("touchstart", ts, { passive: false }); vp.addEventListener("touchmove", tm, { passive: false }); vp.addEventListener("touchend", te); vp.addEventListener("wheel", wheel, { passive: false });
    return () => { vp.removeEventListener("touchstart", ts); vp.removeEventListener("touchmove", tm); vp.removeEventListener("touchend", te); vp.removeEventListener("wheel", wheel); };
  }, []);
  const player = mode === "player";
  const res = {};
  for (const [code, n] of KO_SEQ) for (let i = 0; i < n; i++) { const w = koSlotActualWinner(code, i, data); if (w) res[koSlotId(code, i)] = w; }
  const source = player ? (picks || {}) : res;
  const slotInfo = (code, i) => {
    const id = koSlotId(code, i);
    let a, b;
    if (code === "R32") { [a, b] = R32_TIES[i]; } else { const c = koSlotContenders(source, code, i); a = c[0]; b = c[1]; }
    const actual = koSlotActualWinner(code, i, data);
    const pick = player ? (picks && picks[id]) || null : res[id] || null;
    let status = null;
    if (pick) status = player ? (actual ? (sameTeam(pick, actual) ? "correct" : "wrong") : "pick") : "won";
    return { a: a ? canonTeam(a) : null, b: b ? canonTeam(b) : null, winner: pick ? canonTeam(pick) : null, status };
  };
  // the traced team's road (its slot each round up to elimination / the frontier)
  const traceK = trace ? teamKey(trace) : null;
  const pathSet = new Set();
  if (traceK) for (const [code, n] of KO_SEQ) {
    let si = -1; for (let i = 0; i < n; i++) if (koSlotLeaves(code, i).some((tt) => teamKey(tt) === traceK)) { si = i; break; }
    if (si < 0) break; const id = koSlotId(code, si); pathSet.add(id); const w = source[id]; if (!w || teamKey(w) !== traceK) break;
  }
  // cards
  const seq = [["R32", 8], ["R16", 4], ["QF", 2], ["SF", 1]], off = { R32: 8, R16: 4, QF: 2, SF: 1 };
  const cards = [];
  seq.forEach(([code, n], r) => { for (let i = 0; i < n; i++) cards.push({ code, idx: i, x: brLX[r], y: brYOf(r, i) - BR.BH / 2 }); });
  seq.forEach(([code, n], r) => { for (let i = 0; i < n; i++) cards.push({ code, idx: off[code] + i, x: brRX[r], y: brYOf(r, i) - BR.BH / 2 }); });
  cards.push({ code: "F", idx: 0, x: brFinalX, y: brFinalY - BR.BH / 2 });
  // connectors
  const conns = [];
  for (let r = 0; r < 3; r++) { const parents = [4, 2, 1][r]; for (let j = 0; j < parents; j++) {
    const c1 = brYOf(r, 2 * j), c2 = brYOf(r, 2 * j + 1), py = brYOf(r + 1, j);
    const le = brLX[r] + BR.BW, lm = le + 15, lp = brLX[r + 1];
    conns.push(`M${le} ${c1} H${lm} M${le} ${c2} H${lm} M${lm} ${c1} V${c2} M${lm} ${py} H${lp}`);
    const re = brRX[r], rm = re - 15, rp = brRX[r + 1] + BR.BW;
    conns.push(`M${re} ${c1} H${rm} M${re} ${c2} H${rm} M${rm} ${c1} V${c2} M${rm} ${py} H${rp}`);
  } }
  conns.push(`M${brLX[3] + BR.BW} ${brYOf(3, 0)} H${brFinalX}`);
  conns.push(`M${brRX[3]} ${brYOf(3, 0)} H${brFinalX + BR.BW}`);
  // gold path
  let goldD = "";
  if (pathSet.size) { const pp = []; for (const [code, n] of KO_SEQ) { for (let i = 0; i < n; i++) if (pathSet.has(koSlotId(code, i))) { pp.push(brBoxCenter(code, i)); break; } } goldD = pp.map((p, k) => (k ? "L" : "M") + p.cx + " " + p.cy).join(" "); }
  // champion
  const ci = slotInfo("F", 0), champ = ci.winner, champStatus = ci.status;
  // fit the WHOLE bracket into the viewport (rotation-aware), then centre it
  const fitAll = (smooth) => {
    const vp = vpRef.current; if (!vp) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const cw = portRef.current ? BR.H : BR.W, ch = portRef.current ? BR.W : BR.H;
    const nz = Math.max(0.2, Math.min(2.4, Math.min(vw / cw, vh / ch) * 0.98));
    zRef.current = nz; setZ(nz);
    requestAnimationFrame(() => {
      const l = Math.max(0, (stageW(nz) - vw) / 2), tp = Math.max(0, (stageH(nz) - vh) / 2);
      if (smooth) vp.scrollTo({ left: l, top: tp, behavior: "smooth" }); else { vp.scrollLeft = l; vp.scrollTop = tp; }
    });
  };
  useEffect(() => { const raf = requestAnimationFrame(() => fitAll(false)); return () => cancelAnimationFrame(raf); }, [mode, portrait]);
  const recenter = () => fitAll(true);
  const tapTeam = (tm) => (e) => { e.stopPropagation(); if (!tm) return; setTrace((p) => (p && sameTeam(p, tm) ? null : tm)); };
  const Box = ({ c }) => {
    const v = slotInfo(c.code, c.idx), id = koSlotId(c.code, c.idx);
    const onPath = pathSet.has(id);
    const row = (tm) => {
      const isW = v.winner && tm && sameTeam(tm, v.winner);
      const cls = "domb-row" + (isW && v.status ? " win " + v.status : "") + (v.winner && tm && !isW ? " out" : "");
      return (
        <div className={cls} onClick={tapTeam(tm)}>
          {tm ? <span className="domb-fl">{flagOf(tm)}</span> : <span className="domb-fl domb-tbd">🛡️</span>}
          <span className="domb-nm">{tm || t("koTba2")}</span>
          {isW && v.status === "correct" ? <span className="domb-mk ok">✓</span> : isW && v.status === "wrong" ? <span className="domb-mk no">✗</span> : null}
        </div>
      );
    };
    return <div className={"domb-box" + (onPath ? " on" : "") + (c.code === "F" ? " fin" : "")} style={{ left: c.x, top: c.y }}>{row(v.a)}{row(v.b)}</div>;
  };
  const rot = portrait ? `translateX(${BR.H * z}px) rotate(90deg) scale(${z})` : `scale(${z})`;
  return (
    <div className={"domb" + (trace ? " tracing" : "")}>
      <div className="bdg-bar">
        <span className="bdg-hint">{trace ? <><span className="bdg-dot" /> {trace} · {t("bdgPath")}</> : <>{portrait ? <>↻ {t("bdgTurn")} · </> : null}{t("bdgTapTeam")}</>}</span>
        <div className="bdg-btns">
          {trace && <button className="bdg-b" onClick={() => setTrace(null)} aria-label={t("hide")}>✕</button>}
          <button className="bdg-b" onClick={() => setZoom(zRef.current * 0.8)} aria-label="zoom out">－</button>
          <button className="bdg-b" onClick={() => setZoom(zRef.current * 1.25)} aria-label="zoom in">＋</button>
          <button className="bdg-b" onClick={recenter} aria-label="centre" title="centre">⤢</button>
        </div>
      </div>
      <div className="domb-vp" ref={vpRef}>
        <div className="domb-stage" style={{ width: stageW(z), height: stageH(z) }}>
          <div className="domb-rot" style={{ width: BR.W, height: BR.H, transform: rot, transformOrigin: "0 0" }}>
            <svg className="domb-svg" width={BR.W} height={BR.H} viewBox={`0 0 ${BR.W} ${BR.H}`}>
              {conns.map((d, k) => <path key={k} d={d} className="domb-conn" />)}
              {goldD ? <path key={"g" + trace} d={goldD} className="domb-gold" pathLength="1" /> : null}
            </svg>
            <div className="domb-trophy" style={{ left: brFinalX + BR.BW / 2, top: brFinalY - 58 }}>🏆</div>
            {cards.map((c, k) => <Box key={k} c={c} />)}
            <div className={"domb-champ" + (champStatus ? " " + champStatus : "")} style={{ left: brFinalX - 8, top: brFinalY + BR.BH / 2 + 16 }}>
              <span className="domb-champ-cap">👑</span>
              <span className="domb-champ-nm">{champ ? <><span className="domb-fl">{flagOf(champ)}</span>{champ}</> : "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
async function shareBracketImage(name, picks, data, koPts, totalPts, t) {
  const canvas = makeBracketCanvas({ data, picks, mode: "player", header: true, name, koPts, totalPts, t });
  await new Promise((res) => canvas.toBlob(async (blob) => {
    if (!blob) return res();
    const fname = `bracket-${name.replace(/\s+/g, "_")}.png`;
    try {
      const file = new File([blob], fname, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `${name} · Knockout bracket` }); return res(); }
    } catch (e) { /* fall through to download */ }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    res();
  }, "image/png"));
}
// The live feed match for a bracket slot (both its teams in the slot's set).
function koMatchForSlot(code, i, data) {
  const set = new Set(koSlotLeaves(code, i).map(teamKey));
  return (data.matches || []).find((x) => x.stage === "ko" && x.round === code && x.home && x.away && set.has(teamKey(x.home)) && set.has(teamKey(x.away))) || null;
}
// Interactive knockout diagram. Two modes:
//   mode "results" — the live tournament bracket (actual winners).
//   mode "player"  — a player's predicted bracket (picks), coloured by correctness.
// Round tabs, full flag + country name cards, bracket connectors, a champion hero,
// and tap-a-team to trace their run through the bracket.
function KnockoutBracketG({ data, t, lang, picks, mode = "results" }) {
  const [r, setR] = useState(0);
  const [hi, setHi] = useState(null); // highlighted team (key) to trace a run
  const player = mode === "player";
  const res = {};
  for (const [code, n] of KO_SEQ) for (let i = 0; i < n; i++) { const w = koSlotActualWinner(code, i, data); if (w) res[koSlotId(code, i)] = w; }
  const source = player ? (picks || {}) : res;
  const view = (code, i) => {
    const id = koSlotId(code, i), m = koMatchForSlot(code, i, data);
    let a, b;
    if (code === "R32") { [a, b] = R32_TIES[i]; } else { const c = koSlotContenders(source, code, i); a = c[0]; b = c[1]; }
    if (!player && m) { a = m.home || a; b = m.away || b; }
    const actual = koSlotActualWinner(code, i, data);
    const pick = player ? (picks && picks[id]) || null : res[id] || (m && (data.knockoutResults || {})[m.mid]) || null;
    let status = null;
    if (pick) status = player ? (actual ? (sameTeam(pick, actual) ? "correct" : "wrong") : "pick") : "won";
    return {
      a: a ? canonTeam(a) : null, b: b ? canonTeam(b) : null, pick: pick ? canonTeam(pick) : null, status,
      hs: !player && m ? (m.finalH != null ? m.finalH : m.hs) : null, as: !player && m ? (m.finalA != null ? m.finalA : m.as) : null,
      ko: m ? m.ko : null, mstat: m ? m.status : null,
    };
  };
  const teamRow = (tm, score, v) => {
    const isPick = v.pick && tm && sameTeam(tm, v.pick);
    const mark = isPick ? (v.status === "correct" ? "✓" : v.status === "wrong" ? "✗" : "◄") : "";
    const cls = "gko-row" + (isPick ? " pick " + v.status : "") + (hi && tm && teamKey(tm) === hi ? " hl" : "");
    return (
      <div className={cls} onClick={tm ? (e) => { e.stopPropagation(); setHi((h) => (h === teamKey(tm) ? null : teamKey(tm))); } : undefined}>
        {tm ? <span className="gko-fl">{flagOf(tm)}</span> : <span className="gko-fl gko-tbd">🛡️</span>}
        <span className={"gko-tn" + (tm ? "" : " dim")}>{tm || t("koTba2")}</span>
        {score != null ? <span className="gko-sc">{score}</span> : null}
        {mark ? <span className={"gko-adv " + (v.status || "")}>{mark}</span> : null}
      </div>
    );
  };
  const Card = ({ v }) => (
    <div className="gko-card">
      {(v.ko || v.mstat) && <div className="gko-when">{v.ko ? `${fmtDay(v.ko, lang)} · ${fmtTime(v.ko, lang)}` : ""}{v.mstat === "finished" ? <span className="gko-badge">FT</span> : v.mstat === "live" ? <span className="gko-badge live">LIVE</span> : null}</div>}
      {teamRow(v.a, v.hs, v)}
      {teamRow(v.b, v.as, v)}
    </div>
  );
  const [code] = KO_SEQ[r], last = r === KO_SEQ.length - 1;
  const champPick = player ? (picks && picks[KO_FINAL_ID]) : res[KO_FINAL_ID];
  const champ = champPick ? canonTeam(champPick) : null;
  const champActual = koSlotActualWinner("F", 0, data);
  const champStatus = champ ? (player ? (champActual ? (sameTeam(champ, champActual) ? "correct" : "wrong") : "pick") : "won") : null;
  // swipe / drag left↔right to change round (same as the tabs); keep the active
  // tab centred WITHIN its own scroll bar — never scrollIntoView (that scrolls
  // the whole page, landing the view in the middle on mount).
  const [dir, setDir] = useState(1); // slide direction for the round transition
  const tabsRef = useRef(null), stageRef = useRef(null), sx = useRef(null), drag = useRef(false);
  useEffect(() => {
    const bar = tabsRef.current; if (!bar) return;
    const el = bar.querySelector(".gko-tab.on"); if (!el) return;
    bar.scrollTo({ left: el.offsetLeft - bar.clientWidth / 2 + el.offsetWidth / 2, behavior: "smooth" });
  }, [r]);
  const toRound = (ri) => { const v = Math.max(0, Math.min(KO_SEQ.length - 1, ri)); if (v === r) return; setDir(v > r ? 1 : -1); setR(v); };
  const go = (d) => toRound(r + d);
  const dragMove = (x) => {
    if (sx.current == null || !stageRef.current) return;
    const dx = x - sx.current;
    if (!drag.current && Math.abs(dx) < 6) return; // ignore taps
    drag.current = true;
    const max = (d) => (d < 0 ? r < KO_SEQ.length - 1 : r > 0); // resist at the ends
    const damp = max(dx) ? 0.85 : 0.28;
    stageRef.current.style.transition = "none";
    stageRef.current.style.transform = `translateX(${dx * damp}px)`;
    stageRef.current.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 520));
  };
  const dragEnd = (x) => {
    const st = stageRef.current;
    if (st) { st.style.transition = ""; st.style.transform = ""; st.style.opacity = ""; }
    if (sx.current == null) { drag.current = false; return; }
    const dx = x - sx.current; sx.current = null; const moved = drag.current; drag.current = false;
    if (moved && Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
  };
  const n = KO_SEQ[r][1];
  let decided = 0; for (let i = 0; i < n; i++) if (koSlotActualWinner(code, i, data)) decided++;
  return (
    <div className={"gko" + (hi ? " tracing" : "")} onClick={() => hi && setHi(null)}>
      {/* champion headline — the story-first endpoint of the bracket */}
      <div className={"gko-champ" + (champStatus ? " " + champStatus : "")}>
        <span className="gko-champ-cap">👑 {player ? t("yourChampion") : t("champion")}</span>
        {champ
          ? <span className="gko-champ-team"><span className="gko-champ-fl">{flagOf(champ)}</span>{champ}{champStatus === "correct" ? <span className="gko-champ-mk ok">✓</span> : champStatus === "wrong" ? <span className="gko-champ-mk no">✗</span> : null}</span>
          : <span className="gko-champ-team dim">{t("koTba2")}</span>}
      </div>
      <div className="gko-tabs" ref={tabsRef}>{KO_SEQ.map(([c], ri) => <button key={c} className={"gko-tab" + (ri === r ? " on" : "")} onClick={(e) => { e.stopPropagation(); toRound(ri); }}>{t("r_" + c)}</button>)}</div>
      <p className="gko-hint"><b>{t("r_" + code)}</b> · {decided}/{n} {t("brkDecided")} <span className="gko-swipe">‹ {t("gkoSwipe")} ›</span></p>
      <div className="gko-scroll"
        onTouchStart={(e) => { sx.current = e.touches[0].clientX; drag.current = false; }} onTouchMove={(e) => dragMove(e.touches[0].clientX)} onTouchEnd={(e) => dragEnd(e.changedTouches[0].clientX)}
        onPointerDown={(e) => { if (e.pointerType === "mouse") { sx.current = e.clientX; drag.current = false; } }} onPointerMove={(e) => { if (e.pointerType === "mouse" && sx.current != null) dragMove(e.clientX); }} onPointerUp={(e) => { if (e.pointerType === "mouse") dragEnd(e.clientX); }} onPointerLeave={(e) => { if (e.pointerType === "mouse" && sx.current != null) dragEnd(e.clientX); }}>
        <div className={"gko-stage " + (dir > 0 ? "fromR" : "fromL")} key={r} ref={stageRef}>
          {!last ? (
            <div className="gko-pairs">
              {Array.from({ length: KO_SEQ[r + 1][1] }, (_, pi) => (
                <div className="gko-pair" key={pi}>
                  <div className="gko-children"><Card v={view(code, 2 * pi)} /><Card v={view(code, 2 * pi + 1)} /></div>
                  <div className="gko-conn" />
                  <div className="gko-parent"><Card v={view(KO_SEQ[r + 1][0], pi)} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="gko-finalwrap"><Card v={view("F", 0)} /></div>
          )}
        </div>
      </div>
    </div>
  );
}
function BracketView({ data, lb, t, lang, name, setName, go }) {
  const [tab, setTab] = useState("live"); // "live" = actual bracket · "player" = a player's prediction
  const [look, setLook] = useState("list"); // "list" = per-round connector tree (default) · "diagram" = two-sided map
  const LookToggle = () => (
    <div className="brk-look">
      <button className={"brk-lk" + (look === "diagram" ? " on" : "")} onClick={() => setLook("diagram")}>🗺️ {t("brkDiagram")}</button>
      <button className={"brk-lk" + (look === "list" ? " on" : "")} onClick={() => setLook("list")}>☰ {t("brkList")}</button>
    </div>
  );
  const hasReal = (data.matches || []).some((m) => m.stage === "ko");
  const projected = !hasReal && !GROUP_KEYS.every((g) => groupComplete(g, data));
  const sel = (lb && lb.find((r) => r.name === name)) || (lb && lb[0]) || null;
  const picks = (sel && data.players[sel.name] && data.players[sel.name].knockout) || {};
  const made = sel ? KO_SEQ.reduce((s, [code, n]) => { for (let i = 0; i < n; i++) if (picks[koSlotId(code, i)]) s++; return s; }, 0) : 0;
  // How many of this player's still-possible picks remain alive (not yet eliminated).
  const alive = useMemo(() => {
    if (!sel) return 0; let n = 0;
    for (const [code, cnt] of KO_SEQ) for (let i = 0; i < cnt; i++) {
      const pk = picks[koSlotId(code, i)]; if (!pk) continue;
      const actual = koSlotActualWinner(code, i, data);
      if (!actual || sameTeam(pk, actual)) n++;
    }
    return n;
  }, [sel, picks, data]);
  const koAll = (data.matches || []).filter((m) => m.stage !== "group");
  const koDone = koAll.filter((m) => m.status === "finished").length;
  const pct = koAll.length ? (koDone / koAll.length) * 100 : 0;
  return (
    <div className="view">
      {/* slim header — one line + thin progress */}
      <div className="brk-bar">
        <div className="brk-bar-row">
          <span className="brk-bar-title">🗺️ {t("nav_bracket")}</span>
          <span className="brk-bar-sub">{koAll.length > 0 ? <>{koDone}/{koAll.length} {t("knockout")}</> : projected ? t("brkProjected") : t("phase_group")}</span>
        </div>
        {koAll.length > 0 && <div className="brk-thinbar"><span style={{ width: `${pct}%` }} /></div>}
      </div>

      {/* tabs */}
      <div className="brk-tabs" role="tablist">
        <button role="tab" className={"brk-tab" + (tab === "live" ? " on" : "")} onClick={() => setTab("live")}>🗺️ {t("brkTabLive")}</button>
        <button role="tab" className={"brk-tab" + (tab === "player" ? " on" : "")} onClick={() => setTab("player")}>🎯 {t("brkTabPred")}</button>
      </div>

      {tab === "live" ? (
        <div className="card">
          <LookToggle />
          {look === "diagram" ? <BracketDiagram data={data} mode="results" t={t} /> : <KnockoutBracketG data={data} t={t} lang={lang} />}
        </div>
      ) : sel ? (
        <div className="card brk-pcard">
          {/* compact player row: avatar + selector + share + profile (icons) */}
          <div className="brk-prow">
            <Avatar name={sel.name} />
            <select className="select brk-sel" value={sel.name} onChange={(e) => setName && setName(e.target.value)} aria-label={t("selectPlayer")}>
              {lb.map((r) => <option key={r.name} value={r.name}>{r.name} · {r.total} {t("pts")}</option>)}
            </select>
            <button className="brk-icon" onClick={() => shareBracketImage(sel.name, picks, data, sel.knockout, sel.total, t)} aria-label={t("shareBracket")} title={t("shareBracket")}>📷</button>
            {go && <button className="brk-icon" onClick={() => go("profile", sel.name)} aria-label={t("nav_profile")} title={t("nav_profile")}>👤</button>}
          </div>
          {/* one row: compact stats line + view toggle */}
          <div className="brk-statbar">
            <span className="brk-statline"><b className="ko">{sel.knockout}</b> {t("knockout")} · <b>{made}/31</b> · <b className="alv">{alive}</b> {t("brkAlive")}</span>
            <LookToggle />
          </div>
          {look === "diagram" ? <BracketDiagram data={data} picks={picks} mode="player" t={t} /> : <KnockoutBracketG data={data} picks={picks} mode="player" t={t} lang={lang} />}
        </div>
      ) : null}
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
function Help({ t, data }) {
  const koPts = koPointsFor(data || {});
  const rules = [
    { e: "🎯", k: "rule_exact", p: "+1" }, { e: "🗺️", k: "rule_ko", p: "+" + (koPts.R32 || 0) }, { e: "🏆", k: "rule_champ", p: "+" + champPointsFor(data || {}) },
  ];
  return (
    <div className="view">
      <div className="card"><h3 className="cardh">📖 {t("howScoring")}</h3>
        {rules.map((r) => <div className="rule" key={r.k}><span className="rulee">{r.e}</span><span className="rulet">{t(r.k)}</span><b className="rulep">{r.p}</b></div>)}
      </div>
      <div className="card"><h3 className="cardh">{t("knockout")}</h3>
        <div className="korules">
          {KO_SEQ.map(([k]) => <div className="korule" key={k}><span>{t("r_" + k)}</span><b className="num">+{koPts[k] || 0}</b></div>)}
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
// All fixtures (group + knockout) a team is involved in, chronologically.
const teamMatches = (data, team) => (data.matches || [])
  .filter((m) => (m.home && sameTeam(m.home, team)) || (m.away && sameTeam(m.away, team)))
  .sort((a, b) => (a.ko || 0) - (b.ko || 0));
// Team browser: pick a team, see its fixtures, tap one for the full detail.
function TeamFixtures({ data, lang, onOpen, t }) {
  const teamsByGroup = useMemo(() => GROUP_KEYS.map((g) => ({ g, teams: [...GROUPS[g]].sort((a, b) => canonTeam(a).localeCompare(canonTeam(b))) })), []);
  const [team, setTeam] = useState(() => GROUPS[GROUP_KEYS[0]][0]);
  const matches = useMemo(() => teamMatches(data, team), [data, team]);
  const g = groupOf(team);
  const standing = useMemo(() => {
    if (!g) return null;
    const tbl = computeGroupTable(g, data);
    const idx = tbl.findIndex((r) => sameTeam(r.team, team));
    return idx >= 0 ? { pos: idx + 1, pts: tbl[idx].Pts } : null;
  }, [data, g, team]);
  return (
    <div className="view">
      <div className="card slim">
        <h3 className="cardh"><Ico name="users" size={18} /> {t("teamFixtures")}</h3>
        <select className="select teamsel" value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t("pickTeam")}>
          {teamsByGroup.map(({ g, teams }) => (
            <optgroup key={g} label={`${t("group")} ${g}`}>
              {teams.map((tm) => <option key={tm} value={tm}>{canonTeam(tm)}</option>)}
            </optgroup>
          ))}
        </select>
        <div className="teammeta">
          <span className="fl">{flagOf(team)}</span> <b>{canonTeam(team)}</b>
          {g && <span className="hint"> · {t("group")} {g}{standing ? ` · #${standing.pos} · ${standing.pts} ${t("Pts")}` : ""}</span>}
        </div>
      </div>
      <div className="card">
        {matches.length === 0 ? <div className="empty">{t("noMatches")}</div>
          : matches.map((m) => <MatchRow key={m.id} m={m} data={data} lang={lang} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
// A single group's six matches, opened from the Groups page.
function GroupGames({ g, data, lang, onOpen, t, onBack }) {
  const matches = useMemo(() => (data.matches || []).filter((m) => m.stage === "group" && m.group === g).sort((a, b) => (a.ko || 0) - (b.ko || 0)), [data, g]);
  return (
    <div className="view">
      <button className="backbtn" onClick={onBack}>‹ {t("nav_groups")}</button>
      <div className="card">
        <h3 className="cardh"><span className="gbadge">{t("group")} {g}</span> · {t("matchesLabel")}</h3>
        {matches.map((m) => <MatchRow key={m.id} m={m} data={data} lang={lang} onOpen={onOpen} />)}
      </div>
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
  // Knockout head-to-head: for each concrete tie (R32 fixed; later rounds once
  // the real matchup is known), how the league split its winner pick.
  const koTies = useMemo(() => {
    const res = {};
    for (const [code, n] of KO_SEQ) for (let i = 0; i < n; i++) { const w = koSlotActualWinner(code, i, data); if (w) res[koSlotId(code, i)] = w; }
    const out = [];
    for (const [code, n] of KO_SEQ) for (let i = 0; i < n; i++) {
      let a, b;
      if (code === "R32") { [a, b] = R32_TIES[i]; } else { const c = koSlotContenders(res, code, i); a = c[0]; b = c[1]; }
      if (!a || !b) continue;
      a = canonTeam(a); b = canonTeam(b);
      const slot = koSlotId(code, i); let ca = 0, cb = 0;
      order.forEach((name) => { const pk = (data.players[name].knockout || {})[slot]; if (!pk) return; if (sameTeam(pk, a)) ca++; else if (sameTeam(pk, b)) cb++; });
      out.push({ code, a, b, ca, cb });
    }
    return out;
  }, [data, order]);
  // actual deep-round winners, for colouring the comparison table green
  const koAct = useMemo(() => ({
    F: koSlotActualWinner("F", 0, data),
    SF: [0, 1].map((i) => koSlotActualWinner("SF", i, data)),
    QF: [0, 1, 2, 3].map((i) => koSlotActualWinner("QF", i, data)),
  }), [data]);
  const koCell = (pick, actual, key) => <td key={key} className={pick && actual && sameTeam(pick, actual) ? "hit" : ""} title={canonTeam(pick)}>{flagOf(pick)}</td>;
  const H2H = ({ x }) => {
    const tot = Math.max(1, x.ca + x.cb);
    return (
      <div className="h2h">
        <span className="h2h-side"><span className="fl">{flagOf(x.a)}</span><span className="h2h-tn">{x.a}</span><b className="num">{x.ca}</b></span>
        <span className="mpbar"><span className="mpfill h" style={{ width: `${(x.ca / tot) * 100}%` }} /><span className="mpfill a" style={{ width: `${(x.cb / tot) * 100}%` }} /></span>
        <span className="h2h-side end"><b className="num">{x.cb}</b><span className="h2h-tn">{x.b}</span><span className="fl">{flagOf(x.b)}</span></span>
      </div>
    );
  };
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

      {/* knockout head-to-head — who the league backs in each tie */}
      <div className="card">
        <h3 className="cardh">🗺️ {t("predKoTitle")}</h3>
        <p className="hint block">{t("predKoHint")}</p>
        {koTies.length === 0 ? <div className="empty sm">{t("predKoEmpty")}</div> : KO_SEQ.map(([code]) => {
          const r = koTies.filter((x) => x.code === code);
          if (!r.length) return null;
          return (
            <div className="h2h-round" key={code}>
              <div className="h2h-rlabel">{t("r_" + code)}</div>
              {r.map((x, k) => <H2H x={x} key={k} />)}
            </div>
          );
        })}
      </div>

      {/* knockout player comparison — each player's deep-round picks side by side */}
      <div className="card slim"><h3 className="cardh">⚔️ {t("predKoCompare")}</h3>
        <p className="hint block">{t("predKoCompareHint")}</p>
      </div>
      <div className="card nopad">
        <div className="pgrid-scroll">
          <table className="pgrid">
            <thead>
              <tr><th className="sticky">{t("player")}</th><th>🏆</th><th>🎖️</th><th>🎖️</th><th>🛡️</th><th>🛡️</th><th>🛡️</th><th>🛡️</th></tr>
            </thead>
            <tbody>
              {order.map((name) => {
                const kp = data.players[name].knockout || {};
                const champ = kp[koSlotId("F", 0)], fin = [kp[koSlotId("SF", 0)], kp[koSlotId("SF", 1)]], sf = [0, 1, 2, 3].map((i) => kp[koSlotId("QF", i)]);
                return (
                  <tr key={name} onClick={() => go("profile", name)}>
                    <td className="sticky pgname"><Avatar name={name} /><span>{name}</span></td>
                    {koCell(champ, koAct.F, "c")}
                    {fin.map((f, i) => koCell(f, koAct.SF[i], "f" + i))}
                    {sf.map((s, i) => koCell(s, koAct.QF[i], "s" + i))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pglegend"><span className="pgdot hit" /> {t("predHitKo")} · 🏆 {t("champion")} · 🎖️ {t("koFinalists")} · 🛡️ {t("koSemis")}</div>
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
  const nP = Object.keys(data.players || {}).length || 1;
  const tip = { fontSize: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)" };
  // position race: each player's rank per stage (1 = top)
  const ranks = useMemo(() => timeline.map((row) => {
    const sorted = Object.keys(row).filter((k) => k !== "stage").sort((a, b) => row[b] - row[a]);
    const out = { stage: row.stage }; sorted.forEach((n, i) => (out[n] = i + 1)); return out;
  }), [timeline]);
  // points composition (group / knockout / champion) per player
  const comp = useMemo(() => lb.slice(0, 8).map((r) => ({ name: r.name, group: (r.groupMatch || 0) + (r.groupRank || 0), knockout: r.knockout || 0, champion: r.champ || 0 })), [lb]);
  // bracket survival: correct knockout picks per round
  const KOR = [["R32", 16], ["R16", 8], ["QF", 4], ["SF", 2], ["F", 1]];
  const koAny = useMemo(() => KOR.some(([c, n]) => { for (let i = 0; i < n; i++) if (koSlotActualWinner(c, i, data)) return true; return false; }), [data]);
  const survival = useMemo(() => KOR.map(([code, n]) => {
    const row = { round: code };
    top.forEach((name) => { const kp = data.players[name].knockout || {}; let cnt = 0; for (let i = 0; i < n; i++) { const a = koSlotActualWinner(code, i, data), pk = kp[koSlotId(code, i)]; if (a && pk && sameTeam(pk, a)) cnt++; } row[name] = cnt; });
    return row;
  }), [data, top]);
  return (
    <div className="view">
      <div className="card">
        <h3 className="cardh">📈 {t("trPoints")} <span className="hint">{t("trendsHint")}</span></h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={timeline} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "var(--muted)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} width={30} />
            <Tooltip contentStyle={tip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {top.map((name, i) => <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} dot={{ r: 2 }} animationDuration={1000} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 className="cardh">🔀 {t("trRace")} <span className="hint">{t("trRaceHint")}</span></h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={ranks} margin={{ top: 8, right: 10, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "var(--muted)" }} />
            <YAxis reversed allowDecimals={false} domain={[1, nP]} tick={{ fontSize: 10, fill: "var(--muted)" }} width={26} />
            <Tooltip contentStyle={tip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {top.map((name, i) => <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} dot={{ r: 3 }} animationDuration={1000} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 className="cardh">🧱 {t("trComp")} <span className="hint">{t("trCompHint")}</span></h3>
        <ResponsiveContainer width="100%" height={Math.max(220, comp.length * 36)}>
          <BarChart layout="vertical" data={comp} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <YAxis type="category" dataKey="name" width={74} tick={{ fontSize: 11, fill: "var(--ink)" }} />
            <Tooltip contentStyle={tip} cursor={{ fill: "rgba(25,195,125,.06)" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="group" stackId="a" fill="var(--grass-d)" name={t("groupRank")} radius={[4, 0, 0, 4]} />
            <Bar dataKey="knockout" stackId="a" fill="var(--gold)" name={t("knockout")} />
            <Bar dataKey="champion" stackId="a" fill="var(--gold-d)" name={t("champion")} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {koAny && (
        <div className="card">
          <h3 className="cardh">🛡️ {t("trSurv")} <span className="hint">{t("trSurvHint")}</span></h3>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={survival} margin={{ top: 8, right: 10, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="round" tick={{ fontSize: 11, fill: "var(--muted)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted)" }} width={26} />
              <Tooltip contentStyle={tip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {top.map((name, i) => <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} dot={{ r: 2 }} animationDuration={1000} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
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
  const sub = rank.reduce((s, r) => s + r.got, 0);
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
        </div>
      )}
    </div>
  );
}
// Side-by-side: a player's predicted group order vs the actual standings, with
// the points earned per position (and the match-winner points for the group).
function GroupCompare({ g, p, data, t, name }) {
  const [open, setOpen] = useState(true);
  const table = useMemo(() => computeGroupTable(g, data), [g, data]);
  const pred = playerGroupPred(p, g);
  const complete = groupComplete(g, data);
  const actualTop2 = new Set([table[0], table[1]].filter(Boolean).map((x) => teamKey(x.team)));
  const rankRows = [0, 1, 2, 3].map((pos) => {
    const pick = pred[pos] || null, actual = table[pos] ? table[pos].team : null;
    // Flat: +1 for each team in its exact final position. Recomputed each render;
    // locks once the group is done.
    const exact = !!(pick && actual && sameTeam(pick, actual));
    let got = 0, kind = "miss";
    if (exact) { got = SCORING.groupPos[pos]; kind = "exact"; }
    else if (pick && pos < 2 && actualTop2.has(teamKey(pick))) { got = SCORING.qualifierWrongSlot; kind = "qualifier"; }
    return { pos: pos + 1, pick, actual, got, kind };
  });
  const total = rankRows.reduce((s, r) => s + r.got, 0);
  return (
    <div className="card gc-card">
      <button className="gc-head" onClick={() => setOpen((o) => !o)}>
        <span className="gbadge">{t("group")} {g}</span>
        {!complete && <span className="hint">{t("inProgress")}</span>}
        <span className="grow" />
        <span className="gc-total num">+{total}</span>
        <span className="ag-chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          <div className="gc-colh"><span className="gc-colh-name">{name || t("predicted")}</span><span className="gc-colh-mid">{t("points")}</span><span>{t("actual")}</span></div>
          {!complete && <div className="gc-projhint hint">{t("gcProj")}</div>}
          {rankRows.map((r) => (
            <div className={"gc-row " + r.kind} key={r.pos}>
              <span className="gc-side pick"><span className="gc-pos num">{r.pos}</span><Team t={r.pick} dim={!r.pick} /></span>
              <span className={"gc-pt " + (r.got > 0 ? "exact" : "miss")}>{r.got > 0 ? "+" + r.got : "·"}</span>
              <span className="gc-side act"><Team t={r.actual} dim={!r.actual} /><span className="gc-pos num">{r.pos}</span></span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
// Collapsible per-player knockout-bracket prediction: champion + every round's
// winner picks vs the real result, with points. Mirrors GroupCompare's layout so
// it slots into the Table view next to the group breakdown.
function KnockoutCompare({ p, data, t, name }) {
  const [open, setOpen] = useState(false);
  const kp = (p && p.knockout) || {};
  const koPts = koPointsFor(data);
  const rounds = KO_SEQ.map(([code, n]) => {
    const rows = [];
    for (let i = 0; i < n; i++) {
      const pick = kp[koSlotId(code, i)] || null;
      const actual = koSlotActualWinner(code, i, data);
      if (!pick && !actual) continue; // nothing predicted or decided for this slot
      const hit = !!(pick && actual && sameTeam(pick, actual));
      const got = hit ? (koPts[code] || 0) : 0;
      rows.push({ i, pick, actual, got, kind: actual ? (hit ? "exact" : "miss") : "pend" });
    }
    return { code, rows };
  }).filter((r) => r.rows.length);
  const champPick = p && p.champion, champActual = data.champion;
  const champHit = !!(champPick && champActual && sameTeam(champPick, champActual));
  const total = (champHit ? champPointsFor(data) : 0) + rounds.reduce((s, r) => s + r.rows.reduce((a, x) => a + x.got, 0), 0);
  return (
    <div className="card gc-card">
      <button className="gc-head" onClick={() => setOpen((o) => !o)}>
        <span className="gbadge">🗺️ {t("knockout")}</span>
        <span className="grow" />
        <span className="gc-total num">+{total}</span>
        <span className="ag-chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          <div className="gc-colh"><span className="gc-colh-name">{name || t("predicted")}</span><span className="gc-colh-mid">{t("points")}</span><span>{t("actual")}</span></div>
          <div className={"gc-row " + (champActual ? (champHit ? "exact" : "miss") : "pend")}>
            <span className="gc-side pick"><span className="gc-pos">👑</span><Team t={champPick} dim={!champPick} /></span>
            <span className={"gc-pt " + (champHit ? "exact" : "miss")}>{champHit ? "+" + champPointsFor(data) : "·"}</span>
            <span className="gc-side act"><Team t={champActual} dim={!champActual} /></span>
          </div>
          {rounds.map((r) => (
            <React.Fragment key={r.code}>
              <div className="hint" style={{ margin: "8px 2px 2px", fontWeight: 600 }}>{t("r_" + r.code)}</div>
              {r.rows.map((x) => (
                <div className={"gc-row " + x.kind} key={x.i}>
                  <span className="gc-side pick"><Team t={x.pick} dim={!x.pick} /></span>
                  <span className={"gc-pt " + (x.got > 0 ? "exact" : "miss")}>{x.got > 0 ? "+" + x.got : "·"}</span>
                  <span className="gc-side act"><Team t={x.actual} dim={!x.actual} /></span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </>
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
    { e: "🎯", title: t("p_pos_t"), desc: t("p_pos_d"), note: `${c.exact} ${t("p_exact")}`, pts: row.groupRank },
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
  const [grpOpen, setGrpOpen] = useState(false);
  const pending = useMemo(() => livePendingPoints(data, data.players[row.name]), [data, row.name]);
  const cats = [
    { k: "groupRank", c: "var(--grass-d)" },
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
            const segs = [r.groupRank, r.knockout, r.champ];
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

      {/* champion + knockout first (the headline picks), then the groups */}
      <div className="card">
        <h3 className="cardh">🏆 {t("champion")} · +{row.champ}</h3>
        {row.detail.champion ? (
          <div className="koaudit"><span className="kopick"><Team t={row.detail.champion.pick} /></span><span className="agarrow">vs</span><span className="koact">{t("actual")}: <Team t={row.detail.champion.actual} /></span><span className={"agpt " + ptClass(row.detail.champion.got)}>{row.detail.champion.got > 0 ? "+" + row.detail.champion.got : "0"}</span></div>
        ) : <div className="empty sm">{t("champPending")} (+{champPointsFor(data)} {t("ifCorrect")})</div>}
      </div>
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

      {/* prediction vs actual, side by side, per group (collapsed by default) */}
      <div className="card slim">
        <button className="mypick-lbl collapse" onClick={() => setGrpOpen((v) => !v)} aria-expanded={grpOpen}>
          <span>📂 {t("groupBreakdown")}{!grpOpen && <span className="coll-lock"> · {t("tapExpand")}</span>}</span>
          <span className="coll-chev">{grpOpen ? "▾" : "▸"}</span>
        </button>
        {grpOpen && <p className="hint block">{t("gcHint")}</p>}
      </div>
      {grpOpen && GROUP_KEYS.map((g) => <GroupCompare key={g} g={g} p={data.players[row.name]} data={data} t={t} name={row.name} />)}
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
function MatchEditRow({ m, onSet, onClear, penLabel }) {
  const [h, setH] = useState(m.hs ?? ""); const [a, setA] = useState(m.as ?? "");
  useEffect(() => { setH(m.hs ?? ""); setA(m.as ?? ""); }, [m.hs, m.as]);
  const drawnKo = m.stage === "ko" && h !== "" && a !== "" && Number(h) === Number(a);
  const change = (hh, aa) => {
    setH(hh); setA(aa);
    if (hh !== "" && aa !== "") {
      const drawn = m.stage === "ko" && Number(hh) === Number(aa);
      if (!drawn) onSet(m.id, parseInt(hh, 10) || 0, parseInt(aa, 10) || 0); // drawn KO waits for a penalty winner
    }
  };
  const pickPen = (team) => onSet(m.id, parseInt(h, 10) || 0, parseInt(a, 10) || 0, team);
  return (
    <div className={"erow" + (drawnKo && !m.penWinner ? " invalid" : "")}>
      <span className="eteam"><span className="fl">{flagOf(m.home)}</span><span className="etn">{canonTeam(m.home)}</span></span>
      <input className="scoreinp" inputMode="numeric" value={h} onChange={(e) => change(e.target.value.replace(/\D/g, "").slice(0, 2), a)} />
      <span className="edash">–</span>
      <input className="scoreinp" inputMode="numeric" value={a} onChange={(e) => change(h, e.target.value.replace(/\D/g, "").slice(0, 2))} />
      <span className="eteam end"><span className="etn">{canonTeam(m.away)}</span><span className="fl">{flagOf(m.away)}</span></span>
      <button className="eclear" onClick={() => onClear(m.id)} title="clear">✕</button>
      {drawnKo && (
        <span className="ko-pens">
          <span className="ko-pens-lbl">{penLabel}</span>
          {[m.home, m.away].map((tm) => (
            <button key={tm} className={"ko-penbtn" + (m.penWinner && sameTeam(m.penWinner, tm) ? " on" : "")} onClick={() => pickPen(tm)}>{canonTeam(tm)}</button>
          ))}
        </span>
      )}
    </div>
  );
}
function Results({ data, setData, t, lang }) {
  const [bucket, setBucket] = useState("A");
  const setScore = (id, hs, as, winner) => setData((d) => {
    const target = d.matches.find((x) => x.id === id);
    if (!target) return d;
    if (target.stage === "ko" && hs === as && !winner) return d; // drawn KO needs a penalty winner
    const matches = d.matches.map((x) => x.id === id ? applyAdminScore(x, hs, as, winner) : x);
    const pens = target.stage === "ko" && hs === as && winner ? ` (${t("koPenWonBy")} ${canonTeam(winner)})` : "";
    const log = { ts: Date.now(), msg: `${canonTeam(target.home)} ${hs}–${as} ${canonTeam(target.away)}${pens}` };
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
          {list.map((m) => <MatchEditRow key={m.id} m={m} onSet={setScore} onClear={clearScore} penLabel={t("koPenWonBy")} />)}
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
  const koPts = koPointsFor(data), champPts = champPointsFor(data);
  const num = (e) => Math.max(0, parseInt(String(e.target.value).replace(/\D/g, "")) || 0);
  const setKo = (round, v) => setData((d) => { const cur = (d.settings && d.settings.koPoints) || SCORING.knockout; const nd = { ...d, settings: { ...d.settings, koPoints: { ...SCORING.knockout, ...cur, [round]: v } } }; persistLive(nd); return nd; });
  const resetScoring = () => setData((d) => { const ns = { ...d.settings }; delete ns.koPoints; delete ns.champPoints; const nd = { ...d, settings: ns }; persistLive(nd); return nd; });
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
      <div className="card">
        <div className="brk-head"><h3 className="cardh">🎯 {t("scoringTitle")}</h3><button className="seeall" onClick={resetScoring}>{t("scoringReset")}</button></div>
        <p className="hint block">{t("scoringHint")}</p>
        {KO_SEQ.map(([code]) => (
          <label className="frow" key={code}><span>{t("r_" + code)}</span><input className="select sm" inputMode="numeric" value={koPts[code] ?? 0} onChange={(e) => setKo(code, num(e))} /></label>
        ))}
        <label className="frow"><span>🏆 {t("champion")}</span><input className="select sm" inputMode="numeric" value={champPts} onChange={(e) => set("champPoints", num(e))} /></label>
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
// --- file-download helpers (browser) ---
function downloadText(name, text, mime) {
  const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"); // BOM for Excel
// Admin: focused exports — players' predictions and group results, as CSV or JSON.
// --- PDF export via the browser's print-to-PDF (no dependency) ------------
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function openPrintDoc(title, inner) {
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to export the PDF"); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
    *{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111;margin:22px}
    h1{font-size:19px;margin:0 0 2px}.sub{color:#666;font-size:11px;margin:0 0 14px}
    h2{font-size:13px;margin:16px 0 5px;color:#13854f;border-bottom:2px solid #13854f;padding-bottom:2px}
    table{border-collapse:collapse;width:100%;margin:4px 0 14px;font-size:11.5px}
    th,td{border:1px solid #d0d0d0;padding:4px 7px;text-align:left}th{background:#f4f4f4;font-weight:700}
    td.n,th.n{text-align:center;font-variant-numeric:tabular-nums}.ok{color:#13854f;font-weight:800}.tot{font-weight:800}
    @media print{body{margin:10px}}
  </style></head><body>${inner}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch (e) {} }, 350);
}
// Projected league rows: +1 per team in its exact CURRENT position (banked once
// a group completes), + knockout/champion from the engine. Ranked by projected.
function projectedRows(data) {
  const rows = Object.keys(data.players).map((name) => {
    const p = data.players[name], cp = calcPlayerPoints(p, data), per = {};
    GROUP_KEYS.forEach((g) => { per[g] = cp.detail.ranking.filter((r) => r.g === g).reduce((s, r) => s + r.got, 0); });
    return { name, total: cp.total, per, champion: canonTeam(p.champion) || "" };
  });
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
function leaguePdfHtml(data, t) {
  const rows = projectedRows(data), date = new Date().toLocaleDateString();
  let h = `<h1>${esc(t("brand"))} — ${esc(t("standings"))}</h1>`;
  h += `<p class="sub">${esc(date)} · ${rows.length} ${esc(t("expPlayersN"))} · ${esc(t("pdfLegend"))}</p>`;
  h += `<table><thead><tr><th class="n">#</th><th>${esc(t("player"))}</th><th class="n">${esc(t("points"))}</th>${GROUP_KEYS.map((g) => `<th class="n">${g}</th>`).join("")}</tr></thead><tbody>`;
  rows.forEach((r) => { h += `<tr><td class="n">${r.rank}</td><td>${esc(r.name)}</td><td class="n tot">${r.total}</td>${GROUP_KEYS.map((g) => `<td class="n">${r.per[g] || 0}</td>`).join("")}</tr>`; });
  h += `</tbody></table><p class="sub">${esc(t("pdfNote"))}</p>`;
  return h;
}
function playerPdfHtml(name, data, t) {
  const p = data.players[name], date = new Date().toLocaleDateString();
  const rows = projectedRows(data), me = rows.find((r) => r.name === name) || { rank: "-", total: 0, champion: "" };
  let h = `<h1>${esc(name)}</h1>`;
  h += `<p class="sub">${esc(date)} · ${esc(t("rank"))} ${me.rank}/${rows.length} · ${esc(t("points"))} ${me.total}${me.champion ? ` · ${esc(t("champPick"))}: ${esc(me.champion)}` : ""}</p>`;
  GROUP_KEYS.forEach((g) => {
    const table = computeGroupTable(g, data), pred = playerGroupPred(p, g), done = groupComplete(g, data);
    h += `<h2>${esc(t("group"))} ${g}${done ? "" : " · " + esc(t("inProgress"))}</h2>`;
    h += `<table><thead><tr><th class="n">#</th><th>${esc(t("predicted"))}</th><th>${esc(t("actual"))}</th><th class="n">+1</th></tr></thead><tbody>`;
    for (let pos = 0; pos < 4; pos++) {
      const pick = pred[pos] || "—", actual = table[pos] ? table[pos].team : "—";
      const exact = pred[pos] && table[pos] && sameTeam(pred[pos], table[pos].team);
      h += `<tr><td class="n">${pos + 1}</td><td>${esc(canonTeam(pick))}</td><td>${esc(actual)}</td><td class="n ${exact ? "ok" : ""}">${exact ? "+1" : ""}</td></tr>`;
    }
    h += `</tbody></table>`;
  });
  return h;
}
function Exports({ data, t }) {
  const players = Object.keys(data.players);
  const [pdfPlayer, setPdfPlayer] = useState(players[0] || "");
  const groupMatches = (data.matches || []).filter((m) => m.stage === "group");
  const finishedN = groupMatches.filter((m) => m.finalH != null && m.finalA != null).length;

  const predData = useMemo(() => {
    const rows = [["Player", "Champion", "Group", "1st", "2nd", "3rd", "4th"]];
    players.forEach((name) => {
      const p = data.players[name];
      GROUP_KEYS.forEach((g) => {
        const pr = playerGroupPred(p, g);
        rows.push([name, canonTeam(p.champion) || "", g, pr[0] || "", pr[1] || "", pr[2] || "", pr[3] || ""]);
      });
    });
    const json = players.map((name) => {
      const p = data.players[name];
      return { player: name, champion: p.champion || null, knockout: p.knockout || {},
        groupPreds: Object.fromEntries(GROUP_KEYS.map((g) => [g, playerGroupPred(p, g)])) };
    });
    return { csv: toCsv(rows), json: JSON.stringify(json, null, 2) };
  }, [data, players]);

  const resData = useMemo(() => {
    const rows = [["Group", "MatchKey", "Matchday", "Home", "Away", "HomeScore", "AwayScore", "Status"]];
    const MD = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 };
    groupMatches.forEach((m) => {
      const done = m.finalH != null && m.finalA != null;
      rows.push([m.group, m.id, MD[m.idx], canonTeam(m.home), canonTeam(m.away), done ? m.finalH : "", done ? m.finalA : "", done ? "final" : "scheduled"]);
    });
    const json = groupMatches.map((m) => ({ group: m.group, matchKey: m.id, home: canonTeam(m.home), away: canonTeam(m.away),
      homeScore: m.finalH != null ? m.finalH : null, awayScore: m.finalA != null ? m.finalA : null, status: m.finalH != null && m.finalA != null ? "final" : "scheduled" }));
    return { csv: toCsv(rows), json: JSON.stringify(json, null, 2) };
  }, [groupMatches]);

  // Knockout results, keyed by canonical bracket slot (R32#0–15 … F#0) so the
  // file lines up 1:1 with the predictions export's knockout slots. The actual
  // contenders/winner come from whichever played KO match falls inside each
  // slot's subtree (same membership match the scoring engine uses), plus the
  // decided champion — the data needed to reproduce every knockout point.
  const koData = useMemo(() => {
    const koMatches = (data.matches || []).filter((m) => m.stage === "ko");
    const rows = [["Round", "Slot", "Home", "Away", "HomeScore", "AwayScore", "Winner", "Status"]];
    const json = [];
    for (const [code, n] of KO_SEQ) {
      for (let i = 0; i < n; i++) {
        const set = new Set(koSlotLeaves(code, i).map(teamKey));
        const m = koMatches.find((x) => x.round === code && x.home && x.away && set.has(teamKey(x.home)) && set.has(teamKey(x.away)));
        const slot = koSlotId(code, i);
        const home = m && m.home ? canonTeam(m.home) : null;
        const away = m && m.away ? canonTeam(m.away) : null;
        const done = !!m && m.finalH != null && m.finalA != null;
        const winner = m ? ((data.knockoutResults || {})[m.mid] || null) : null;
        const status = done ? "final" : (m ? "scheduled" : "tbd");
        rows.push([code, slot, home || "", away || "", done ? m.finalH : "", done ? m.finalA : "", winner || "", status]);
        json.push({ round: code, slot, home, away, homeScore: done ? m.finalH : null, awayScore: done ? m.finalA : null, winner, status });
      }
    }
    const champion = data.champion ? canonTeam(data.champion) : null;
    const decided = json.filter((r) => r.winner).length;
    return { csv: toCsv(rows), json: JSON.stringify({ champion, knockout: json }, null, 2), decided, total: json.length, champion };
  }, [data]);

  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="view">
      <div className="card slim"><p className="hint block">{t("expHint")}</p>
        <p className="hint block" style={{ marginTop: 6, opacity: .85 }}>⚠️ {t("expCheck")}</p>
      </div>
      <div className="card">
        <h3 className="cardh"><Ico name="bracket" size={18} /> {t("expPreds")} <span className="hint">· {players.length} {t("expPlayersN")}</span></h3>
        <div className="hrow"><span className="hlabel">{players.slice(0, 8).join(", ")}{players.length > 8 ? "…" : ""}</span></div>
        <div className="exp-btns">
          <button className="btn" onClick={() => downloadText(`predictions-${stamp}.csv`, predData.csv, "text/csv")}>{t("dlCsv")}</button>
          <button className="btn ghost" onClick={() => downloadText(`predictions-${stamp}.json`, predData.json, "application/json")}>{t("dlJson")}</button>
        </div>
      </div>
      <div className="card">
        <h3 className="cardh"><Ico name="edit" size={18} /> {t("expResults")} <span className="hint">· {finishedN} {t("expFinishedN")} · {groupMatches.length - finishedN} {t("expScheduledN")}</span></h3>
        <div className="exp-btns">
          <button className="btn" onClick={() => downloadText(`group-results-${stamp}.csv`, resData.csv, "text/csv")}>{t("dlCsv")}</button>
          <button className="btn ghost" onClick={() => downloadText(`group-results-${stamp}.json`, resData.json, "application/json")}>{t("dlJson")}</button>
        </div>
      </div>
      <div className="card">
        <h3 className="cardh"><Ico name="trophy" size={18} /> {t("expKnockout")} <span className="hint">· {koData.decided}/{koData.total} {t("expFinishedN")} · {koData.champion ? t("expChampDecided") : t("expChampPending")}</span></h3>
        <div className="exp-btns">
          <button className="btn" onClick={() => downloadText(`knockout-results-${stamp}.csv`, koData.csv, "text/csv")}>{t("dlCsv")}</button>
          <button className="btn ghost" onClick={() => downloadText(`knockout-results-${stamp}.json`, koData.json, "application/json")}>{t("dlJson")}</button>
        </div>
      </div>
      <div className="card">
        <h3 className="cardh"><Ico name="chart" size={18} /> {t("pdfTitle")}</h3>
        <p className="hint block">{t("pdfHint")}</p>
        <select className="select" value={pdfPlayer} onChange={(e) => setPdfPlayer(e.target.value)}>
          {players.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="exp-btns">
          <button className="btn" disabled={!pdfPlayer} onClick={() => openPrintDoc(pdfPlayer, playerPdfHtml(pdfPlayer, data, t))}>{t("pdfPlayer")}</button>
          <button className="btn ghost" onClick={() => openPrintDoc(t("standings"), leaguePdfHtml(data, t))}>{t("pdfFull")}</button>
        </div>
      </div>
    </div>
  );
}
// Admin: set each player's champion pick (+10 when the real champion is decided).
function AdminChampions({ data, setData, t }) {
  const players = Object.keys(data.players);
  const allTeams = useMemo(() => GROUP_KEYS.flatMap((g) => GROUPS[g]).slice().sort((a, b) => a.localeCompare(b)), []);
  const setChamp = (name, team) => setData((d) => {
    const nd = {
      ...d,
      players: { ...d.players, [name]: { ...(d.players[name] || {}), champion: team || null } },
      auditLog: [{ ts: Date.now(), msg: `${t("champPick")}: ${name} → ${team || "—"}` }, ...(d.auditLog || [])].slice(0, 80),
    };
    persistLive(nd);
    return nd;
  });
  const setN = players.filter((n) => data.players[n].champion).length;
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh"><Ico name="trophy" size={18} /> {t("nav_champions")}</h3>
        <p className="hint block">{t("champEntryHint")}</p>
        <div className="hrow"><span className="hlabel">{t("champSetCount")}</span><span className="hval num">{setN}/{players.length}</span></div>
      </div>
      <div className="card">
        {players.map((name) => (
          <div className="champrow" key={name}>
            <Avatar name={name} />
            <span className="champname">{name}</span>
            <select className="select champsel" value={canonTeam(data.players[name].champion) || ""} onChange={(e) => setChamp(name, e.target.value)}>
              <option value="">— {t("champPick")} —</option>
              {allTeams.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
// Lock helpers: the champion pick auto-locks 4h before the first knockout match
// (falling back to a manually-set time if the KO schedule isn't loaded yet); each
// knockout pick locks 4h before its own kickoff.
const KO_LOCK_MS = 4 * 3600 * 1000;
function firstKoKickoff(data) {
  const kos = (data.matches || []).filter((m) => m.stage === "ko" && m.ko).map((m) => m.ko);
  return kos.length ? Math.min(...kos) : null;
}
// Returns {at:ms|null, auto:bool}. A manual lock (admin) takes precedence so it
// can override/correct the auto time; otherwise auto = 4h before the first KO.
function champLock(data) {
  const manual = data.settings && data.settings.champLockUtc;
  if (manual) return { at: Date.parse(manual), auto: false };
  const fk = firstKoKickoff(data);
  return { at: fk ? fk - KO_LOCK_MS : null, auto: true };
}
// Group-order predictions close when the group stage begins (first group kickoff),
// matching "predictions lock when play starts"; manual fallback until the schedule loads.
function firstGroupKickoff(data) {
  const ks = (data.matches || []).filter((m) => m.stage === "group" && m.ko).map((m) => m.ko);
  return ks.length ? Math.min(...ks) : null;
}
function groupPredLock(data) {
  // Open by default — group predictions stay editable until the admin sets a
  // lock time (suggested: the first group kickoff, shown as a hint in admin).
  const manual = data.settings && data.settings.groupLockUtc;
  return { at: manual ? Date.parse(manual) : null, auto: false };
}
// Real knockout fixtures (admin-entered), grouped by round in encounter order.
// Picks/locks/scoring all key off the SAME real mid (m.mid), so they actually align.
function realKoRounds(data) {
  const ms = (data.matches || []).filter((m) => m.stage === "ko").sort((a, b) => (a.ko || 0) - (b.ko || 0));
  const out = [];
  ms.forEach((m) => { const r = m.round || "KO"; let g = out.find((x) => x.round === r); if (!g) { g = { round: r, ties: [] }; out.push(g); } g.ties.push(m); });
  return out;
}
// One group's 1–4 order editor: four position selects, each excluding teams
// already chosen in the group's other positions so a team can't be duplicated.
function GroupPredEditor({ g, pred, locked, onSet, t, allowSwap }) {
  const teams = GROUPS[g];
  const cur = [0, 1, 2, 3].map((i) => canonTeam(pred[i]) || "");
  if (locked) {
    return (
      <div className="gpred">
        <div className="gpred-h">{t("group")} {g} · {t("locked")}</div>
        {[0, 1, 2, 3].map((i) => <div className="gpline" key={i}><span className="ppos num">{i + 1}</span><Team t={cur[i]} dim={!cur[i]} /></div>)}
      </div>
    );
  }
  const setPos = (i, team) => {
    const next = cur.slice();
    // if the team is used elsewhere, swap it out of that slot
    const at = next.findIndex((x) => x && sameTeam(x, team));
    if (at >= 0 && at !== i) next[at] = next[i] || "";
    next[i] = team || "";
    onSet(next);
  };
  return (
    <div className="gpred">
      <div className="gpred-h">{t("group")} {g}</div>
      {[0, 1, 2, 3].map((i) => (
        <div className="gpline" key={i}>
          <span className="ppos num">{i + 1}</span>
          <select className="select gpsel" value={cur[i]} onChange={(e) => setPos(i, e.target.value)}>
            <option value="">—</option>
            {teams.map((tm) => {
              const usedElsewhere = cur.some((x, j) => j !== i && x && sameTeam(x, tm));
              // allowSwap: keep used teams selectable — picking one swaps the two
              // positions (setPos handles it). Otherwise they're disabled.
              return <option key={tm} value={tm} disabled={!allowSwap && usedElsewhere}>{tm}{allowSwap && usedElsewhere ? " ⇄" : ""}</option>;
            })}
          </select>
        </div>
      ))}
    </div>
  );
}
// Reusable propagating knockout-bracket picker (R32→Final). Used by both the
// player self-service view and the admin Edit-predictions screen.
function BracketPicker({ data, picks, onPick, t, locked }) {
  return (
    <div className="mypick-ko">
      <span className="mypick-lbl">🏆 {t("koBracket")}</span>
      <p className="hint block">{locked ? t("koBracketLocked") : t("koBracketHint")}</p>
      {KO_SEQ.map(([code, n]) => (
        <div className="koround" key={code}>
          <div className="koround-h">{t("r_" + code)}</div>
          {Array.from({ length: n }, (_, i) => {
            const id = koSlotId(code, i);
            const [a, b] = koSlotContenders(picks, code, i).map((x) => (x ? canonTeam(x) : null));
            const pick = picks[id] ? canonTeam(picks[id]) : null;
            const actualW = koSlotActualWinner(code, i, data);
            const slotLocked = locked || !!actualW;
            if (!a || !b) return <div className="kotie tba" key={id}><span className="kotie-tba">{(a || t("koTba2")) + " " + t("koVs") + " " + (b || t("koTba2"))}</span></div>;
            return (
              <div className="kotie" key={id}>
                <span className="kotie-match"><Team t={a} /> <span className="kovs">{t("koVs")}</span> <Team t={b} />{code === "F" && pick ? <span className="kochip">👑 {pick}</span> : null}</span>
                {slotLocked
                  ? <span className="kotie-lk">{pick || "—"}{actualW ? (sameTeam(pick, actualW) ? " ✓" : " ✕") : " 🔒"}</span>
                  : <select className="select kosel" value={pick || ""} onChange={(e) => onPick(id, e.target.value)}>
                      <option value="">— {t("pickWinner")} —</option>
                      <option value={a}>{a}</option>
                      <option value={b}>{b}</option>
                    </select>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
// Self-service: the signed-in player sets their own group order, champion + knockout winners (until lock).
function MyPickCard({ data, setData, player, t, logout, persist }) {
  const save = persist || persistLive; // secure gateway when provided, else blob
  const [groupsExp, setGroupsExp] = useState(false); // group predictions collapsed by default
  const allTeams = useMemo(() => GROUP_KEYS.flatMap((g) => GROUPS[g]).slice().sort((a, b) => a.localeCompare(b)), []);
  const cl = champLock(data);
  const locked = cl.at ? Date.now() > cl.at : false;
  const gl = groupPredLock(data);
  // Group predictions are disabled once the group stage is underway (any result in)
  // or an admin lock has passed — they're done by the knockout phase.
  const groupsDisabled = (gl.at ? Date.now() > gl.at : false) || completedCount(data) > 0;
  const p = data.players[player] || {};
  const setGroupPred = (g, arr) => setData((d) => {
    const cur = (d.players[player] && d.players[player].groupPreds) || {};
    const nd = { ...d, players: { ...d.players, [player]: { ...d.players[player], groupPreds: { ...cur, [g]: arr } } },
      auditLog: [{ ts: Date.now(), msg: `${t("nav_predictions")} (self): ${player} ${g} → ${arr.map((x) => x || "—").join(", ")}` }, ...(d.auditLog || [])].slice(0, 80) };
    save(nd); return nd;
  });
  const setChamp = (team) => setData((d) => {
    const nd = { ...d, players: { ...d.players, [player]: { ...d.players[player], champion: team || null } },
      auditLog: [{ ts: Date.now(), msg: `${t("champPick")} (self): ${player} → ${team || "—"}` }, ...(d.auditLog || [])].slice(0, 80) };
    save(nd); return nd;
  });
  // Bracket pick: set/clear a slot winner, then prune downstream picks that the
  // change invalidated so the bracket stays consistent.
  const setKo = (slotId, team) => setData((d) => {
    const cur = { ...((d.players[player] && d.players[player].knockout) || {}) };
    if (team) cur[slotId] = canonTeam(team); else delete cur[slotId];
    koPrune(cur);
    // the Final winner is the player's champion — keep the two in sync
    const champ = slotId === KO_FINAL_ID ? (cur[KO_FINAL_ID] || null) : (d.players[player] && d.players[player].champion) || null;
    const nd = { ...d, players: { ...d.players, [player]: { ...d.players[player], knockout: cur, champion: champ } },
      auditLog: [{ ts: Date.now(), msg: `${t("koPicks")} (self): ${player} ${slotId} → ${team || "—"}` }, ...(d.auditLog || [])].slice(0, 80) };
    save(nd); return nd;
  });
  const myKo = (p && p.knockout) || {};
  // One-tap fill: randomises every UNLOCKED section. Seeded with the player's
  // own name (+ a per-click nonce) so two players never get the same draw.
  const randomFill = () => {
    if (!window.confirm(t("randomConfirm"))) return;
    const nonce = Date.now();
    setData((d) => {
      const cur = d.players[player] || {};
      const gp = { ...(cur.groupPreds || {}) };
      if (!groupsDisabled) GROUP_KEYS.forEach((g) => { gp[g] = shuffle(GROUPS[g], hashStr(player + "|g|" + g + "|" + nonce)); });
      let champion = cur.champion;
      const ko = { ...(cur.knockout || {}) };
      // Fill the bracket top-down so each round's contenders are decided before it.
      if (!locked) {
        for (const [code, n] of KO_SEQ) {
          for (let i = 0; i < n; i++) {
            if (koSlotActualWinner(code, i, data)) continue; // already played
            const cont = koSlotContenders(ko, code, i).filter(Boolean);
            if (cont.length < 2) continue;
            ko[koSlotId(code, i)] = canonTeam(shuffle(cont.slice(), hashStr(player + "|ko|" + code + i + "|" + nonce))[0]);
          }
        }
        koPrune(ko);
        champion = canonTeam(ko[KO_FINAL_ID]) || champion; // champion = bracket final winner
      }
      const nd = { ...d, players: { ...d.players, [player]: { ...cur, groupPreds: gp, champion: champion || null, knockout: ko } },
        auditLog: [{ ts: nonce, msg: `${t("randomFill")} (self): ${player}` }, ...(d.auditLog || [])].slice(0, 80) };
      save(nd); return nd;
    });
  };
  const anyOpen = !groupsDisabled || !locked;
  // Progress: champion + all 31 bracket slots (R32→Final).
  const koSlotCount = KO_SEQ.reduce((s, [, n]) => s + n, 0);
  const koSlotsMade = KO_SEQ.reduce((s, [code, n]) => { for (let i = 0; i < n; i++) if (myKo[koSlotId(code, i)]) s++; return s; }, 0);
  const picksTotal = 1 + koSlotCount;
  const picksMade = (canonTeam(p.champion) ? 1 : 0) + koSlotsMade;
  const pickPct = picksTotal ? Math.round((picksMade / picksTotal) * 100) : 0;
  return (
    <div className="card mypick">
      <div className="mypick-head"><Avatar name={player} /><span className="champname">{t("signedInAs")} <b>{player}</b></span><button className="seeall" onClick={logout}>{t("logout")}</button></div>
      <div className="pickprog"><div className="pickprog-row"><span>{t("picksMade")}</span><span className="num"><b>{picksMade}</b>/{picksTotal}{picksMade >= picksTotal && " ✓"}</span></div><div className="pickprog-bar"><span style={{ width: pickPct + "%" }} /></div></div>
      {anyOpen && <button className="btn mypick-fill" onClick={randomFill}>🎲 {t("randomFill")}</button>}

      <div className={"mypick-groups" + (groupsDisabled ? " off" : "")}>
        <button className="mypick-lbl collapse" onClick={() => setGroupsExp((v) => !v)} aria-expanded={groupsExp}>
          <span>📋 {t("nav_predictions")}{groupsDisabled && <span className="coll-lock"> · {t("locked")}</span>}</span>
          <span className="coll-chev">{groupsExp ? "▾" : "▸"}</span>
        </button>
        {groupsExp && <>
          <p className="hint block">{groupsDisabled ? t("groupLockedHint") : t("groupPredHint")}</p>
          {GROUP_KEYS.map((g) => (
            <GroupPredEditor key={g} g={g} pred={playerGroupPred(p, g)} locked={groupsDisabled} onSet={(arr) => setGroupPred(g, arr)} t={t} />
          ))}
          {gl.at && !groupsDisabled && <p className="hint block">{t("lockBy")} {new Date(gl.at).toLocaleString()}{gl.auto ? ` · ${t("groupLockAuto")}` : ""}</p>}
        </>}
      </div>

      <div className="mypick-body">
        <span className="mypick-lbl">👑 {t("champPick")}</span>
        {locked
          ? <span className="mypick-locked"><Team t={canonTeam(p.champion)} dim={!p.champion} /> · {t("locked")}</span>
          : <select className="select champsel" value={canonTeam(p.champion) || ""} onChange={(e) => setChamp(e.target.value)}>
              <option value="">— {t("champPick")} —</option>
              {allTeams.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
            </select>}
      </div>
      {cl.at && !locked && <p className="hint block">{t("lockBy")} {new Date(cl.at).toLocaleString()}{cl.auto ? ` · ${t("lockAuto")}` : ""}</p>}

      <BracketPicker data={data} picks={myKo} onPick={setKo} t={t} locked={locked} />
    </div>
  );
}
// Admin: phone numbers + one-tap "send login over WhatsApp" + the pick lock time.
function AdminPlayers({ data, setData, t }) {
  const players = Object.keys(data.players);
  // Short 4-digit sign-in code (1000–9999), unique across players.
  const newCode = () => {
    const used = new Set(players.map((n) => String(data.players[n].token || "")).filter(Boolean));
    for (let tries = 0; tries < 400; tries++) { const c = String(1000 + Math.floor(Math.random() * 9000)); if (!used.has(c)) return c; }
    return String(1000 + Math.floor(Math.random() * 9000));
  };
  const update = (name, patch) => setData((d) => { const nd = { ...d, players: { ...d.players, [name]: { ...d.players[name], ...patch } } }; persistLive(nd); return nd; });
  const codeFor = (name) => { let tk = data.players[name].token; if (!tk) { tk = newCode(); update(name, { token: tk }); } return tk; };
  const regenCode = (name) => update(name, { token: newCode() });
  const waSend = (name) => {
    const code = codeFor(name), num = String(data.players[name].phone || "").replace(/[^\d]/g, "");
    const msg = `${t("waMsg1")} ${name}! ${t("waCodeMsg")} *${code}*\n\n${t("waCodeMsg2")}`;
    window.open(num ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };
  const waRemind = (name) => {
    const code = codeFor(name), num = String(data.players[name].phone || "").replace(/[^\d]/g, "");
    const msg = `${t("waMsg1")} ${name}, ${t("waRemindMsg1")}. ${t("waCodeMsg")} *${code}*\n${t("waCodeMsg2")}`;
    window.open(num ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };
  const copyLink = (name) => { try { navigator.clipboard.writeText(codeFor(name)); } catch (e) {} };
  const cl = champLock(data);
  const gl = groupPredLock(data);
  const setGroupLock = (val) => setData((d) => { const nd = { ...d, settings: { ...(d.settings || {}), groupLockUtc: val || null } }; persistLive(nd); return nd; });
  const setChampLock = (val) => setData((d) => { const nd = { ...d, settings: { ...(d.settings || {}), champLockUtc: val || null } }; persistLive(nd); return nd; });
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh"><Ico name="prediction" size={18} /> {t("nav_players")}</h3>
        <p className="hint block">{t("playersHint")}</p>
      </div>
      <div className="card slim">
        <span className="hlabel">⏰ {t("champLock")}</span>
        <input className="select" type="datetime-local" value={(data.settings && data.settings.champLockUtc) || ""} onChange={(e) => setChampLock(e.target.value)} />
        <p className="hint block">{cl.at ? new Date(cl.at).toLocaleString() + (cl.auto ? ` · ${t("lockAuto")}` : ` · ${t("lockManual")}`) : t("lockAutoTba")}</p>
      </div>
      <div className="card slim">
        <span className="hlabel">📋 {t("groupLock")}</span>
        <input className="select" type="datetime-local" value={(data.settings && data.settings.groupLockUtc) || ""} onChange={(e) => setGroupLock(e.target.value)} />
        <p className="hint block">{gl.at ? new Date(gl.at).toLocaleString() : t("groupLockOpen")}</p>
      </div>
      <div className="card">
        {players.map((name) => (
          <div className="plrow" key={name}>
            <div className="plrow-top"><Avatar name={name} /><span className="champname">{name}</span>{data.players[name].token && <span className="plcode">🔑 {data.players[name].token}</span>}{data.players[name].champion && <span className="plpick">👑 {canonTeam(data.players[name].champion)}</span>}</div>
            <div className="plrow-ctl">
              <input className="select plphone" type="tel" inputMode="tel" placeholder={t("phonePh")} value={data.players[name].phone || ""} onChange={(e) => update(name, { phone: e.target.value })} />
              <button className="btn wabtn" onClick={() => waSend(name)}>{t("waSend")}</button>
              <button className="btn wabtn ghost" onClick={() => waRemind(name)}>{t("waRemind")}</button>
              <button className="btn ghost" onClick={() => copyLink(name)}>{t("copyCode")}</button>
              <button className="btn ghost" onClick={() => regenCode(name)}>{t("regenCode")}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
// Admin: enter/confirm the real knockout fixtures (matchups + kickoff times).
// Writes blob.knockoutMatches, which powers the champion lock, players' knockout
// picks (real 4h locks + scoring) and the results editor.
const KO_SLOTS = KO_ROUNDS.flatMap(([rk, n]) => Array.from({ length: n }, (_, k) => ({ mid: `${rk}_${k}`, round: rk })));
function toLocalInput(ms) { if (!ms) return ""; const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }
function AdminKnockout({ data, setData, t }) {
  const allTeams = useMemo(() => GROUP_KEYS.flatMap((g) => GROUPS[g]).slice().sort((a, b) => a.localeCompare(b)), []);
  // Prefer the real KO fixtures already in the data (synced from the live feed or
  // previously saved) — keyed by their own mid so edits override the right match.
  // Only fall back to the blank R32… scaffold when no fixtures exist yet.
  const real = useMemo(() => (data.matches || []).filter((m) => m.stage === "ko").sort((a, b) => (a.ko || 0) - (b.ko || 0)), [data]);
  const init = useMemo(() => {
    if (real.length) return real.map((m) => ({ mid: m.mid, round: m.round, home: canonTeam(m.home) || "", away: canonTeam(m.away) || "", venue: m.venue || "", kickoff: toLocalInput(m.ko) }));
    return KO_SLOTS.map((s) => ({ ...s, home: "", away: "", venue: "", kickoff: "" }));
  }, [real]);
  const [rows, setRows] = useState(init);
  const [savedAt, setSavedAt] = useState(null);
  const setRow = (mid, patch) => setRows((rs) => rs.map((r) => r.mid === mid ? { ...r, ...patch } : r));
  const seedR32 = () => {
    const bracket = buildBracket(data); const r32 = (bracket.find((r) => r.round === "R32") || { ties: [] }).ties;
    setRows((rs) => rs.map((r) => { if (!r.mid.startsWith("R32_")) return r; const k = Number(r.mid.split("_")[1]); const tie = r32[k] || {}; return { ...r, home: canonTeam(tie.home) || r.home, away: canonTeam(tie.away) || r.away }; }));
  };
  const filled = rows.filter((r) => r.home || r.away);
  const kicks = filled.map((r) => (r.kickoff ? Date.parse(r.kickoff) : 0)).filter(Boolean);
  const firstKick = kicks.length ? Math.min(...kicks) : null;
  const save = () => {
    setData((d) => {
      const byMid = {}; (d.matches || []).forEach((m) => { if (m.stage === "ko" && m.mid) byMid[m.mid] = m; });
      const koMatches = filled.map((r, i) => {
        const prev = byMid[r.mid] || {};
        return { id: r.mid, stage: "ko", group: null, idx: i, mid: r.mid, round: r.round, home: r.home || null, away: r.away || null, venue: r.venue || "",
          ko: r.kickoff ? Date.parse(r.kickoff) : 0, real: true, finalH: prev.finalH ?? null, finalA: prev.finalA ?? null, penWinner: prev.penWinner ?? null,
          adminLocked: prev.adminLocked || false, hs: prev.hs ?? null, as: prev.as ?? null, status: prev.status || "scheduled", minute: prev.minute ?? null,
          allEvents: prev.allEvents || [], allStats: prev.allStats || null, lineups: prev.lineups || null };
      });
      const others = (d.matches || []).filter((m) => m.stage !== "ko");
      const matches = [...others, ...koMatches].sort((a, b) => (a.ko || 0) - (b.ko || 0));
      const blob = { ...(d._blob || {}) };
      blob.knockoutMatches = filled.map((r) => { const prev = byMid[r.mid] || {}; return { mid: r.mid, round: r.round, home: r.home || null, away: r.away || null, venue: r.venue || "", kickoffUtc: r.kickoff ? new Date(Date.parse(r.kickoff)).toISOString() : null, home_score: prev.finalH ?? null, away_score: prev.finalA ?? null, winner: prev.penWinner ?? null }; });
      const nd = recomputeLive({ ...d, _blob: blob, matches, auditLog: [{ ts: Date.now(), msg: `${t("nav_knockout")}: ${koMatches.length} ${t("koFixtures")}` }, ...(d.auditLog || [])].slice(0, 80) }, nowMs());
      persistLive(nd); return nd;
    });
    setSavedAt(Date.now());
  };
  let lastRound = null;
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh"><Ico name="bracket" size={18} /> {t("nav_knockout")}</h3>
        <p className="hint block">{real.length ? t("koOverrideNote") : t("koFixturesHint")}</p>
        <div className="kf-actions">{!real.length && <button className="btn ghost" onClick={seedR32}>{t("koSeedR32")}</button>}<button className="btn" onClick={save}>{t("koSave")}</button></div>
        <div className="hrow"><span className="hlabel">{t("koFixtures")}</span><span className="hval num">{filled.length}{real.length ? "" : `/${KO_SLOTS.length}`}</span></div>
        <div className="hrow"><span className="hlabel">{t("koFirstKick")}</span><span className="hval num">{firstKick ? new Date(firstKick).toLocaleString() : "—"}</span></div>
        {savedAt && <p className="hint block ok">✓ {t("koSaved")}</p>}
      </div>
      <div className="card">
        {rows.map((r) => {
          const head = r.round !== lastRound ? (lastRound = r.round) : null;
          return (
            <div key={r.mid}>
              {head && <div className="kf-round">{t("r_" + r.round)}</div>}
              <div className="kf-row">
                <select className="select kf-team" value={r.home} onChange={(e) => setRow(r.mid, { home: e.target.value })}>
                  <option value="">— {t("koHome")} —</option>{allTeams.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
                </select>
                <span className="kf-v">v</span>
                <select className="select kf-team" value={r.away} onChange={(e) => setRow(r.mid, { away: e.target.value })}>
                  <option value="">— {t("koAway")} —</option>{allTeams.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
                </select>
                <input className="select kf-ko" type="datetime-local" value={r.kickoff} onChange={(e) => setRow(r.mid, { kickoff: e.target.value })} />
              </div>
            </div>
          );
        })}
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
      // Authoritative source: the full-season feed (every fixture + its status).
      // Only status === "FT" is persisted as final; every other fixture (NS /
      // live) is written back as "scheduled", so a stale/phantom final can never
      // survive a sync — a future match can no longer masquerade as played.
      const season = await fetchSeasonEvents(key);
      const status = getFeedStatus();
      const finalRows = {}, clearRows = {};
      season.forEach((e) => {
        const m = resolveRRByTeams(null, e.home, e.away); if (!m) return;
        const [g, iStr] = m.key.split("_"); const i = Number(iStr);
        const [home, away] = matchTeams(g, i);
        if (e.finished && e.homeScore != null && e.awayScore != null) {
          let hs = Number(e.homeScore), as = Number(e.awayScore);
          if (m.reversed) { const tmp = hs; hs = as; as = tmp; }
          if (!Number.isFinite(hs) || !Number.isFinite(as)) return;
          finalRows[m.key] = { match_key: m.key, group_key: g, match_idx: i, home_team: home, away_team: away, home_score: hs, away_score: as, status: "final", source: "api" };
        } else {
          clearRows[m.key] = { match_key: m.key, group_key: g, match_idx: i, home_team: home, away_team: away, home_score: null, away_score: null, status: "scheduled", source: "api" };
        }
      });
      // Gap-fill: any FT fixture the season feed somehow lacks a score for —
      // look it up directly by eventId (premium V2). Never touches NS matches.
      const stillNeed = (data.matches || []).filter((mm) => mm.stage === "group" && !finalRows[mm.id] && !clearRows[mm.id] && mm.eventId && mm.ko && mm.ko <= Date.now()).map((mm) => ({ key: mm.id, eventId: mm.eventId }));
      if (stillNeed.length) {
        try {
          const finals = await fetchEventFinals(stillNeed, key);
          finals.forEach((f) => {
            if (!f.finished) return;
            const [g, iStr] = f.key.split("_"); const i = Number(iStr);
            const [home, away] = matchTeams(g, i);
            let hs = Number(f.homeScore), as = Number(f.awayScore);
            if (!Number.isFinite(hs) || !Number.isFinite(as)) return;
            if (f.home && f.away && !sameTeam(f.home, home) && sameTeam(f.home, away)) { const tmp = hs; hs = as; as = tmp; }
            finalRows[f.key] = { match_key: f.key, group_key: g, match_idx: i, home_team: home, away_team: away, home_score: hs, away_score: as, status: "final", source: "api-event" };
            delete clearRows[f.key];
          });
        } catch (e) { /* gap fill is best-effort */ }
      }
      // Only reset fixtures the DB currently holds as final (the phantoms) — no
      // pointless writes for matches that were already scheduled.
      const dbFinal = new Set((data.matches || []).filter((mm) => mm.resSource === "db" && mm.finalH != null).map((mm) => mm.id));
      const clears = Object.values(clearRows).filter((row) => dbFinal.has(row.match_key));
      const clearedSet = new Set(clears.map((r) => r.match_key));
      const rows = [...Object.values(finalRows), ...clears];
      let saved = 0; const cleared = clears.length;
      if (rows.length) { try { await upsertResults(rows); saved = Object.keys(finalRows).length; } catch (e) { /* surfaced below */ } }
      // Knockout fixtures + results, straight from the same season feed.
      const koFix = koFixturesFromSeason(season);
      await fillKoPenWinners(koFix, key);
      // Re-derive locally so results show immediately, and persist the blob too.
      setData((d) => {
        const gr = { ...d.groupResults };
        Object.values(finalRows).forEach((row) => { gr[row.match_key] = { home: String(row.home_score), away: String(row.away_score) }; });
        clearedSet.forEach((k) => { delete gr[k]; });
        let matches = d.matches.map((mm) => {
          if (mm.stage !== "group") return mm;
          if (finalRows[mm.id]) { const r = finalRows[mm.id]; return { ...mm, finalH: r.home_score, finalA: r.away_score, resSource: "db" }; }
          if (clearedSet.has(mm.id)) return { ...mm, finalH: null, finalA: null, resSource: null };
          return mm;
        });
        let blob = { ...(d._blob || {}) };
        if (koFix.length) {
          const koObjs = koMatchObjsFromFixtures(koFix);
          matches = [...matches.filter((m) => m.stage !== "ko"), ...koObjs].sort((a, b) => (a.ko || 0) - (b.ko || 0));
          blob.knockoutMatches = koFix.map(({ eventId, ...r }) => r);
        }
        const nd = recomputeLive({ ...d, _blob: blob, groupResults: gr, matches });
        persistLive(nd);
        return nd;
      });
      // which over matches still have no score (and weren't just cleared as NS)?
      const missing = (data.matches || []).filter((mm) => mm.stage === "group" && !finalRows[mm.id] && !clearedSet.has(mm.id) && mm.resSource !== "db" && mm.ko && mm.ko <= Date.now())
        .map((mm) => `${canonTeam(mm.home)} v ${canonTeam(mm.away)}`);
      setReport({ mode: status.mode, events: status.events, completed: status.completed, mapped: Object.keys(finalRows).length, saved, cleared, missing, ko: koFix.length });
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
            <div className="hrow"><span className="hlabel">{t("feedKo")}</span><span className="hval num">{report.ko != null ? report.ko : 0}</span></div>
            {report.cleared > 0 && <div className="hrow"><span className="hlabel">{t("feedCleared")}</span><span className="hval num">{report.cleared}</span></div>}
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
// Admin: pick any player and edit their group-order predictions (and champion).
// Unlike the self-service editor this ignores locks — the admin can correct a
// pick at any time. Every change saves immediately to the shared blob.
function AdminEditPicks({ data, setData, t, name, setName }) {
  const players = Object.keys(data.players);
  const sel = players.includes(name) ? name : players[0];
  const p = (sel && data.players[sel]) || {};
  const allTeams = useMemo(() => GROUP_KEYS.flatMap((g) => GROUPS[g]).slice().sort((a, b) => a.localeCompare(b)), []);
  const [saved, setSaved] = useState(0);
  const flashSaved = () => setSaved(Date.now());
  const setGroupPred = (g, arr) => setData((d) => {
    const cur = (d.players[sel] && d.players[sel].groupPreds) || {};
    const nd = { ...d, players: { ...d.players, [sel]: { ...d.players[sel], groupPreds: { ...cur, [g]: arr } } },
      auditLog: [{ ts: Date.now(), msg: `${t("nav_editpicks")} (admin): ${sel} ${g} → ${arr.map((x) => x || "—").join(", ")}` }, ...(d.auditLog || [])].slice(0, 80) };
    persistLive(nd); return nd;
  });
  const setChamp = (team) => setData((d) => {
    const nd = { ...d, players: { ...d.players, [sel]: { ...d.players[sel], champion: team || null } },
      auditLog: [{ ts: Date.now(), msg: `${t("champPick")} (admin): ${sel} → ${team || "—"}` }, ...(d.auditLog || [])].slice(0, 80) };
    persistLive(nd); return nd;
  });
  const setKo = (slotId, team) => setData((d) => {
    const cur = { ...((d.players[sel] && d.players[sel].knockout) || {}) };
    if (team) cur[slotId] = canonTeam(team); else delete cur[slotId];
    koPrune(cur);
    const champ = slotId === KO_FINAL_ID ? (cur[KO_FINAL_ID] || null) : (d.players[sel] && d.players[sel].champion) || null;
    const nd = { ...d, players: { ...d.players, [sel]: { ...d.players[sel], knockout: cur, champion: champ } },
      auditLog: [{ ts: Date.now(), msg: `${t("koBracket")} (admin): ${sel} ${slotId} → ${team || "—"}` }, ...(d.auditLog || [])].slice(0, 80) };
    persistLive(nd); return nd;
  });
  // Bulk import: paste { "Player Name": { "R32#0": "Germany", ... }, ... }.
  const [imp, setImp] = useState("");
  const [impMsg, setImpMsg] = useState("");
  const applyImport = () => {
    let obj; try { obj = JSON.parse(imp); } catch (e) { setImpMsg(t("importBad")); return; }
    setData((d) => {
      const players = { ...d.players }; let n = 0, hit = 0, miss = [];
      for (const name in obj) {
        if (!players[name]) { miss.push(name); continue; }
        hit++;
        const ko = { ...(players[name].knockout || {}) };
        for (const slot in obj[name]) { const tm = canonTeam(obj[name][slot]); if (tm) { ko[slot] = tm; n++; } }
        koPrune(ko);
        players[name] = { ...players[name], knockout: ko, champion: ko[KO_FINAL_ID] || players[name].champion || null };
      }
      const nd = { ...d, players, auditLog: [{ ts: Date.now(), msg: `${t("nav_editpicks")} (admin import): ${hit} ${t("expPlayersN")}, ${n} picks` }, ...(d.auditLog || [])].slice(0, 80) };
      persistLive(nd); setImpMsg(`${t("editPicksSaved")}: ${hit} · ${n} picks${miss.length ? " · ?: " + miss.join(", ") : ""}`); return nd;
    });
  };
  if (!sel) return <div className="view"><div className="card slim"><h3 className="cardh"><Ico name="edit" size={18} /> {t("nav_editpicks")}</h3><p className="hint block">{t("noPlayers") || "—"}</p></div></div>;
  return (
    <div className="view">
      <div className="card slim"><h3 className="cardh"><Ico name="edit" size={18} /> {t("nav_editpicks")}{saved ? <span className="coll-lock"> · {t("editPicksSaved")} ✓</span> : null}</h3>
        <p className="hint block">{t("editPicksHint")}</p>
        <select className="select" value={sel} onChange={(e) => setName(e.target.value)}>{players.map((n) => <option key={n} value={n}>{n}</option>)}</select>
      </div>
      <div className="card">
        <div className="mypick-body"><span className="mypick-lbl">👑 {t("champPick")}</span>
          <select className="select champsel" value={canonTeam(p.champion) || ""} onChange={(e) => { setChamp(e.target.value); flashSaved(); }}>
            <option value="">— {t("champPick")} —</option>
            {allTeams.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
          </select>
        </div>
      </div>
      <div className="card">
        <h3 className="cardh">📋 {t("nav_predictions")}</h3>
        {GROUP_KEYS.map((g) => (
          <GroupPredEditor key={g} g={g} pred={playerGroupPred(p, g)} locked={false} allowSwap onSet={(arr) => { setGroupPred(g, arr); flashSaved(); }} t={t} />
        ))}
      </div>
      <div className="card">
        <BracketPicker data={data} picks={(p && p.knockout) || {}} onPick={(id, team) => { setKo(id, team); flashSaved(); }} t={t} locked={false} />
      </div>
      <div className="card">
        <h3 className="cardh">📥 {t("importBrackets")}</h3>
        <p className="hint block">{t("importHint")}</p>
        <textarea className="select" rows={5} style={{ fontFamily: "monospace", fontSize: 12 }} value={imp} placeholder={'{ "Dani Haddad": { "R32#0": "Germany", "F#0": "Argentina" } }'} onChange={(e) => { setImp(e.target.value); setImpMsg(""); }} />
        <button className="btn" style={{ marginTop: 8 }} onClick={applyImport} disabled={!imp.trim()}>{t("importApply")}</button>
        {impMsg && <p className="hint block" style={{ marginTop: 6 }}>{impMsg}</p>}
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
            <thead><tr><th className="sticky">{t("player")}</th><th>{t("rank")}</th><th>{t("groupRank")}</th><th>{t("knockout")}</th><th>{t("champion")}</th><th>{t("points")}</th></tr></thead>
            <tbody>
              {lb.map((r) => (
                <tr key={r.name}><td className="sticky pgname"><Avatar name={r.name} /><span>{r.name}</span></td>
                  <td className="num">{r.rank}</td><td className="num">{r.groupRank}</td><td className="num">{r.knockout}</td><td className="num">{r.champ}</td><td className="num"><b>{r.total}</b></td></tr>
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
  { id: "bracket", ic: "bracket", key: "nav_bracket" },
  { id: "more", ic: "menu", key: "nav_more" },
];
const MORE_ITEMS = [
  { id: "groups", ic: "groups", key: "nav_groups" },
  { id: "team", ic: "users", key: "nav_team" },
  { id: "points", ic: "prediction", key: "nav_points" },
  { id: "profile", ic: "profile", key: "nav_profile" },
  { id: "predictions", ic: "prediction", key: "nav_predictions" },
  { id: "consensus", ic: "users", key: "nav_consensus" },
  { id: "trends", ic: "chart", key: "nav_trends" },
  { id: "scorers", ic: "ball", key: "nav_scorers" },
  { id: "help", ic: "help", key: "nav_help" },
];
const ADMIN_ITEMS = [
  { id: "results", ic: "edit", key: "nav_results" },
  { id: "knockout", ic: "bracket", key: "nav_knockout" },
  { id: "players", ic: "prediction", key: "nav_players" },
  { id: "champions", ic: "trophy", key: "nav_champions" },
  { id: "editpicks", ic: "edit", key: "nav_editpicks" },
  { id: "playerpicks", ic: "bracket", key: "nav_playerpicks" },
  { id: "playerreport", ic: "chart", key: "nav_playerreport" },
  { id: "audit", ic: "search", key: "nav_audit" },
  { id: "backup", ic: "backup", key: "nav_backup" },
  { id: "export", ic: "backup", key: "nav_export" },
  { id: "health", ic: "health", key: "nav_health" },
  { id: "syncresults", ic: "sync", key: "nav_sync" },
  { id: "repair", ic: "tools", key: "nav_repair" },
  { id: "settings", ic: "settings", key: "nav_settings" },
];
/* Global live ticker dock — ported from the legacy app. A fixed strip above the
   bottom nav, shown on every screen while any match is live: a pulsing dot,
   the lead match minute, and a marquee of live scores/events. Tap to expand a
   per-match feed that accumulates kick-off / GOAL! / full-time lines as the
   live scores change across polls. Hidden entirely when nothing is live. */
function LiveDock({ data, t, onOpen }) {
  const live = useMemo(() => liveMatches(data), [data]);
  const feedsRef = useRef({});
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => {
    const feeds = feedsRef.current;
    const liveKeys = {};
    live.forEach((m) => {
      const key = m.id; liveKeys[key] = 1;
      const hasScore = m.hs != null && m.as != null;
      const hs = Number(m.hs) || 0, as = Number(m.as) || 0;
      const mn = m.ht ? "HT" : (m.minute == null ? "" : (m.minute > 90 ? "90+'" : m.minute + "'"));
      const hn = canonTeam(m.home), an = canonTeam(m.away);
      let f = feeds[key];
      if (!f) {
        f = feeds[key] = { hs, as, hasScore, ended: false, home: hn, away: an, hf: flagOf(m.home), af: flagOf(m.away), events: [] };
        f.events.push({ min: "0'", kind: "ko", text: t("kickoff") });
        if (hasScore && (hs || as)) f.events.push({ min: mn, kind: "", text: `${hn} ${hs}–${as} ${an}` });
      } else {
        if (hasScore && hs > f.hs) f.events.push({ min: mn, kind: "goal", text: `${t("goalEx")} ${hn} — ${hs}–${as}` });
        if (hasScore && as > f.as) f.events.push({ min: mn, kind: "goal", text: `${t("goalEx")} ${an} — ${hs}–${as}` });
        f.hs = hs; f.as = as; f.hasScore = hasScore;
      }
      f.curMin = mn;
    });
    // Emit full-time for matches that just left the live set.
    Object.keys(feeds).forEach((key) => {
      const f = feeds[key];
      if (!liveKeys[key] && !f.ended) { f.ended = true; const sc = f.hasScore ? `${f.hs}–${f.as}` : "—"; f.events.push({ min: "FT", kind: "", text: `${t("fullTime")} — ${f.home} ${sc} ${f.away}` }); }
    });
    bump((n) => n + 1);
  }, [live, t]);
  if (!live.length) return null;
  const feeds = feedsRef.current;
  const lead = live[0]; const leadMin = feeds[lead.id] ? feeds[lead.id].curMin : "";
  const ticks = live.map((m) => {
    const f = feeds[m.id]; const last = f && f.events.length ? f.events[f.events.length - 1] : null;
    const sc = f && f.hasScore ? `${f.hs}–${f.as}` : "·–·";
    return `${sc} ${canonTeam(m.home)} v ${canonTeam(m.away)}${last ? " · " + last.text : ""}`;
  });
  const marquee = ticks.join("   ·   ") + "   ·   ";
  return (
    <div className={"livedock" + (open ? " open" : "")}>
      {open && (
        <div className="live-feed">
          <div className="live-feed-h"><span className="lft"><span className="ld" />{t("liveUpdates")}</span><button className="lfx" onClick={() => setOpen(false)}>{t("hide")} ⌄</button></div>
          {live.map((m) => {
            const f = feeds[m.id]; if (!f) return null;
            const sc = f.hasScore ? `${f.hs}–${f.as}` : "·–·";
            return (
              <div key={m.id}>
                <div className="live-grp">{f.hf} {f.home} {sc} {f.away} {f.af} · {f.curMin}</div>
                {[...f.events].reverse().map((e, i) => (
                  <div className="live-ev" key={i}><span className="lmin">{e.min}</span><span className={"ltxt" + (e.kind === "goal" ? " goal" : "")}>{e.text}</span></div>
                ))}
              </div>
            );
          })}
          <button className="live-open" onClick={() => { setOpen(false); onOpen(lead); }}>{t("openMatch")}</button>
        </div>
      )}
      <button className="live-strip" onClick={() => setOpen((o) => !o)}>
        <span className="ld" /><span className="live-lbl">{t("liveLbl")} {leadMin}</span>
        <div className="live-marquee"><span>{marquee}{marquee}</span></div>
        <span className="live-chev">⌃</span>
      </button>
    </div>
  );
}
export default function App() {
  const [lang, setLang] = useState("en");
  const [dark, setDark] = useState(false);
  const [view, setView] = useState("home");
  const [profileName, setProfileName] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [match, setMatch] = useState(null);
  const [groupSel, setGroupSel] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState(null);
  const [player, setPlayer] = useState(null); // self-service logged-in player (null = admin/guest)
  const [playerCode, setPlayerCode] = useState(null); // secure-mode credential for writes
  const [codeOpen, setCodeOpen] = useState(false); const [codeVal, setCodeVal] = useState(""); const [codeErr, setCodeErr] = useState(false); const [codeBusy, setCodeBusy] = useState(false);
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
        let playerRows = []; if (secureAuthOn()) { try { playerRows = await loadPlayerRows(SB_URL); } catch (e) { playerRows = []; } }
        const real = mapBlobToData(blob, resultRows, apiResults, playerRows);
        setAppTz(real.settings && real.settings.tz);
        try { real._live = mapLiveEvents(await fetchLivescore(key)); } catch (e) { real._live = {}; }
        // Premium per-eventId fill: kicked-off group matches the league feed missed.
        try {
          const need = real.matches.filter((m) => m.stage === "group" && m.finalH == null && m.eventId && m.ko && m.ko <= nowMs()).map((m) => ({ key: m.id, eventId: m.eventId }));
          if (need.length) { const finals = await fetchEventFinals(need, key); real.matches = applyEventFinals(real.matches, finals); }
        } catch (e) { /* feed gap fill is best-effort */ }
        // Knockout fixtures straight from the live season feed, so the bracket
        // populates automatically (no manual Sync needed) as the draw fills in.
        try {
          const koFix = koFixturesFromSeason(await fetchSeasonEvents(key));
          await fillKoPenWinners(koFix, key);
          if (koFix.length) real.matches = [...real.matches.filter((m) => m.stage !== "ko"), ...koMatchObjsFromFixtures(koFix)].sort((a, b) => (a.ko || 0) - (b.ko || 0));
        } catch (e) { /* feed KO is best-effort */ }
        if (!alive) return;
        setData(recomputeLive(real, nowMs())); setSource("live");
      } catch (e) {
        if (!alive) return;
        setLiveMode(false); setData(buildSampleData()); setSource("sample");
      }
    })();
    return () => { alive = false; };
  }, []);
  // Self-service login: a ?key=<token> link (admin-sent over WhatsApp, free)
  // signs a player in; the session is remembered on the device.
  useEffect(() => {
    if (!data || !data.players) return;
    try {
      const url = new URL(window.location.href);
      const tok = url.searchParams.get("key");
      if (tok) {
        const match = Object.keys(data.players).find((n) => data.players[n] && data.players[n].token === tok);
        if (match) { localStorage.setItem("wc_player", match); setPlayer(match); setView("mypicks"); }
        url.searchParams.delete("key");
        window.history.replaceState({}, "", url.pathname + (url.search || "") + (url.hash || ""));
      } else {
        const saved = localStorage.getItem("wc_player");
        if (saved && data.players[saved] && saved !== player) setPlayer(saved);
        if (!playerCode) { const sc = localStorage.getItem("wc_code"); if (sc) setPlayerCode(sc); }
      }
    } catch (e) { /* ignore */ }
  }, [data]);
  const logout = () => { try { localStorage.removeItem("wc_player"); localStorage.removeItem("wc_code"); } catch (e) {} setPlayer(null); setPlayerCode(null); };
  // Self-service login by code: the admin sends each player their code over
  // WhatsApp; the player enters it here to reveal their own picks. In secure
  // mode the code is validated server-side; otherwise it's matched locally.
  const finishLogin = (name, code) => { try { localStorage.setItem("wc_player", name); if (code) localStorage.setItem("wc_code", code); } catch (e) {} setPlayer(name); setPlayerCode(code || null); setCodeOpen(false); setCodeVal(""); setCodeErr(false); go("mypicks"); };
  const submitCode = async () => {
    const c = (codeVal || "").trim().toUpperCase();
    if (!c) { setCodeErr(true); return; }
    if (secureAuthOn()) {
      setCodeBusy(true);
      try {
        const res = await secureLogin(c);
        if (res && res.name) {
          setData((d) => ({ ...d, players: { ...d.players, [res.name]: { ...(d.players[res.name] || {}), ...(res.picks || {}) } } }));
          finishLogin(res.name, c);
        } else setCodeErr(true);
      } catch (e) { setCodeErr(true); }
      setCodeBusy(false);
      return;
    }
    if (!data || !data.players) { setCodeErr(true); return; }
    const match = Object.keys(data.players).find((n) => { const tk = data.players[n] && data.players[n].token; return tk && String(tk).toUpperCase() === c; });
    if (match) finishLogin(match, null);
    else setCodeErr(true);
  };
  // Persist the signed-in player's picks: gateway in secure mode, blob otherwise.
  const persistMyPicks = (nd) => {
    if (secureAuthOn() && playerCode && player) {
      const p = (nd.players && nd.players[player]) || {};
      secureSave(playerCode, { groupPreds: p.groupPreds || {}, champion: p.champion ?? null, knockout: p.knockout || {} }).catch((e) => console.warn("secure save failed", e && e.message));
    } else persistLive(nd);
  };
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
          let playerRows = []; if (secureAuthOn()) { try { playerRows = await loadPlayerRows(SB_URL); } catch (e) { playerRows = []; } }
          const real = mapBlobToData(blob, resultRows, apiResults, playerRows);
          setAppTz(real.settings && real.settings.tz);
          try { real._live = mapLiveEvents(await fetchLivescore(key)); } catch (e) { real._live = {}; }
          try {
            const need = real.matches.filter((m) => m.stage === "group" && m.finalH == null && m.eventId && m.ko && m.ko <= nowMs()).map((m) => ({ key: m.id, eventId: m.eventId }));
            if (need.length) { const finals = await fetchEventFinals(need, key); real.matches = applyEventFinals(real.matches, finals); }
          } catch (e) { /* best-effort */ }
          try {
            const koFix = koFixturesFromSeason(await fetchSeasonEvents(key));
            await fillKoPenWinners(koFix, key);
            if (koFix.length) real.matches = [...real.matches.filter((m) => m.stage !== "ko"), ...koMatchObjsFromFixtures(koFix)].sort((a, b) => (a.ko || 0) - (b.ko || 0));
          } catch (e) { /* feed KO is best-effort */ }
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
  // Analytics: keep shared context current, then fire app_open + first page view once.
  useEffect(() => { setAnalyticsContext({ app_language: lang, app_view: view, is_admin: isAdmin }); }, [lang, view, isAdmin]);
  useEffect(() => { trackEvent("app_open", { view: "home" }); trackPageView("home"); }, []);
  useEffect(() => { if (!profileName && lb[0]) setProfileName(lb[0].name); }, [lb, profileName]);
  const go = (v, name) => { if (v === "more") { setSheet(true); trackEvent("nav_click", { view: "more" }); return; } if (name) setProfileName(name); setSheet(false); setMatch(null); setView(v); window.scrollTo({ top: 0, behavior: "smooth" }); trackPageView(v); trackEvent("nav_click", { view: v }); };
  const openMatch = (m) => { setMatch(m); setView("match"); window.scrollTo({ top: 0, behavior: "smooth" }); trackPageView("match"); trackEvent("match_open", {}); };
  const openGroup = (g) => { setGroupSel(g); setSheet(false); setMatch(null); setView("groupgames"); window.scrollTo({ top: 0, behavior: "smooth" }); trackPageView("groupgames"); trackEvent("group_open", { group: g }); };
  // Profile picker wrapper: same as setProfileName but reports the selection.
  const selectProfile = (n) => { setProfileName(n); trackEvent("profile_select", { has_profile: !!n }); };

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
        <button className="tbtn" onClick={() => setLang((l) => { const n = l === "en" ? "ar" : "en"; trackEvent("language_change", { language: n }); return n; })}>{lang === "en" ? "ع" : "EN"}</button>
      </header>

      <main className="main">
        {view === "mypicks" && (player && data.players[player]
          ? <MyPickCard data={data} setData={setData} player={player} t={t} logout={logout} persist={persistMyPicks} />
          : <div className="view"><div className="card empty"><p className="block">{t("mypicksSignIn")}</p><button className="btn" onClick={() => setCodeOpen(true)}>🔑 {t("codeGo")}</button></div></div>)}
        {view === "home" && <Overview data={data} lb={lb} lang={lang} onOpen={openMatch} t={t} go={go} player={player} />}
        {view === "today" && <MatchCenter data={data} lang={lang} onOpen={openMatch} t={t} />}
        {view === "match" && match && <MatchDetail m={(data.matches || []).find((x) => x.id === match.id) || match} data={data} lang={lang} t={t} onBack={() => go("today")} />}
        {view === "table" && <Leaderboard data={data} lb={lb} prevRanks={prevRanks} name={profileName} setName={selectProfile} t={t} go={go} />}
        {view === "groups" && <Groups data={data} t={t} lang={lang} onOpenGroup={openGroup} />}
        {view === "groupgames" && groupSel && <GroupGames g={groupSel} data={data} lang={lang} onOpen={openMatch} t={t} onBack={() => go("groups")} />}
        {view === "team" && <TeamFixtures data={data} lang={lang} onOpen={openMatch} t={t} />}
        {view === "bracket" && <BracketView data={data} lb={lb} t={t} lang={lang} name={profileName} setName={selectProfile} go={go} />}
        {view === "predictions" && <Predictions data={data} lb={lb} t={t} go={go} />}
        {view === "points" && <Points data={data} lb={lb} t={t} name={profileName} setName={selectProfile} />}
        {view === "consensus" && <Consensus data={data} t={t} />}
        {view === "trends" && <Trends data={data} lb={lb} t={t} />}
        {view === "scorers" && <Scorers data={data} t={t} />}
        {view === "profile" && <Profile data={data} lb={lb} name={profileName} setName={selectProfile} t={t} />}
        {view === "help" && <Help t={t} data={data} />}
        {/* admin */}
        {view === "adminlogin" && <AdminLogin onAuth={() => { setIsAdmin(true); trackEvent("admin_login_success", {}); go("results"); }} t={t} />}
        {view === "results" && (isAdmin ? <Results data={data} setData={setData} t={t} lang={lang} /> : <AdminLogin onAuth={() => { setIsAdmin(true); trackEvent("admin_login_success", {}); go("results"); }} t={t} />)}
        {view === "champions" && isAdmin && <AdminChampions data={data} setData={setData} t={t} />}
        {view === "knockout" && isAdmin && <AdminKnockout data={data} setData={setData} t={t} />}
        {view === "players" && isAdmin && <AdminPlayers data={data} setData={setData} t={t} />}
        {view === "settings" && isAdmin && <AdminSettings data={data} setData={setData} t={t} />}
        {view === "backup" && isAdmin && <Backup data={data} setData={setData} t={t} />}
        {view === "export" && isAdmin && <Exports data={data} t={t} />}
        {view === "health" && isAdmin && <Health data={data} lb={lb} t={t} />}
        {view === "audit" && isAdmin && <AuditLog data={data} t={t} />}
        {view === "repair" && isAdmin && <Repair data={data} setData={setData} t={t} />}
        {view === "syncresults" && isAdmin && <SyncResults data={data} setData={setData} t={t} />}
        {view === "editpicks" && isAdmin && <AdminEditPicks data={data} setData={setData} t={t} name={profileName} setName={setProfileName} />}
        {view === "playerpicks" && isAdmin && <PlayerPicks data={data} lb={lb} t={t} name={profileName} setName={setProfileName} />}
        {view === "playerreport" && isAdmin && <PlayerReport data={data} lb={lb} t={t} />}
      </main>

      {sheet && (
        <div className="sheetbg" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div className="sheet">
            <div className="grab" />
            <div className="sheeth">{t("nav_more")}<button className="sheetx" onClick={() => setSheet(false)} aria-label={t("hide")}>✕</button></div>
            <div className="sheetgrid">
              {MORE_ITEMS.map((m) => (
                <button key={m.id} className={"tile" + (view === m.id ? " on" : "") + (m.id === "mypicks" ? " mine" : "")}
                  onClick={() => (m.id === "mypicks" && !(player && data.players[player])) ? (setSheet(false), setCodeOpen(true)) : go(m.id)}>
                  <span className="tilei"><Ico name={m.ic} size={22} /></span><span className="tilel">{t(m.key)}</span>
                </button>
              ))}
            </div>
            <div className="sheeth admin">{t("admin")} {isAdmin && <button className="logoutbtn" onClick={() => { setIsAdmin(false); trackEvent("admin_logout", {}); go("home"); }}><Ico name="logout" size={15} /> {t("logout")}</button>}</div>
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

      {codeOpen && (
        <div className="sheetbg modal" onClick={(e) => { if (e.target === e.currentTarget) setCodeOpen(false); }}>
          <div className="codecard">
            <button className="sheetx codex" onClick={() => setCodeOpen(false)} aria-label={t("hide")}>✕</button>
            <div className="code-ico">🔑</div>
            <h3 className="cardh">{t("codeTitle")}</h3>
            <p className="hint block">{t("codeHint")}</p>
            <input className="select codeinp" autoFocus value={codeVal} placeholder={t("codePh")} inputMode="numeric" maxLength={4}
              onChange={(e) => { setCodeVal(e.target.value.replace(/\D/g, "").slice(0, 4)); setCodeErr(false); }} onKeyDown={(e) => e.key === "Enter" && submitCode()} />
            {codeErr && <div className="al-err">{t("codeBad")}</div>}
            <button className="btn" onClick={submitCode} disabled={codeBusy}>{codeBusy ? t("syncing") : t("codeGo")}</button>
          </div>
        </div>
      )}

      <LiveDock data={data} t={t} onOpen={openMatch} />

      <nav className="bottom">
        {NAV.map((n) => {
          const adminViews = ADMIN_ITEMS.map((a) => a.id).concat("adminlogin");
          const active = view === n.id || (n.id === "today" && view === "match") || (n.id === "more" && (sheet || view === "groupgames" || MORE_ITEMS.some((m) => m.id === view) || adminViews.includes(view)));
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
max-width:520px;margin:0 auto;position:relative;padding-bottom:calc(78px + env(safe-area-inset-bottom,0px));-webkit-font-smoothing:antialiased;}
.app[data-theme="dark"]{--paper:#0b1713;--card:#11211b;--ink:#eaf3ee;--muted:#8aa399;--soft:#16271f;--border:#22382e;}
.app *{box-sizing:border-box}
.num{font-family:var(--num);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.muted{color:var(--muted)}.hint{color:var(--muted);font-size:11.5px;font-weight:500}
.hint.block{display:block;margin-top:4px}.grow{flex:1}.pos{color:var(--pos)}.neg{color:var(--neg)}

.top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:8px;
padding:calc(12px + env(safe-area-inset-top,0px)) calc(14px + env(safe-area-inset-right,0px)) 12px calc(14px + env(safe-area-inset-left,0px));
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
.pod{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;animation:podIn .5s ease both;border-radius:12px;padding:4px 2px}
.pod.sel{background:rgba(245,196,81,.14);box-shadow:0 0 0 1px var(--gold)}
.selhead{display:flex;align-items:center;gap:10px}
.selhead-tx{display:flex;flex-direction:column;min-width:0}.selhead-tx b{font-size:15px;font-weight:800}
.selhead .seeall{margin-inline-start:auto}
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
.gtitle-btn{display:flex;align-items:center;width:100%;background:none;border:none;padding:0 0 8px;margin:0;cursor:pointer;font-family:inherit}
.gtitle-view{margin-inline-start:auto;font-size:11px;font-weight:800;color:var(--grass-d);background:#eafaf2;border:1px solid #c7eeda;border-radius:99px;padding:4px 10px}
.app[data-theme="dark"] .gtitle-view{background:rgba(25,195,125,.14);border-color:rgba(25,195,125,.3);color:var(--grass)}
.teamsel{font-size:14px;font-weight:700;border-color:var(--grass);background:#f3fbf7}
.app[data-theme="dark"] .teamsel{background:rgba(25,195,125,.08)}
.teammeta{margin-top:9px;font-size:14px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.teammeta .fl{font-size:18px}
.gbadge{display:inline-block;font-size:11px;font-weight:800;color:#fff;background:var(--pitch2);padding:3px 10px;border-radius:99px}
.glegend{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:0 0 4px}
.glegend-h{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-inline-end:2px}
.glegend-i{font-size:11.5px;color:var(--muted)}.glegend-i b{color:var(--ink);font-weight:800;margin-inline-end:3px}
.gtable{display:flex;flex-direction:column}
.gtr{display:grid;grid-template-columns:16px minmax(0,1fr) 17px 17px 17px 17px 19px 19px 24px 22px;align-items:center;gap:1px;padding:5px 0;border-top:1px solid var(--border)}
.gtr .num{text-align:center;font-size:11px;font-variant-numeric:tabular-nums}
.gthead{border-top:none;color:var(--muted);font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;text-align:center}
.gthead span{text-align:center}
.gc-pos2{text-align:center;color:var(--muted);font-size:12px;font-weight:700}
.gc-team2{min-width:0;text-align:start;padding-inline-start:2px}
.gc-ptsh,.gc-pts2{text-align:center}.gc-pts2{font-weight:800;font-size:13px}
.gtr.qual{position:relative}.gtr.qual .gc-team2 .tn{font-weight:800}
.gtr.qual::before{content:"";position:absolute;inset-inline-start:-6px;top:5px;bottom:5px;width:3px;border-radius:2px;background:var(--grass)}

/* bracket */
.brk-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 2px 12px;margin:0 -12px;padding-inline:12px}
.brk{display:flex;gap:14px;min-width:max-content;align-items:flex-start}
.brk-col{display:flex;flex-direction:column;padding-top:22px;position:relative}
.brk-rlabel{position:absolute;top:0;inset-inline-start:0;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.brk-tie{position:relative;display:flex;flex-direction:column;gap:3px;width:140px}
.brk-when{font-size:9.5px;font-weight:700;color:var(--muted);padding-inline-start:3px;white-space:nowrap}
.brk-box{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(10,31,23,.05)}
.brk-tie.decided .brk-box{border-color:var(--grass-d)}
@keyframes tieIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
.brk-slot{display:flex;align-items:center;gap:4px;padding:7px 8px;border-bottom:1px solid var(--border)}
.brk-slot:last-child{border-bottom:none}
.brk-slot .tn{font-size:11.5px}.brk-slot.win{background:rgba(25,195,125,.12)}.brk-slot.win .tn{font-weight:800}
.brk-slot.lose{opacity:.5}
.brk-tick{margin-inline-start:auto;color:var(--grass-d);font-weight:800;font-size:11px}
.brk-conn{position:absolute;inset-inline-end:-14px;top:60%;width:14px;height:2px;background:var(--border)}
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
padding-bottom:calc(6px + env(safe-area-inset-bottom,0px));
box-shadow:0 -2px 14px rgba(10,31,23,.07)}
.navbtn{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;border:none;background:none;
color:var(--muted);font-family:inherit;cursor:pointer;padding:5px 0;border-radius:10px;transition:color .2s}
.navbtn .navi{font-size:18px;line-height:1}.navbtn .navl{font-size:10px;font-weight:700}
.navbtn.on{color:var(--grass-d)}.app[data-theme="dark"] .navbtn.on{color:var(--grass)}
.navbtn.on .navi{transform:translateY(-1px)}

/* live ticker dock — global, sits just above the bottom nav while a match is live */
.livedock{position:fixed;left:0;right:0;bottom:calc(58px + env(safe-area-inset-bottom,0px));max-width:520px;margin:0 auto;z-index:29;pointer-events:none}
.livedock>*{pointer-events:auto}
.app:has(.live-strip) .main{padding-bottom:50px}
.live-strip{display:flex;align-items:center;gap:10px;width:100%;background:linear-gradient(90deg,#0a1f17,#123026);color:#fff;padding:9px 12px;border:none;cursor:pointer;box-shadow:0 -8px 24px rgba(7,21,16,.18);font-family:inherit}
.live-strip .ld,.live-feed-h .ld{width:8px;height:8px;border-radius:50%;background:#ff5b4d;flex:0 0 auto;animation:livepulse 1.3s infinite}
@keyframes livepulse{0%{box-shadow:0 0 0 0 rgba(255,91,77,.55)}70%{box-shadow:0 0 0 8px rgba(255,91,77,0)}100%{box-shadow:0 0 0 0 rgba(255,91,77,0)}}
.live-lbl{font-size:11px;font-weight:900;letter-spacing:.04em;flex:0 0 auto;font-variant-numeric:tabular-nums}
.live-marquee{flex:1;overflow:hidden;white-space:nowrap;-webkit-mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent);mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent)}
.live-marquee>span{display:inline-block;padding-left:100%;animation:livescroll 20s linear infinite;font-size:13px;font-weight:600}
@keyframes livescroll{from{transform:translateX(0)}to{transform:translateX(-100%)}}
.live-chev{flex:0 0 auto;opacity:.85;font-weight:900;transition:transform .15s}
.livedock.open .live-chev{transform:rotate(180deg)}
.live-feed{background:var(--card);border:1px solid var(--border);border-bottom:none;border-radius:14px 14px 0 0;padding:10px 12px;max-height:46vh;overflow:auto;box-shadow:0 -10px 30px rgba(7,21,16,.18)}
.live-feed-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.live-feed-h .lft{font-size:12px;font-weight:900;display:inline-flex;align-items:center;gap:7px}
.lfx{font-size:12px;color:var(--muted);font-weight:800;background:none;border:none;cursor:pointer;font-family:inherit}
.live-grp{font-size:11px;font-weight:900;color:var(--muted);margin:10px 0 2px}
.live-ev{display:flex;gap:10px;align-items:flex-start;padding:6px 0;border-top:1px solid var(--border)}
.live-ev:first-child{border-top:none}
.lmin{font-size:11px;font-weight:900;color:var(--muted);min-width:34px;font-variant-numeric:tabular-nums;flex:0 0 auto}
.ltxt{font-size:13px;font-weight:600}.ltxt.goal{color:var(--grass-d);font-weight:900}
.live-open{margin-top:10px;width:100%;height:38px;border:none;border-radius:10px;background:var(--grass);color:#04150d;font-weight:900;cursor:pointer;font-family:inherit}
@media(prefers-reduced-motion:reduce){.live-strip .ld,.live-feed-h .ld{animation:none}.live-marquee>span{animation:none;padding-left:0}}

/* more sheet */
.sheetbg{position:fixed;inset:0;z-index:40;background:rgba(8,18,14,.5);display:flex;align-items:flex-end;justify-content:center;animation:fade .2s ease}
.sheetbg.modal{align-items:center;padding:16px}
.codecard{position:relative;width:100%;max-width:380px;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:22px 18px 18px;text-align:center;box-shadow:0 12px 48px rgba(10,31,23,.3);animation:slideup .26s cubic-bezier(.2,.8,.2,1)}
.codex{position:absolute;top:10px;inset-inline-end:10px}
.code-ico{font-size:30px;margin-bottom:6px}
.codeinp{text-align:center;font-size:18px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;font-family:ui-monospace,monospace;margin:10px 0}
.codecard .btn{width:100%}
@keyframes fade{from{opacity:0}to{opacity:1}}
.sheet{width:100%;max-width:520px;background:var(--card);border-radius:20px 20px 0 0;padding:8px 14px calc(20px + env(safe-area-inset-bottom));
border:1px solid var(--border);box-shadow:0 -10px 40px rgba(10,31,23,.25);animation:slideup .28s cubic-bezier(.2,.8,.2,1)}
@keyframes slideup{from{transform:translateY(100%)}to{transform:none}}
.grab{width:38px;height:4px;border-radius:99px;background:var(--border);margin:6px auto 12px}
.sheeth{font-weight:800;font-size:14px;margin:0 4px 12px;display:flex;align-items:center}
.sheetx{margin-inline-start:auto;width:30px;height:30px;border-radius:50%;border:1px solid var(--border);background:var(--soft,#f3f6f4);color:var(--muted);font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.app[data-theme="dark"] .sheetx{background:rgba(255,255,255,.06)}
.sheetgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.tile{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 6px;border-radius:14px;border:1px solid var(--border);
background:var(--soft);color:var(--ink);cursor:pointer;font-family:inherit}
.tile:active{transform:scale(.96)}.tile.on{border-color:var(--grass);background:rgba(25,195,125,.1)}
.tile.mine{border-color:var(--gold-d);background:rgba(245,196,81,.14)}.tile.mine.on{border-color:var(--gold-d)}
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
/* knockout head-to-head */
.h2h-round{margin-top:10px}
.h2h-rlabel{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:6px 0 4px}
.h2h{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)}
.h2h:last-child{border-bottom:none}
.h2h-side{display:flex;align-items:center;gap:6px;flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--ink)}
.h2h-side.end{justify-content:flex-end}
.h2h-side .fl{font-size:16px;flex:none}
.h2h-tn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.h2h-side b{color:var(--ink);flex:none}
.h2h .mpbar{flex:0 0 72px;height:7px}

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

/* side-by-side prediction vs actual */
.gc-card{padding:10px 12px}
.gc-head{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;cursor:pointer;padding:2px 0 8px}
.gc-total{font-size:15px;font-weight:800;color:var(--gold-d)}
.gc-proj-total{color:var(--muted);font-size:12px;font-weight:700;font-style:italic}
.gc-colh{display:grid;grid-template-columns:1fr 44px 1fr;gap:6px;font-size:9.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;padding-bottom:4px;border-bottom:1px solid var(--border)}
.gc-colh>span:last-child{text-align:end}.gc-colh-mid{text-align:center}
.gc-colh-name{color:var(--grass-d);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.gc-row{display:grid;grid-template-columns:1fr 44px 1fr;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)}
.gc-row:last-of-type{border:none}
.gc-side{display:flex;align-items:center;gap:6px;min-width:0}
.gc-side.act{justify-content:flex-end}
.gc-pos{width:15px;text-align:center;color:var(--muted);font-size:11px;font-weight:700;flex:none}
.gc-side .team .tn{font-size:12px}
.gc-pt{justify-self:center;font-size:12px;font-weight:800;min-width:34px;height:22px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--muted);background:var(--soft)}
.gc-pt.exact{color:#fff;background:var(--pos)}
.gc-pt.in{color:#7a5a00;background:rgba(245,196,81,.45)}
.gc-pt.proj{color:var(--muted);background:transparent;border:1px dashed var(--border);font-style:italic;font-weight:700}
.gc-projhint{font-size:10.5px;margin:2px 0 6px;opacity:.8}
.gc-row.exact .gc-side.pick{font-weight:800}
.gc-edge{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;font-weight:700}
.gc-edge-pt{color:var(--grass-d)}.app[data-theme="dark"] .gc-edge-pt{color:var(--grass)}

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
.exp-btns{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.exp-btns .btn{flex:1;min-width:130px;margin-top:0}
.champrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--soft)}.champrow:first-child{border-top:none}
.champname{flex:1;min-width:0;font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.champsel{width:auto;min-width:140px;max-width:180px;margin:0;padding:8px 10px;font-size:13px}
.plrow{padding:10px 0;border-top:1px solid var(--soft)}.plrow:first-child{border-top:none}
.plrow-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.plpick{font-size:12px;font-weight:700;color:var(--gold-d)}
.plcode{margin-inline-start:auto;font-size:12px;font-weight:800;letter-spacing:.06em;font-family:ui-monospace,monospace;color:var(--ink);background:var(--soft);padding:2px 7px;border-radius:6px}.plcode+.plpick{margin-inline-start:0}
.plrow-ctl{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.plphone{flex:1;min-width:130px;margin:0;padding:9px 10px;font-size:13px}
.wabtn{flex:none;width:auto;margin:0;padding:9px 14px;background:#25d366;color:#06311b}
.plrow-ctl .btn.ghost{flex:none;width:auto;margin:0;padding:9px 12px}
.mypick{border:2px solid var(--grass);background:linear-gradient(180deg,#f3fbf7,var(--card))}
.app[data-theme="dark"] .mypick{background:rgba(25,195,125,.08)}
.mypick-head{display:flex;align-items:center;gap:8px}
.mypick-body{display:flex;align-items:center;gap:10px;margin-top:10px}.mypick-lbl{font-weight:800;font-size:14px}
.mypick-locked{font-weight:700;display:flex;align-items:center;gap:6px;color:var(--muted)}
.pickprog{margin-top:10px}
.pickprog-row{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:4px}
.pickprog-bar{height:6px;border-radius:4px;background:var(--soft);overflow:hidden}
.pickprog-bar>span{display:block;height:100%;background:var(--grass);border-radius:4px;transition:width .3s ease}
.mypick-fill{width:100%;margin-top:10px;background:var(--gold);color:#241c00;border-color:var(--gold-d);font-weight:800}
.mypick-groups{margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)}
.mypick-groups.off{opacity:.92}
.mypick-lbl.collapse{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;color:var(--ink)}
.coll-lock{font-weight:700;color:var(--muted);font-size:12px}
.coll-chev{font-size:12px;color:var(--muted)}
.gpred{margin-top:8px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--card)}
.gpred-h{font-weight:800;font-size:11px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.gpline{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.gpline .ppos{flex:none;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border-radius:5px;background:var(--soft);font-size:11px;font-weight:800}
.gpsel{flex:1;margin:0;padding:7px 9px;font-size:13px}
.mypick-ko{margin-top:14px;padding-top:12px;border-top:1px dashed var(--border)}
.koround{margin-top:10px}.koround-h{font-weight:800;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.kotie{display:flex;flex-direction:column;gap:5px;margin-bottom:9px;padding-bottom:9px;border-bottom:1px dashed var(--border)}
.kotie:last-child{border-bottom:none}
.kotie-match{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;flex-wrap:wrap}
.kovs{font-size:10.5px;color:var(--muted);font-weight:700}
.kosel{margin:0;padding:7px 9px;font-size:13px}
.kopick{flex:1;min-width:0;display:flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid var(--border);border-radius:9px;background:var(--card);color:var(--ink);font-family:inherit;font-weight:700;font-size:12.5px;cursor:pointer}
.kopick.on{background:var(--pitch);color:#fff;border-color:var(--pitch)}
.kopick.lk{opacity:.55;cursor:not-allowed}.kopick.on.lk{opacity:1}
.kotie-lk{font-size:12px}.kotie.tba{opacity:.6}.kotie-tba{font-size:12px;color:var(--muted);font-style:italic}
.koround.preview{opacity:.85}.kotie.ro{gap:6px}.kopick.ro{cursor:default;background:var(--soft);border-style:dashed}
.kochip{background:var(--gold);color:#241c00;font-weight:800;font-size:11px;padding:1px 7px;border-radius:999px;margin-left:4px}
/* player predicted bracket (template layout) */
.pbrk-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 0 8px}
/* width:max-content keeps the bracket at its natural size (never stretches to
   fill a wide card, which would spread the columns and clip a half); margin auto
   centres it when it fits and it scrolls horizontally when it doesn't. */
.pbrk{display:flex;align-items:stretch;gap:6px;width:max-content;margin:0 auto}
.pb-col{display:flex;flex-direction:column;justify-content:space-around;gap:5px}
.pb-col.pb-center{justify-content:center;align-items:center;gap:7px;min-width:92px}
.pb-trophy{font-size:30px;line-height:1}
.pb-flabel{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.pb-m{display:flex;flex-direction:column;gap:2px;border:1px solid var(--border);border-radius:7px;overflow:hidden;background:var(--card)}
.pb-s{display:flex;align-items:center;gap:4px;padding:3px 7px;font-size:11px;font-weight:800;white-space:nowrap;min-width:58px}
.pb-s.sel{background:var(--soft)}
.pb-s.ok{background:#e6f4ea;color:#137a3b}
.pb-s.bad{background:#fdecea;color:#b71c1c}
.pb-s.out{color:var(--muted);text-decoration:line-through;font-weight:600}
.pb-s.tba{color:var(--muted);font-style:italic;justify-content:center}
.pb-fl{font-size:12px}
.pb-champ-pill{display:inline-flex;align-items:center;gap:5px;border:2px solid var(--gold-d);border-radius:9px;padding:4px 10px;font-weight:800;font-size:12px;background:var(--gold)}
.pb-champ-pill.ok{border-color:#137a3b;background:#e6f4ea;color:#137a3b}
.pb-champ-pill.bad{border-color:#b71c1c;background:#fdecea;color:#b71c1c}
.pb-champ-pill.tba{background:none;color:var(--muted)}
/* connector stubs between rounds (left half advances right, right half left) */
.pbrk{gap:16px}.pb-m{position:relative}
.pbrk .pb-col:nth-child(1) .pb-m::after,.pbrk .pb-col:nth-child(2) .pb-m::after,.pbrk .pb-col:nth-child(3) .pb-m::after,.pbrk .pb-col:nth-child(4) .pb-m::after{content:"";position:absolute;left:100%;top:50%;width:8px;height:1px;background:var(--border)}
.pbrk .pb-col:nth-child(2) .pb-m::before,.pbrk .pb-col:nth-child(3) .pb-m::before,.pbrk .pb-col:nth-child(4) .pb-m::before{content:"";position:absolute;right:100%;top:50%;width:8px;height:1px;background:var(--border)}
.pbrk .pb-col:nth-child(6) .pb-m::after,.pbrk .pb-col:nth-child(7) .pb-m::after,.pbrk .pb-col:nth-child(8) .pb-m::after,.pbrk .pb-col:nth-child(9) .pb-m::after{content:"";position:absolute;right:100%;top:50%;width:8px;height:1px;background:var(--border)}
.pbrk .pb-col:nth-child(6) .pb-m::before,.pbrk .pb-col:nth-child(7) .pb-m::before,.pbrk .pb-col:nth-child(8) .pb-m::before{content:"";position:absolute;left:100%;top:50%;width:8px;height:1px;background:var(--border)}
.brk-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 2px}
.brk-head .hint{flex:1;min-width:0}
.brk-head .seeall{flex:none;white-space:nowrap}
.brk-pts{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 2px}
.brk-pt{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;background:var(--soft);color:var(--ink)}
.brk-pt.ko{background:#e6f4ea;color:#137a3b}.brk-pt.tot{background:var(--pitch);color:#fff}
.brk-pt.alive{background:rgba(245,196,81,.18);color:var(--gold-d)}
.app[data-theme="dark"] .brk-pt.alive{background:rgba(245,196,81,.16)}
/* prediction tab: one compact row of stats + view toggle */
.brk-pcard{padding-top:12px}
.brk-statbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.brk-statline{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brk-statline b{color:var(--ink);font-weight:800}.brk-statline b.ko{color:#137a3b}.brk-statline b.alv{color:var(--gold-d)}
/* slim header */
.brk-bar{margin:2px 0 12px}
.brk-bar-row{display:flex;align-items:baseline;gap:8px}
.brk-bar-title{font-size:18px;font-weight:800;color:var(--ink)}
.brk-bar-sub{margin-inline-start:auto;font-size:12px;font-weight:700;color:var(--muted)}
.brk-thinbar{height:5px;border-radius:99px;background:var(--border);overflow:hidden;margin-top:7px}
.brk-thinbar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold-d),var(--gold));transition:width 1s cubic-bezier(.2,.8,.2,1)}
/* compact player row in the prediction tab */
.brk-prow{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.brk-sel{flex:1;min-width:0}
.brk-icon{flex:none;width:36px;height:36px;border:1px solid var(--border);background:var(--card);border-radius:10px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.brk-prof{flex:none;white-space:nowrap}
.brk-tabs{display:flex;gap:5px;margin-bottom:12px;background:var(--soft);border:1px solid var(--border);border-radius:13px;padding:4px}
.brk-tab{flex:1;padding:10px 8px;border:none;background:none;border-radius:9px;font-family:inherit;font-weight:800;font-size:13.5px;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
.brk-tab.on{background:var(--card);color:var(--ink);box-shadow:0 1px 4px rgba(7,21,16,.12)}
/* diagram / list look toggle */
.brk-look{display:inline-flex;gap:3px;background:var(--soft);border:1px solid var(--border);border-radius:10px;padding:3px;flex:none}
.card>.brk-look{margin-bottom:10px}
.brk-lk{padding:5px 11px;border:none;background:none;border-radius:8px;font-family:inherit;font-weight:800;font-size:12px;color:var(--muted);cursor:pointer}
.brk-lk.on{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(7,21,16,.1)}
/* interactive two-sided bracket diagram */
.bdg{margin-top:2px}
.bdg-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.bdg-hint{flex:1;min-width:0;font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:6px}
.bdg-dot{width:9px;height:9px;border-radius:50%;background:#e6a31e;flex:none;box-shadow:0 0 0 3px rgba(230,163,30,.2)}
.bdg-btns{display:flex;gap:5px;flex:none}
.bdg-b{width:32px;height:32px;border:1px solid var(--border);background:var(--card);border-radius:9px;font-size:15px;font-weight:800;color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.bdg-vp{position:relative;overflow:hidden;height:62vh;max-height:560px;min-height:380px;border:1px solid #14342600;border-radius:16px;background:linear-gradient(180deg,#0d2a1e,#081912);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);touch-action:none;-webkit-user-select:none;user-select:none;cursor:grab;animation:bdgIn .34s cubic-bezier(.22,.61,.36,1)}
@keyframes bdgIn{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}
.bdg-vp:active{cursor:grabbing}
.bdg-stage{transform-origin:0 0;will-change:transform}
.bdg-canvas{display:block;width:100%;height:auto}
/* portrait: rotate the wide bracket 90° so it's big; prompt to turn the phone */
.bdg-rotate{font-weight:700;color:var(--ink)}
.bdg-rotwrap{display:flex;align-items:center;justify-content:center;overflow:hidden;height:74vh;max-height:680px;border:1px solid var(--border);border-radius:14px;background:#f7f8fa;animation:bdgIn .34s cubic-bezier(.22,.61,.36,1)}
.bdg-rotcanvas{flex:none;width:min(74vh,660px);height:auto;transform:rotate(90deg)}
/* DOM two-sided bracket (rotated in portrait) */
.domb{margin-top:2px}
.domb-vp{position:relative;overflow:auto;height:64vh;max-height:580px;min-height:320px;border-radius:16px;background:radial-gradient(120% 80% at 50% 42%,rgba(245,196,81,.10),transparent 60%),linear-gradient(180deg,#0d2a1e,#081912);-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;animation:bdgIn .34s cubic-bezier(.22,.61,.36,1)}
.domb-stage{position:relative}
.domb-rot{position:absolute;top:0;left:0}
.domb-svg{position:absolute;top:0;left:0;overflow:visible}
.domb-conn{fill:none;stroke:rgba(255,255,255,.2);stroke-width:1.6}
.domb-gold{fill:none;stroke:#ffd84d;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 5px rgba(255,216,77,.9));stroke-dasharray:1;animation:dombDraw .6s ease forwards}
@keyframes dombDraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.domb-box{position:absolute;width:160px;height:58px;background:#fff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.34);display:flex;flex-direction:column;overflow:hidden;transition:opacity .25s,box-shadow .25s}
.domb-box.fin{box-shadow:0 6px 18px rgba(0,0,0,.4)}
.domb-box.on{box-shadow:0 0 0 2.5px #e6a31e,0 6px 20px rgba(230,163,30,.45)}
.domb.tracing .domb-box:not(.on){opacity:.34}
.domb-row{flex:1;display:flex;align-items:center;gap:7px;padding:0 9px;font-size:15px;font-weight:700;color:#16324f;min-width:0;cursor:pointer}
.domb-row+.domb-row{border-top:1px solid #eef2f6}
.domb-row.out{color:#9aa6b2}.domb-row.out .domb-nm{text-decoration:line-through}
.domb-row.win.correct,.domb-row.win.won{background:#e6f4ea;color:#137a3b}
.domb-row.win.wrong{background:#fdecea;color:#b71c1c}
.domb-row.win.pick{background:#eef1f4}
.domb-fl{font-size:18px;flex:none;width:22px;text-align:center}.domb-tbd{opacity:.5}
.domb-nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.domb-mk{font-weight:900;flex:none}.domb-mk.ok{color:#137a3b}.domb-mk.no{color:#b71c1c}
.domb-trophy{position:absolute;transform:translateX(-50%);font-size:34px;filter:drop-shadow(0 0 16px rgba(245,196,81,.85))}
.domb-champ{position:absolute;width:168px;height:40px;display:flex;align-items:center;gap:7px;padding:0 11px;border-radius:11px;background:linear-gradient(180deg,#ffd970,#f0b429);box-shadow:0 6px 18px rgba(202,160,51,.5);font-weight:800;color:#3a2c00;font-size:15px}
.domb-champ.correct{background:linear-gradient(180deg,#9ff0bf,#1fc379);color:#0c3d22}
.domb-champ.wrong{background:linear-gradient(180deg,#f7a6a6,#e2574c);color:#5a0d0d}
.domb-champ-cap{flex:none}.domb-champ-nm{display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* canvas bracket: scales to the card width so the whole diagram is always visible */
.brkimg-wrap{margin-top:8px;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:#f7f8fa}
.brkimg{display:block;width:100%;height:auto}
/* Google-style knockout view: round tabs + cards + bracket connectors */
.gko-tabs{display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:2px 0 10px;margin:4px 0 2px}
.gko-tab{flex:0 0 auto;border:1px solid var(--border);background:var(--card);color:var(--muted);font-family:inherit;font-weight:800;font-size:12.5px;padding:7px 12px;border-radius:999px;cursor:pointer}
.gko-tab.on{background:var(--pitch);color:#fff;border-color:var(--pitch)}
.gko-scroll{overflow:hidden;padding-bottom:8px;touch-action:pan-y;cursor:grab;user-select:none;-webkit-user-select:none}
.gko-scroll:active{cursor:grabbing}
.gko-stage{will-change:transform,opacity}
.gko-stage.fromR{animation:gkoSlideR .28s cubic-bezier(.22,.61,.36,1)}
.gko-stage.fromL{animation:gkoSlideL .28s cubic-bezier(.22,.61,.36,1)}
@keyframes gkoSlideR{from{opacity:.2;transform:translateX(34px)}to{opacity:1;transform:none}}
@keyframes gkoSlideL{from{opacity:.2;transform:translateX(-34px)}to{opacity:1;transform:none}}
.gko-hint{font-size:11.5px;color:var(--muted);margin:0 0 10px;display:flex;align-items:center;gap:5px}
.gko-hint b{color:var(--ink);font-weight:800}
.gko-swipe{margin-inline-start:auto;opacity:.75}
/* per-round match list */
.gko-list{display:flex;flex-direction:column;gap:9px}
.gko-list .gko-card{min-width:0;width:100%;padding:9px 13px}
.gko-list .gko-card .gko-row{padding:4px 0;font-size:14.5px}
.gko-list .gko-fl{font-size:18px;width:22px}
/* champion headline banner */
.gko-champ{display:flex;align-items:center;gap:9px;padding:8px 13px;border-radius:12px;margin-bottom:11px;color:#fff;background:linear-gradient(135deg,#0e2a47,#13854f);box-shadow:0 4px 12px rgba(7,21,16,.2)}
.gko-champ.correct{background:linear-gradient(135deg,#0f7a3b,#1fc379)}
.gko-champ.wrong{background:linear-gradient(135deg,#6e1320,#c2143b)}
.gko-champ.pick{background:linear-gradient(135deg,#0e2a47,#3a2f6b)}
.gko-champ-cap{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;opacity:.85;flex:none}
.gko-champ-team{margin-inline-start:auto;display:flex;align-items:center;gap:7px;font-size:16px;font-weight:900;text-align:end}
.gko-champ-team.dim{opacity:.7;font-weight:700;font-size:14px}
.gko-champ-fl{font-size:19px}.gko-champ-mk{font-size:14px}
.gko-pairs{display:flex;flex-direction:column;gap:18px;min-width:max-content}
.gko-pair{display:flex;align-items:center}
.gko-children{display:flex;flex-direction:column;gap:14px}
.gko-card{min-width:156px;border:1px solid var(--border);border-radius:12px;background:var(--card);padding:7px 9px;position:relative}
.gko-when{font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:5px;display:flex;align-items:center;gap:6px}
.gko-badge{font-size:9px;font-weight:800;background:var(--soft);color:var(--muted);padding:1px 5px;border-radius:5px}
.gko-badge.live{background:#fdecea;color:#b71c1c}
.gko-row{display:flex;align-items:center;gap:7px;padding:3px 0;font-size:13.5px;font-weight:600;color:var(--ink)}
.gko-row.win{font-weight:800}
.gko-fl{font-size:16px;width:20px;text-align:center;flex:none}.gko-tbd{opacity:.5}
.gko-tn{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gko-tn.dim{color:var(--muted)}
.gko-sc{font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink)}
.gko-adv{color:var(--grass-d);font-size:11px;margin-inline-start:2px}
/* connector: vertical line linking the two children, horizontal stub to parent */
.gko-conn{width:22px;align-self:stretch;position:relative;flex:none}
.gko-conn::before{content:"";position:absolute;left:11px;top:22%;bottom:22%;border-left:2px solid var(--border)}
.gko-conn::after{content:"";position:absolute;left:11px;right:0;top:50%;border-top:2px solid var(--border)}
.gko-children .gko-card::after{content:"";position:absolute;left:100%;top:50%;width:11px;border-top:2px solid var(--border)}
.gko-finalwrap{display:flex;flex-direction:column;align-items:center;gap:14px;padding:8px 0}
/* picked / winning row colouring */
.gko-row{cursor:pointer;border-radius:8px;transition:background .15s,opacity .15s}
.gko-row.pick{padding-inline:6px;margin-inline:-6px}
.gko-row.pick.correct,.gko-row.pick.won{background:#e6f4ea;color:#137a3b}
.gko-row.pick.wrong{background:#fdecea;color:#b71c1c}
.gko-row.pick.pick{background:var(--soft)}
.app[data-theme="dark"] .gko-row.pick.correct,.app[data-theme="dark"] .gko-row.pick.won{background:rgba(25,195,125,.18)}
.app[data-theme="dark"] .gko-row.pick.wrong{background:rgba(183,28,28,.22)}
.gko-adv{font-weight:900}.gko-adv.correct{color:#137a3b}.gko-adv.wrong{color:#b71c1c}.gko-adv.pick{color:var(--grass-d)}
/* trace a team: dim everything except cards/rows featuring the team */
.gko.tracing .gko-row{opacity:.32}
.gko.tracing .gko-row.hl{opacity:1;outline:2px solid var(--grass);outline-offset:-2px;background:rgba(25,195,125,.12)}
/* champion hero */
.gko-hero{text-align:center;padding:16px 22px;border-radius:18px;color:#fff;background:linear-gradient(135deg,#0e2a47,#13854f);box-shadow:0 10px 28px rgba(7,21,16,.28);min-width:200px}
.gko-hero.correct{background:linear-gradient(135deg,#0f7a3b,#1fc379)}
.gko-hero.wrong{background:linear-gradient(135deg,#6e1320,#c2143b)}
.gko-hero.pick{background:linear-gradient(135deg,#0e2a47,#3a2f6b)}
.gko-hero-cap{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;opacity:.88}
.gko-hero-team{font-size:23px;font-weight:900;margin-top:5px;display:flex;align-items:center;justify-content:center;gap:9px}
.gko-hero-team.dim{opacity:.7;font-size:18px}.gko-hero-fl{font-size:27px}
.app[data-theme="dark"] .brk-pt.ko{background:rgba(25,195,125,.18)}
.r16cand{margin-top:10px}.kotie.r16 .r16cands{flex-direction:column;align-items:flex-start;gap:2px}
.r16num{font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted)}
.r16teams{font-size:12px;font-weight:600;color:var(--ink);line-height:1.35}

/* overview / dashboard (preview) */
.ov-beta{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 13px;border-radius:13px;background:linear-gradient(120deg,rgba(245,196,81,.16),rgba(25,195,125,.12));border:1px solid rgba(245,196,81,.4)}
.ov-beta-tag{flex:none;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--gold-d);background:var(--card);border:1px solid rgba(245,196,81,.5);border-radius:99px;padding:3px 9px}
.ov-beta-tx{font-size:12px;color:var(--muted);line-height:1.35}
.ov-hero{padding:16px}
.ov-hero-top{font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:6px;margin-bottom:14px}.ov-hero-top .ts-dot{width:8px;height:8px;border-radius:50%;background:var(--grass)}
.ov-hero-grid{display:flex;align-items:center;gap:18px}
.ov-ring{position:relative;flex:none}.ov-ring-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ov-ring-pct{font-size:30px;font-weight:900;color:var(--ink);line-height:1}.ov-ring-pct span{font-size:15px;margin-inline-start:1px}
.ov-ring-lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-top:3px}
.ov-hero-info{flex:1;min-width:0}
.ov-hero-kpi{display:flex;flex-direction:column;margin-bottom:12px}.ov-hero-kpi b{font-size:26px;font-weight:900;color:var(--ink);line-height:1}.ov-hero-kpi span{font-size:12px;color:var(--muted)}
.ov-bars{display:flex;flex-direction:column;gap:8px}
.ov-bar-row{display:flex;align-items:center;gap:8px}.ov-bar-lbl{font-size:11px;color:var(--muted);width:74px;flex:none}
.ov-bar{flex:1;height:8px;border-radius:99px;background:var(--border);overflow:hidden}.ov-bar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--grass-d),var(--grass));transition:width 1s cubic-bezier(.2,.8,.2,1)}.ov-bar span.ko{background:linear-gradient(90deg,var(--gold-d),var(--gold))}
.ov-bar-n{font-size:11px;font-weight:700;color:var(--muted);width:42px;text-align:end;flex:none}
.ov-leader{display:flex;align-items:center;gap:12px;width:100%;text-align:start;cursor:pointer;padding:14px}
.ov-leader-crown{font-size:22px;flex:none}
.ov-leader-tx{flex:1;min-width:0;display:flex;flex-direction:column}
.ov-leader-cap{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-d)}
.ov-leader-name{font-size:17px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ov-leader-sub{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ov-leader-pts{flex:none;display:flex;flex-direction:column;align-items:flex-end}.ov-leader-pts b{font-size:24px;font-weight:900;color:var(--gold-d);line-height:1}.ov-leader-pts span{font-size:10px;color:var(--muted)}
.ov-go{font-size:10.5px;font-weight:800;color:var(--grass-d);margin-top:4px}
.ov-back{margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--soft);border:1px solid var(--border)}
.ov-back-h{display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:7px}
.ov-back-bar{display:flex;align-items:center;gap:8px}
.ov-back-side{flex:none;font-size:11.5px;color:var(--ink);white-space:nowrap}.ov-back-side b{color:var(--grass-d)}.ov-back-side.end{text-align:end}
.ov-back-bar .mpbar{flex:1}
.ov-res{display:flex;flex-direction:column;gap:6px;width:100%;text-align:start;padding:9px 4px;background:none;border:none;border-bottom:1px solid var(--border);cursor:pointer}
.ov-res:last-child{border-bottom:none}
.ov-res-fix{display:flex;align-items:center;gap:8px}
.ov-res-side{display:flex;align-items:center;gap:6px;flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--ink)}
.ov-res-side.end{justify-content:flex-end}.ov-res-side .fl{font-size:17px;flex:none}
.ov-res-tn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ov-res-sc{flex:none;font-weight:900;font-size:15px;color:var(--ink);padding:1px 9px;background:var(--soft);border-radius:7px}
.ov-res-call{font-size:11.5px;color:var(--muted)}.ov-res-call b{color:var(--ink)}
.ov-call-pill{display:inline-block;font-weight:800;font-size:11px;color:var(--muted);background:var(--soft);border:1px solid var(--border);border-radius:99px;padding:1px 8px;margin-inline-end:3px}
.ov-call-pill.hot{color:var(--grass-d);background:rgba(25,195,125,.12);border-color:rgba(25,195,125,.35)}
.ov-call-draw{font-style:italic}
.ov-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ov-stat{background:var(--soft);border:1px solid var(--border);border-radius:12px;padding:11px 13px;display:flex;flex-direction:column;gap:3px}
.ov-stat-wide{grid-column:1 / -1}
.ov-stat-v{font-size:24px;font-weight:900;color:var(--ink);line-height:1}
.ov-stat-k{font-size:11px;color:var(--muted)}
.ov-stat-big{font-size:13px;font-weight:700;color:var(--ink)}.ov-stat-big.dim{font-weight:500;color:var(--muted)}.ov-stat-big b{color:var(--grass-d)}
.ov-rankrow{display:flex;align-items:center;gap:10px;width:100%;text-align:start;padding:7px 4px;background:none;border:none;border-bottom:1px solid var(--border);cursor:pointer}
.ov-rankrow:last-child{border-bottom:none}
.ov-rk{width:22px;flex:none;text-align:center;font-weight:800;color:var(--muted)}.ov-rk.gold{color:var(--gold-d)}
.ov-rk-name{flex:1;min-width:0;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ov-rk-pts{flex:none;font-weight:800;color:var(--grass-d)}
.ov-you{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:start;cursor:pointer;padding:13px 14px;background:linear-gradient(120deg,var(--card),rgba(25,195,125,.07))}
.ov-you.sub{justify-content:center}
.ov-you-tx{display:flex;flex-direction:column}.ov-you-tx b{font-size:15px;color:var(--ink)}
.ov-you-pts{font-size:13px;color:var(--muted);text-align:end}.ov-you-pts b{font-size:18px;color:var(--grass-d)}

/* admin: results editor */
.bucketstrip{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}
.bbtn{width:30px;height:30px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--ink);font-family:inherit;font-weight:800;font-size:12px;cursor:pointer}
.bbtn.on{background:var(--pitch);color:#fff;border-color:var(--pitch)}.bbtn.ko{width:auto;padding:0 10px}
.erows{display:flex;flex-direction:column;gap:8px}
.erow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.erow.invalid .scoreinp{border-color:var(--neg);outline-color:var(--neg)}
.ko-warn{flex-basis:100%;text-align:center;font-size:10.5px;font-weight:700;color:var(--neg)}
.kf-actions{display:flex;gap:8px;margin:8px 0}.kf-actions .btn{flex:1}
.hint.block.ok{color:var(--pos);font-weight:700}
.kf-round{font-weight:800;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:12px 0 6px}
.kf-row{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap}
.kf-team{flex:1;min-width:110px;margin:0;padding:7px 8px;font-size:12.5px}
.kf-v{font-size:11px;color:var(--muted);font-weight:700}
.kf-ko{flex-basis:100%;margin:0;padding:6px 8px;font-size:12px}
.ko-pens{flex-basis:100%;display:flex;flex-wrap:wrap;align-items:center;gap:6px;justify-content:center;margin-top:4px}
.ko-pens-lbl{font-size:10.5px;font-weight:700;color:var(--muted)}
.ko-penbtn{padding:4px 9px;border:1px solid var(--border);border-radius:7px;background:var(--card);color:var(--ink);font-family:inherit;font-weight:700;font-size:11px;cursor:pointer}
.ko-penbtn.on{background:var(--grass);color:#fff;border-color:var(--grass)}
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

/* ===== large screens: use the full width (tablet / desktop) ===== */
@media(min-width:900px){
  .app{max-width:1180px;padding-bottom:0}
  .top{max-width:1180px}
  .main{padding:16px 20px 96px}
  /* card-stack views flow into columns; match detail stays single, centered */
  .view:not(.md){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px;align-items:start}
  .view:not(.md)>.card,.view:not(.md)>.nextcard{margin:14px 0}
  /* full-width: heroes, strips, and any card with wide single content */
  .view>.topstrip,.view>.datestrip,.view>.podium,.view>.gwrap,.view>.selhead,
  .view>.nextcard,.view>.livecard,.brk-scroll,
  .view:not(.md)>.card:has(.lb),.view:not(.md)>.card:has(.ptboard),
  .view:not(.md)>.card:has(.pgrid-scroll),.view:not(.md)>.card:has(.recharts-responsive-container),
  .view:not(.md)>.card:has(.aglist),.view:not(.md)>.card:has(.cbars),
  .view:not(.md)>.card:has(.cwgrid),.view:not(.md)>.card:has(.cwbars),
  .view:not(.md)>.card.slim,.view:not(.md)>.card:has(.phow),
  .view:not(.md)>.card:has(.psel-strip),.view:not(.md)>.card:has(.eq-pending),
  .view:not(.md)>.card:has(.pbrk-scroll){grid-column:1 / -1}
  .gwrap{grid-template-columns:repeat(3,1fr)}
  /* dense lists use the extra width as two columns */
  .lb,.ptboard{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .view.md{max-width:680px;margin:0 auto}
  /* bottom nav: keep the tabs clustered, not stretched across the page */
  .bottom{max-width:1180px;justify-content:center;gap:10px}
  .navbtn{flex:0 0 auto;min-width:104px}
}
@media(min-width:1280px){
  .view:not(.md){grid-template-columns:repeat(3,minmax(0,1fr))}
  .gwrap{grid-template-columns:repeat(4,1fr)}
}
`;
