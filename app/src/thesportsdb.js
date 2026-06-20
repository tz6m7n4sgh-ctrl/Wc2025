/* =====================================================================
   TheSportsDB live scores — display-only, premium V2 /livescore/soccer.
   Ported from the legacy app: tries a direct call (X-API-KEY header), then
   public CORS proxies, filters to the World Cup league, and returns the raw
   in-progress events. Team -> fixture mapping is done by the caller (it owns
   the canonical team helpers). Network failures degrade to []: no live scores,
   no crash. The premium key lives in settings.sportsdbKey (synced via Supabase).
   ===================================================================== */
const SDB_V2 = "https://www.thesportsdb.com/api/v2/json";
const WC_LEAGUE = "4429";
const CORS_PROXIES = [
  "https://corsproxy.io/?url={U}",
  "https://api.allorigins.win/raw?url={U}",
  "https://thingproxy.freeboard.io/fetch/{RAW}",
];

export function sdbIsPremium(key) { return !!key && key !== "123" && key !== "3"; }

async function sdbV2(path, key) {
  const url = SDB_V2 + path;
  try {
    const r = await fetch(url, { headers: { "X-API-KEY": key, Accept: "application/json" } });
    if (r.ok) return r.json();
    if (r.status === 401 || r.status === 403) return null;
  } catch (e) { /* fall through to proxies */ }
  for (const tmpl of CORS_PROXIES) {
    try {
      const purl = tmpl.replace("{U}", encodeURIComponent(url)).replace("{RAW}", url);
      const r = await fetch(purl, { headers: { "X-API-KEY": key, Accept: "application/json" } });
      if (r.ok) return r.json();
    } catch (e) { /* try next proxy */ }
  }
  return null;
}

// Returns normalized in-progress events: [{home, away, homeScore, awayScore, minute, status}]
export async function fetchLivescore(key) {
  if (!sdbIsPremium(key)) return [];
  const j = await sdbV2("/livescore/soccer", key);
  const arr = (j && (j.livescore || j.events || j.Events || j.results)) || [];
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((e) => { const lg = String(e.idLeague || e.idleague || ""); return !lg || lg === WC_LEAGUE; })
    .map((e) => ({
      home: e.strHomeTeam || e.strHome, away: e.strAwayTeam || e.strAway,
      homeScore: e.intHomeScore, awayScore: e.intAwayScore,
      minute: e.strProgress || e.intMinute || null, status: e.strStatus || e.strProgress || "Live",
    }))
    .filter((e) => e.home && e.away);
}

/* ---- completed results feed (V1 eventsday, 3-day window) --------------
   Fills final scores not yet persisted in the database. Works with the free
   '123' key too. The DB remains the source of truth — these only fill gaps. */
