/* =====================================================================
   Supabase data layer — real players / predictions / results.

   Mirrors the production endpoints used by the legacy app:
     - wc2026                (id='main', JSON column `data` = league blob)
     - wc2026_match_results  (normalized per-match scores)

   Read maps the blob into the engine's data shape; write persists changes
   back (blob upsert + normalized result upsert). The anon key is the public
   key already shipped in the legacy page. Live in-browser verification is
   done by mocking fetch with a real blob (see qa); the network calls here are
   byte-for-byte the same requests the legacy app makes in production.
   ===================================================================== */

export const SB_URL = "https://jrwkhogoewhlfrzlsmlh.supabase.co";
export const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impyd2tob2dvZXdobGZyemxzbWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjU2MzEsImV4cCI6MjA5Njc0MTYzMX0.1TF9PSzu4t9661aDXfaqc1tZPZ5uxeAW6Q5hE2My6Qc";
const DATA_URL = SB_URL + "/rest/v1/wc2026";
const RESULTS_URL = SB_URL + "/rest/v1/wc2026_match_results";
const H = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Accept: "application/json" };

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}
async function fetchJson(url, opts, ms = 12000) {
  const r = await withTimeout(fetch(url, { headers: H, ...opts }), ms);
  if (!r.ok) { let t = ""; try { t = await r.text(); } catch (_) {} throw new Error("HTTP " + r.status + " " + t.slice(0, 160)); }
  if (opts && opts.method === "POST" && (opts.headers || {}).Prefer && /return=minimal/.test(opts.headers.Prefer)) return true;
  return r.json();
}

/* ---- pure mapping: blob -> engine data ------------------------------- */
// Turn the schedule + group results into engine match objects. Real matches
// carry no synthetic timeline; status is derived from kickoff time + results.
function buildMatches(blob) {
  const groupResults = blob.groupResults || {};
  const matches = [];
  (blob.scheduleMatches || []).forEach((s) => {
    if (!s || !s.key) return;
    const res = groupResults[s.key];
    const hasRes = res && res.home != null && res.away != null && res.home !== "" && res.away !== "";
    matches.push({
      id: s.key, stage: "group", group: s.group, idx: s.idx, mid: null,
      home: s.home, away: s.away, venue: s.venue || "",
      ko: Date.parse(s.kickoffUtc || s.date) || 0,
      real: true, scheduleStatus: s.status || "",
      finalH: hasRes ? Number(res.home) : null, finalA: hasRes ? Number(res.away) : null,
      allEvents: [], allStats: null, lineups: null,
    });
  });
  // knockout fixtures (object keyed by mid, or array) once they exist
  const km = blob.knockoutMatches;
  const koList = Array.isArray(km) ? km : km && typeof km === "object" ? Object.values(km) : [];
  koList.forEach((s, i) => {
    if (!s || !(s.home || s.away)) return;
    const mid = s.mid || s.key || `${s.round || "KO"}_${i}`;
    const res = (blob.knockoutResults || {})[mid];
    matches.push({
      id: mid, stage: "ko", group: null, idx: i, mid, round: s.round || (mid.split("_")[0] || "KO"),
      home: s.home, away: s.away, venue: s.venue || "",
      ko: Date.parse(s.kickoffUtc || s.date) || 0, real: true, scheduleStatus: s.status || "",
      finalH: s.home_score != null ? Number(s.home_score) : null, finalA: s.away_score != null ? Number(s.away_score) : null,
      koWinner: res || null, allEvents: [], allStats: null, lineups: null,
    });
  });
  matches.sort((a, b) => a.ko - b.ko);
  return matches;
}

export function mapBlobToData(blob) {
  blob = blob || {};
  const players = {};
  Object.entries(blob.players || {}).forEach(([name, p]) => {
    players[name] = {
      groupPreds: p.groupPreds || p.predictions || p.groups || {},
      champion: p.champion == null ? null : p.champion,
      knockout: p.knockoutPreds || p.knockout || {},
      meta: p.meta,
    };
  });
  return {
    players,
    groupResults: { ...(blob.groupResults || {}) },
    knockoutResults: { ...(blob.knockoutResults || {}) },
    champion: blob.champion || null,
    championOverride: blob.champion || null,
    settings: blob.settings || { currency: "AED" },
    auditLog: Array.isArray(blob.auditLog) ? blob.auditLog : [],
    matches: buildMatches(blob),
    real: true,
    _blob: blob,
  };
}

/* ---- network: load ---------------------------------------------------- */
export async function loadFromSupabase() {
  const rows = await fetchJson(DATA_URL + "?id=eq.main&select=data");
  const blob = (Array.isArray(rows) ? rows[0] && rows[0].data : rows && rows.data) || {};
  const data = mapBlobToData(blob);
  // Normalized results table is the source of truth; merge final rows on top.
  try {
    const res = await fetchJson(RESULTS_URL + "?select=match_key,group_key,match_idx,home_score,away_score,status&order=match_key.asc");
    if (Array.isArray(res)) {
      res.forEach((r) => {
        if (r.status === "final" && r.home_score != null && r.away_score != null) {
          const key = r.match_key || `${r.group_key}_${r.match_idx}`;
          data.groupResults[key] = { home: String(r.home_score), away: String(r.away_score) };
        }
      });
      data.matches.forEach((m) => {
        if (m.stage !== "group") return;
        const res2 = data.groupResults[m.id];
        m.finalH = res2 && res2.home !== "" && res2.home != null ? Number(res2.home) : null;
        m.finalA = res2 && res2.away !== "" && res2.away != null ? Number(res2.away) : null;
      });
    }
  } catch (e) { /* normalized table optional; blob.groupResults is the fallback */ }
  return data;
}

/* ---- network: save (admin) ------------------------------------------- */
// Reconstruct the blob from engine data, preserving unknown fields.
export function dataToBlob(data) {
  const blob = { ...(data._blob || {}) };
  const players = { ...(blob.players || {}) };
  Object.entries(data.players || {}).forEach(([name, p]) => {
    players[name] = { ...(players[name] || {}), groupPreds: p.groupPreds, champion: p.champion ?? null, knockoutPreds: p.knockout || {} };
  });
  blob.players = players;
  blob.settings = data.settings || blob.settings;
  blob.champion = data.championOverride || null;
  blob.auditLog = data.auditLog || blob.auditLog || [];
  // persist final group scores into the blob fallback
  const gr = { ...(blob.groupResults || {}) };
  (data.matches || []).forEach((m) => { if (m.stage === "group" && m.finalH != null && m.finalA != null) gr[m.id] = { home: String(m.finalH), away: String(m.finalA) }; });
  blob.groupResults = gr;
  return blob;
}
export async function saveBlob(data) {
  return fetchJson(DATA_URL, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: "main", data: dataToBlob(data) }) });
}
export async function upsertResult(group, idx, home, away, homeScore, awayScore) {
  const row = {
    match_key: `${group}_${idx}`, group_key: group, match_idx: idx, home_team: home, away_team: away,
    home_score: homeScore == null ? null : Number(homeScore), away_score: awayScore == null ? null : Number(awayScore),
    status: homeScore != null && awayScore != null ? "final" : "scheduled", source: "admin",
  };
  return fetchJson(RESULTS_URL + "?on_conflict=match_key", { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
}
