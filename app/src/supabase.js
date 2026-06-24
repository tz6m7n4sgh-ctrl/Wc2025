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

/* ---- network: load ---------------------------------------------------- */
// Returns the raw blob plus the raw normalized result rows (including the stored
// home_team/away_team, which App needs to re-resolve each result to the canonical
// round-robin fixture and orient the score — the schedule order can differ from
// the RR index, so match_key alone is NOT trustworthy).
export async function loadFromSupabase() {
  const rows = await fetchJson(DATA_URL + "?id=eq.main&select=data");
  const blob = (Array.isArray(rows) ? rows[0] && rows[0].data : rows && rows.data) || {};
  let resultRows = [];
  try {
    const res = await fetchJson(RESULTS_URL + "?select=match_key,group_key,match_idx,home_team,away_team,home_score,away_score,status&order=match_key.asc");
    if (Array.isArray(res)) resultRows = res;
  } catch (e) { /* normalized table optional; blob.groupResults is the fallback */ }
  return { blob, resultRows };
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
  // Persist final group scores into the blob fallback. When the engine's match
  // list is present, rebuild authoritatively from current finals so cleared /
  // phantom results don't linger in the fallback; otherwise preserve what's there.
  const groupMatches = (data.matches || []).filter((m) => m.stage === "group");
  const gr = groupMatches.length ? {} : { ...(blob.groupResults || {}) };
  groupMatches.forEach((m) => { if (m.finalH != null && m.finalA != null) gr[m.id] = { home: String(m.finalH), away: String(m.finalA) }; });
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
// Batch upsert of normalized result rows (used by admin Sync).
export async function upsertResults(rows) {
  if (!rows || !rows.length) return true;
  return fetchJson(RESULTS_URL + "?on_conflict=match_key", { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
}
