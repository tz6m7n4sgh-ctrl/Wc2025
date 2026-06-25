// =====================================================================
// save-picks — the only path that may WRITE player picks.
//
// It validates the player's sign-in code against the private wc2026_auth
// table and DERIVES the player's name from that row (the client cannot
// claim to be someone else). It then reads (login) or upserts (save) only
// that player's row in wc2026_players using the service role.
//
// Deploy (Supabase CLI):
//   supabase functions deploy save-picks --no-verify-jwt
//   supabase secrets set SB_URL=https://<ref>.supabase.co \
//                        SERVICE_ROLE_KEY=<your service_role key>
//
// Request body (POST, JSON):
//   { "action": "login", "code": "ABC234" }
//   { "action": "save",  "code": "ABC234",
//     "patch": { "groupPreds": {...}, "champion": "Brazil", "knockout": {...} } }
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SB_URL = Deno.env.get("SB_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: { action?: string; code?: string; patch?: Record<string, unknown> };
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const code = String(payload.code ?? "").trim().toUpperCase();
  if (!code) return json({ error: "missing code" }, 400);

  // Validate the code → derive the player's name. Client-supplied names are ignored.
  const hash = await sha256hex(code);
  const { data: auth, error: authErr } = await admin
    .from("wc2026_auth").select("name").eq("code_hash", hash).maybeSingle();
  if (authErr) return json({ error: "auth lookup failed" }, 500);
  if (!auth) return json({ error: "invalid code" }, 401);
  const name = auth.name as string;

  if (payload.action === "login") {
    const { data: row } = await admin
      .from("wc2026_players").select("group_preds,champion,knockout").eq("name", name).maybeSingle();
    return json({ name, picks: { groupPreds: row?.group_preds ?? {}, champion: row?.champion ?? null, knockout: row?.knockout ?? {} } });
  }

  if (payload.action === "save") {
    const p = payload.patch ?? {};
    const upd: Record<string, unknown> = { name, updated_at: new Date().toISOString() };
    if (p.groupPreds !== undefined) upd.group_preds = p.groupPreds;
    if (p.champion !== undefined) upd.champion = p.champion;
    if (p.knockout !== undefined) upd.knockout = p.knockout;
    const { error } = await admin.from("wc2026_players").upsert(upd, { onConflict: "name" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, name });
  }

  return json({ error: "unknown action" }, 400);
});
