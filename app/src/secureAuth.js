/* =====================================================================
   Secure self-service auth (optional, off by default).

   When SECURE_AUTH_URL is set to the deployed `save-picks` Edge Function
   URL, the app uses real per-player auth backed by Supabase RLS:
     - sign-in codes are validated server-side (never shipped in the data),
     - a player's picks are written only to their own row, via the function.

   When SECURE_AUTH_URL is "" (the default), none of this runs and the app
   keeps the legacy honor-system behaviour, so shipping this file changes
   nothing until you flip the flag.
   ===================================================================== */
import { SB_KEY } from "./supabase.js";

// Set this to your function URL to enable secure auth, e.g.
//   "https://jrwkhogoewhlfrzlsmlh.supabase.co/functions/v1/save-picks"
export const SECURE_AUTH_URL = "";

export const secureAuthOn = () => !!SECURE_AUTH_URL;

const H = { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

async function call(action, body, ms = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(SECURE_AUTH_URL, { method: "POST", headers: H, body: JSON.stringify({ action, ...body }), signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j && j.error ? j.error : "HTTP " + r.status);
    return j;
  } finally { clearTimeout(id); }
}

// Validate a code; returns { name, picks:{ groupPreds, champion, knockout } }.
export function secureLogin(code) { return call("login", { code: String(code || "").trim() }); }

// Persist one player's picks (server derives the player from the code).
// patch: { groupPreds?, champion?, knockout? }
export function secureSave(code, patch) { return call("save", { code: String(code || "").trim(), patch }); }

// Public read of all players' picks (anon SELECT; RLS allows read only).
export async function loadPlayerRows(sbUrl) {
  try {
    const r = await fetch(sbUrl + "/rest/v1/wc2026_players?select=name,phone,group_preds,champion,knockout", { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch (e) { return []; }
}
