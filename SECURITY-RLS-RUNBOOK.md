# Real per-player auth (Supabase RLS) — deployment runbook

This makes player sign-in codes **private** and player picks **write-protected**:
each player's picks live in their own row, anyone may *read* them (leaderboard),
but the only way to *write* is through the `save-picks` Edge Function, which
validates the code server-side and writes only that player's row. Players can no
longer read each other's codes or overwrite each other's picks.

The client code ships **disabled** (`SECURE_AUTH_URL = ""` in
`app/src/secureAuth.js`), so nothing changes in the live app until you complete
the steps below and flip the flag.

> I could not test any of this from the build environment (it has no network
> access to Supabase). Deploy to a staging project first if you can, and verify
> with the curl checks at the end before flipping the client flag.

---

## 1. Database — run the migration
In the Supabase SQL editor, run `supabase/migrations/20260625_secure_picks.sql`.
It creates:
- `wc2026_players` — per-player picks; RLS **read-only** for anon (no direct writes).
- `wc2026_auth` — private `code_hash → name`; **no** anon access at all.

## 2. Seed players + codes (one-time)
Codes are uppercased then SHA-256-hashed. Two ways:

**a) Reuse existing codes from the current blob** (the `token` field). Copy the
seed SQL from the bottom of the migration file, filling in each player's current
code. The `wc2026_players` seed can be auto-derived from the blob (see the
commented `insert ... select` in the migration).

**b) Fresh codes.** Pick a short code per player and insert:
```sql
insert into public.wc2026_auth (name, code_hash) values
  ('Ahmed', encode(digest(upper('ABC234'),'sha256'),'hex')),
  ('Sara',  encode(digest(upper('DEF567'),'sha256'),'hex'))
on conflict (name) do update set code_hash = excluded.code_hash;
```
Keep a record of the plaintext codes — you'll send them over WhatsApp. They are
**not** stored anywhere readable after this.

## 3. Deploy the Edge Function
```bash
supabase functions deploy save-picks --no-verify-jwt
supabase secrets set SB_URL=https://jrwkhogoewhlfrzlsmlh.supabase.co \
                     SERVICE_ROLE_KEY=<your service_role key>
```
The `service_role` key is in Project Settings → API. It is used **only** inside
the function (never shipped to the browser).

## 4. Flip the client flag
In `app/src/secureAuth.js` set:
```js
export const SECURE_AUTH_URL = "https://jrwkhogoewhlfrzlsmlh.supabase.co/functions/v1/save-picks";
```
Rebuild and deploy the app (`cd app && npm run build`, copy `dist/index.html` to
the repo root `index.html`, commit). From then on:
- the player code popup validates against the function,
- a player's saves go through the function (their row only),
- the leaderboard reads picks from `wc2026_players`.

## 5. Verify (before relying on it)
```bash
# valid code -> { name, picks }
curl -s -X POST "$URL" -H "apikey: $ANON" -H "content-type: application/json" \
  -d '{"action":"login","code":"ABC234"}'

# wrong code -> 401 {"error":"invalid code"}
curl -s -X POST "$URL" -H "apikey: $ANON" -H "content-type: application/json" \
  -d '{"action":"login","code":"NOPE99"}'

# save (only the code's own row is written)
curl -s -X POST "$URL" -H "apikey: $ANON" -H "content-type: application/json" \
  -d '{"action":"save","code":"ABC234","patch":{"champion":"Brazil"}}'

# confirm the private table is NOT readable with the anon key (should be empty/denied)
curl -s "https://<ref>.supabase.co/rest/v1/wc2026_auth?select=*" -H "apikey: $ANON"
```

---

## Scope notes / known follow-ups
- **Code management UI:** in secure mode the admin Players page can't display
  codes (they're private). Manage codes via the SQL in step 2 (add/rotate a row
  in `wc2026_auth`). An admin-authenticated code endpoint can be added later if
  you want in-app management.
- **Admin writes** (results, settings, knockout fixtures) still use the blob with
  the anon key — the admin is a single password-gated person. Locking those down
  is a separate step if you want it.
- **Reads are public by design:** predictions are visible to everyone for the
  leaderboard. Only *codes* and *write access* are protected here.
