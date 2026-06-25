-- =====================================================================
-- Per-player picks with real row-level security.
--
-- Model: each player's picks live in their own row of wc2026_players,
-- which anyone may READ (leaderboard / display) but NOBODY may write
-- directly. Sign-in codes live in a separate PRIVATE table (wc2026_auth)
-- that the anon key cannot read at all. All writes go through the
-- `save-picks` Edge Function (service role), which validates the code and
-- writes only the matching player's row — so a player can never read
-- another player's code or overwrite another player's picks.
--
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- =====================================================================

create extension if not exists pgcrypto;  -- for digest() used when seeding

-- ---- per-player picks: public read, no direct writes ----------------
create table if not exists public.wc2026_players (
  name        text primary key,
  phone       text,
  group_preds jsonb not null default '{}'::jsonb,
  champion    text,
  knockout    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.wc2026_players enable row level security;

-- anyone (incl. the anon key) may read picks; that's fine — predictions
-- are public for the leaderboard. No write policy is created, so INSERT /
-- UPDATE / DELETE are denied for anon & authenticated. The service role
-- (used only inside the Edge Function) bypasses RLS.
drop policy if exists wc2026_players_read on public.wc2026_players;
create policy wc2026_players_read
  on public.wc2026_players for select
  using (true);

-- ---- private auth: code -> player (NO anon access) ------------------
-- code_hash = encode(digest(upper(code), 'sha256'), 'hex')
create table if not exists public.wc2026_auth (
  name       text primary key,
  code_hash  text not null,
  updated_at timestamptz not null default now()
);
create index if not exists wc2026_auth_code_hash_idx on public.wc2026_auth(code_hash);

alter table public.wc2026_auth enable row level security;
-- No policies at all => every anon / authenticated request is denied.
-- Only the service role (Edge Function) can read/write this table.

-- =====================================================================
-- SEEDING (one-time). Replace the VALUES with your current players and
-- their existing codes (the `token` field in the old blob). Codes are
-- uppercased before hashing — keep that consistent with the app.
--
-- Example:
--   insert into public.wc2026_auth (name, code_hash) values
--     ('Ahmed', encode(digest(upper('1234'), 'sha256'), 'hex')),
--     ('Sara',  encode(digest(upper('5678'), 'sha256'), 'hex'))
--   on conflict (name) do update set code_hash = excluded.code_hash;
--
--   insert into public.wc2026_players (name, phone, group_preds, champion, knockout)
--   select key,
--          (value->>'phone'),
--          coalesce(value->'groupPreds', '{}'::jsonb),
--          (value->>'champion'),
--          coalesce(value->'knockoutPreds', '{}'::jsonb)
--   from jsonb_each((select data->'players' from public.wc2026 where id = 'main'))
--   on conflict (name) do update
--     set group_preds = excluded.group_preds,
--         champion    = excluded.champion,
--         knockout    = excluded.knockout,
--         phone       = excluded.phone;
-- =====================================================================
