import { createClient } from "@supabase/supabase-js";
import { LIQUIDITY_WALLET } from "../config";

// Cross-device prediction history, backed by Supabase (Postgres). The anon key is a public,
// RLS-guarded client key - safe to ship in the browser. If the env vars are unset, every call is a
// no-op so the app still runs on localStorage alone. Table DDL lives in supabase/schema.sql.

export interface Prediction {
  wallet: string;
  market: string;
  fixtureId: number;
  kind: "bet" | "cancel" | "settle" | "claim";
  outcome?: number;
  amount?: number;
  sig: string;
  ts?: number;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anon ? createClient(url, anon, { auth: { persistSession: false } }) : null;
export const supabaseEnabled = !!supabase;

const TABLE = "predictions";

/** Best-effort insert of one action; silently no-ops if Supabase isn't configured. */
export async function recordRemote(p: Prediction): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).insert({
    wallet: p.wallet,
    market: p.market,
    fixture_id: p.fixtureId,
    kind: p.kind,
    outcome: p.outcome ?? null,
    amount: p.amount ?? null,
    sig: p.sig,
    ts: p.ts ?? Date.now(),
  });
  if (error) console.warn("supabase insert failed", error.message);
}

// ---- Platform mirror: durable copies of the on-chain data the UI shows -------------------------

export interface TradeRecord {
  sig: string; ts: number; market: string; bettor: string; outcome: number; amount: number;
}
export interface MarketRecord {
  fixtureId: number; market: string; pools: [number, number, number]; total: number;
  bettors: number; resolved: boolean; winningOutcome: number; closesAt: number;
}

/** Mirror platform trades (BetPlaced events) into `trades`; ignores rows already stored (by sig). */
export async function storeTrades(trades: TradeRecord[]): Promise<void> {
  if (!supabase || trades.length === 0) return;
  const { error } = await supabase
    .from("trades")
    .upsert(trades, { onConflict: "sig", ignoreDuplicates: true });
  if (error) console.warn("supabase trades upsert failed", error.message);
}

/** Recent platform trades (BetPlaced) from the durable `trades` table, newest first - excluding the
 *  liquidity wallet at the query level (its seeding bursts would otherwise fill the whole window). */
export async function fetchRecentTrades(limit = 30): Promise<TradeRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("trades")
    .select("sig,ts,market,bettor,outcome,amount")
    .neq("bettor", LIQUIDITY_WALLET)
    .order("ts", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r: any) => ({
    sig: r.sig, ts: Number(r.ts), market: r.market, bettor: r.bettor,
    outcome: Number(r.outcome), amount: Number(r.amount),
  }));
}

/** Mirror live market snapshots into `markets` (upsert by fixture_id). */
export async function storeMarkets(rows: MarketRecord[]): Promise<void> {
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from("markets").upsert(
    rows.map((r) => ({
      fixture_id: r.fixtureId,
      market: r.market,
      pool_home: r.pools[0],
      pool_draw: r.pools[1],
      pool_away: r.pools[2],
      total: r.total,
      bettors: r.bettors,
      resolved: r.resolved,
      winning_outcome: r.winningOutcome,
      closes_at: r.closesAt,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "fixture_id" }
  );
  if (error) console.warn("supabase markets upsert failed", error.message);
}

/** A wallet's remote history, newest first. Returns [] on any error. */
export async function fetchRemote(wallet: string): Promise<Prediction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("wallet,market,fixture_id,kind,outcome,amount,sig,ts")
    .eq("wallet", wallet)
    .order("ts", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data.map((r: any) => ({
    wallet: r.wallet,
    market: r.market,
    fixtureId: r.fixture_id,
    kind: r.kind,
    outcome: r.outcome ?? undefined,
    amount: r.amount ?? undefined,
    sig: r.sig,
    ts: r.ts ?? undefined,
  }));
}
