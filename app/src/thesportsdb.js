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