const SDB_V1 = "https://www.thesportsdb.com/api/v1/json";
const v1Key = (key) => (key && key !== "" ? key : "123");
const asArray = (j) => (Array.isArray(j) ? j : j && Array.isArray(j.events) ? j.events : j && Array.isArray(j.results) ? j.results : []);
const utcOffsetDate = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const sportsScore = (e) => {
  const hs = e && e.intHomeScore != null ? String(e.intHomeScore) : "";
  const as = e && e.intAwayScore != null ? String(e.intAwayScore) : "";
  return hs !== "" && as !== "" ? { home: hs, away: as } : null;
};
const sportsEventComplete = (e) => {
  if (!sportsScore(e)) return false;
  const st = String((e && e.strStatus) || "").toLowerCase();
  if (!st) return true;
  return st.includes("match finished") || st === "ft" || st === "aet" || st.includes("full") || st.includes("finished") || st.includes("after") || st.includes("complete");
};
// Diagnostic: how the last feed fetch went (for the admin Sync view).
let FEED_STATUS = { mode: "idle", events: 0, completed: 0, at: 0 };
export function getFeedStatus() { return FEED_STATUS; }
async function fetchDayV1(date, key) {
  const url = SDB_V1 + "/" + encodeURIComponent(v1Key(key)) + "/eventsday.php?d=" + encodeURIComponent(date) + "&l=" + WC_LEAGUE;
  try { const r = await fetch(url, { headers: { Accept: "application/json" } }); if (r.ok) { FEED_STATUS.mode = "direct"; return asArray(await r.json()); } } catch (e) { /* try proxies */ }
  for (const tmpl of CORS_PROXIES) {
    try { const purl = tmpl.replace("{U}", encodeURIComponent(url)).replace("{RAW}", url); const r = await fetch(purl, { headers: { Accept: "application/json" } }); if (r.ok) { FEED_STATUS.mode = "proxy:" + tmpl.split("/")[2]; return asArray(await r.json()); } } catch (e) { /* next */ }
  }
  FEED_STATUS.mode = "unreachable";
  return [];
}
function eventsToResults(events) {
  const out = [];
  events.forEach((e) => {
    if (!sportsEventComplete(e)) return;
    const sc = sportsScore(e);
    const home = e.strHomeTeam || e.strHome, away = e.strAwayTeam || e.strAway;
    if (home && away) out.push({ home, away, homeScore: sc.home, awayScore: sc.away });
  });
  return out;
}
// Premium match detail (timeline / lineup / stats) by eventId — V2 lookups.
// Returns normalized arrays, or null if not premium / no eventId.
export async function fetchMatchDetail(eventId, key) {
  if (!sdbIsPremium(key) || !eventId) return null;
  const firstArr = (j, keys) => { if (!j) return []; for (const k of keys) if (Array.isArray(j[k])) return j[k]; for (const k in j) if (Array.isArray(j[k])) return j[k]; return Array.isArray(j) ? j : []; };
  const [evJ, tlJ, lnJ, stJ] = await Promise.all([
    sdbV2("/lookup/event/" + eventId, key),
    sdbV2("/lookup/event_timeline/" + eventId, key),
    sdbV2("/lookup/event_lineup/" + eventId, key),
    sdbV2("/lookup/event_stats/" + eventId, key),
  ]);
  const ev0 = firstArr(evJ, ["event", "events", "lookup", "results"])[0] || (evJ && !Array.isArray(evJ) && evJ.strHomeTeam ? evJ : null);
  const event = ev0 ? { home: ev0.strHomeTeam || "", away: ev0.strAwayTeam || "", homeScore: ev0.intHomeScore, awayScore: ev0.intAwayScore, status: ev0.strStatus || ev0.strProgress || "", venue: ev0.strVenue || "" } : null;
  const timeline = firstArr(tlJ, ["timeline", "event_timeline", "events", "results"]).map((e) => ({
    min: e.strTimeline || e.intTime || e.strTime || e.strMinute || "",
    type: String(e.strTimelineDetail || e.strTimelineType || e.strDescription || e.strComment || ""),
    team: e.strTeam || "", player: e.strPlayer || e.strHome || e.strAssist || "",
  })).filter((e) => e.player || e.type);
  const stats = firstArr(stJ, ["eventstats", "stats", "statistics", "event_stats", "results"]).map((s) => ({
    name: s.strStat || s.strStatistic || s.strType || "",
    home: s.intHome != null ? s.intHome : (s.strHome != null ? s.strHome : ""),
    away: s.intAway != null ? s.intAway : (s.strAway != null ? s.strAway : ""),
  })).filter((s) => s.name);
  const lineup = firstArr(lnJ, ["lineup", "lineups", "event_lineup", "results"]).map((p) => ({
    player: p.strPlayer || "", team: p.strTeam || "?", pos: p.strPosition || p.strFormation || "",
    num: p.intSquadNumber || p.strNumber || p.intShirtNumber || "", sub: /yes/i.test(p.strSubstitute || ""),
  })).filter((p) => p.player);
  return { event, timeline, stats, lineup };
}

// Fetch completed results across a set of dates (UTC yyyy-mm-dd strings).
async function fetchResultsForDates(key, dates) {
  FEED_STATUS = { mode: "unreachable", events: 0, completed: 0, at: Date.now() };
  const batches = await Promise.all(dates.map((d) => fetchDayV1(d, key).catch(() => [])));
  const events = batches.flat();
  const results = eventsToResults(events);
  FEED_STATUS = { ...FEED_STATUS, events: events.length, completed: results.length, at: Date.now() };
  return results;
}
// Passive fill: [yesterday, today, tomorrow].
export async function fetchCompletedResults(key) {
  return fetchResultsForDates(key, [utcOffsetDate(-1), utcOffsetDate(0), utcOffsetDate(1)]);
}
// Admin sync: a wider window (tournament start → tomorrow), capped at 40 days.
export async function fetchResultsRange(key, fromISO, toISO) {
  const dates = []; let d = new Date(fromISO + "T00:00:00Z"); const end = new Date(toISO + "T00:00:00Z");
  while (d <= end && dates.length < 40) { dates.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); }
  return fetchResultsForDates(key, dates);
}
