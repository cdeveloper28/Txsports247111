-- Txsports storage schema. Run once in the Supabase SQL editor
-- (Dashboard → SQL → New query → paste → Run). Safe to re-run (idempotent).
--
-- Three tables cover every piece of data the app shows:
--   predictions - the connected wallet's own history (written client-side on each action)
--   trades      - every bet across the platform, mirrored from on-chain BetPlaced events (hero marquee)
--   markets     - live per-market pool snapshots, mirrored from on-chain Market accounts (Market Pulse)
--
-- The browser uses the public anon key, so RLS allows anon read + write. The trade/market rows are
-- just a durable mirror of PUBLIC on-chain data (clients overwrite them with the real chain values),
-- so anon write is acceptable for this devnet demo. To harden later: have a server job write these
-- two tables with the service_role key and drop the anon insert/update policies below.

-- ---------------------------------------------------------------- predictions (user history)
create table if not exists public.predictions (
  id          bigint generated always as identity primary key,
  wallet      text             not null,
  market      text             not null,
  fixture_id  bigint           not null,
  kind        text             not null,   -- bet | cancel | settle | claim
  outcome     int,                         -- 0 Home / 1 Draw / 2 Away
  amount      double precision,            -- SOL
  sig         text             not null,
  ts          bigint           not null,
  created_at  timestamptz default now()
);
create index if not exists predictions_wallet_ts_idx on public.predictions (wallet, ts desc);
create unique index if not exists predictions_sig_kind_key on public.predictions (sig, kind);

-- ---------------------------------------------------------------- trades (platform-wide, marquee)
create table if not exists public.trades (
  sig         text primary key,            -- Solana tx signature (dedupes)
  ts          bigint           not null,   -- block time (ms)
  market      text             not null,   -- market PDA (join to markets.market)
  bettor      text             not null,   -- wallet
  outcome     int              not null,   -- 0 Home / 1 Draw / 2 Away
  amount      double precision not null    -- SOL
);
create index if not exists trades_ts_idx on public.trades (ts desc);

-- ---------------------------------------------------------------- markets (snapshots, Market Pulse)
create table if not exists public.markets (
  fixture_id      bigint primary key,
  market          text             not null,          -- market PDA
  pool_home       double precision not null default 0,
  pool_draw       double precision not null default 0,
  pool_away       double precision not null default 0,
  total           double precision not null default 0,
  bettors         int              not null default 0,
  resolved        boolean          not null default false,
  winning_outcome int,
  closes_at       bigint,
  updated_at      timestamptz default now()
);
create unique index if not exists markets_market_key on public.markets (market);

-- ---------------------------------------------------------------- RLS
alter table public.predictions enable row level security;
alter table public.trades      enable row level security;
alter table public.markets     enable row level security;

drop policy if exists "anon read predictions"   on public.predictions;
drop policy if exists "anon insert predictions" on public.predictions;
create policy "anon read predictions"   on public.predictions for select to anon using (true);
create policy "anon insert predictions" on public.predictions for insert to anon with check (true);

drop policy if exists "anon read trades"   on public.trades;
drop policy if exists "anon insert trades" on public.trades;
create policy "anon read trades"   on public.trades for select to anon using (true);
create policy "anon insert trades" on public.trades for insert to anon with check (true);

drop policy if exists "anon read markets"   on public.markets;
drop policy if exists "anon insert markets" on public.markets;
drop policy if exists "anon update markets" on public.markets;
create policy "anon read markets"   on public.markets for select to anon using (true);
create policy "anon insert markets" on public.markets for insert to anon with check (true);
create policy "anon update markets" on public.markets for update to anon using (true) with check (true);
