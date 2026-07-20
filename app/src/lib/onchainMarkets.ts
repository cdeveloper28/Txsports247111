import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { BorshCoder, utils, BN } from "@coral-xyz/anchor";
import { PublicKey, type Connection } from "@solana/web3.js";
import { IDL, PROGRAM_ID, LAMPORTS_PER_SOL } from "../config";
import { storeMarkets, fetchMarketsMirror, type MarketRecord } from "./supabase";

// Reads live market state straight from the chain: every market's staked pools, volume and bettor
// count, plus platform-wide totals. This is the real parimutuel money - distinct from the model
// odds in fixtures.json - and powers both the per-card "crowd" bar and the Market Pulse rail.

const coder = new BorshCoder(IDL);
const discOf = (name: string) =>
  utils.bytes.bs58.encode(Uint8Array.from((IDL.accounts as any[]).find((a) => a.name === name).discriminator));
const num = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : (v as BN).toNumber());

export interface MarketRow {
  fixtureId: number;
  pubkey: string; // market PDA
  host: string; // default pubkey = shared market; else the sandbox owner's wallet
  pools: [number, number, number]; // SOL staked on Home / Draw / Away
  total: number; // SOL
  bettors: number;
  resolved: boolean;
  winningOutcome: number;
  closesAt: number; // unix seconds
}

export interface MarketStats {
  byFixture: Record<number, MarketRow>;
  byMarket: Record<string, MarketRow>; // keyed by market PDA
  totalStaked: number;
  activeMarkets: number;
  settled: number;
  /** unique wallets holding a position in a live shared market */
  bettors: number;
  /** total positions across live shared markets (a wallet's engagement in one market = one bet) */
  totalBets: number;
  marketCount: number;
  biggest: MarketRow | null;
}

const EMPTY: MarketStats = {
  byFixture: {}, byMarket: {}, totalStaked: 0, activeMarkets: 0, settled: 0, bettors: 0, totalBets: 0, marketCount: 0, biggest: null,
};

// Mirror snapshots into Supabase at most once a minute (load runs ~every 20s while the page is open).
let lastMarketStore = 0;

async function load(conn: Connection): Promise<MarketStats> {
  const [markets, positions] = await Promise.all([
    conn.getProgramAccounts(PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: discOf("Market") } }] }),
    // Slice out `market` (32B) + `owner` (32B) of each Position: market keys the per-market
    // bet counts, owner lets us count UNIQUE bettors platform-wide.
    conn.getProgramAccounts(PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: discOf("Position") } }],
      dataSlice: { offset: 8, length: 64 },
    }),
  ]);

  const bettorsByMarket = new Map<string, number>();
  const ownersByMarket = new Map<string, string[]>();
  for (const p of positions) {
    const data = p.account.data as Buffer;
    const mkt = new PublicKey(data.subarray(0, 32)).toBase58();
    const owner = new PublicKey(data.subarray(32, 64)).toBase58();
    bettorsByMarket.set(mkt, (bettorsByMarket.get(mkt) ?? 0) + 1);
    (ownersByMarket.get(mkt) ?? ownersByMarket.set(mkt, []).get(mkt)!).push(owner);
  }

  const byFixture: Record<number, MarketRow> = {};
  const byMarket: Record<string, MarketRow> = {};
  let totalStaked = 0, activeMarkets = 0, settled = 0, biggest: MarketRow | null = null;
  const now = Date.now() / 1000;

  for (const { pubkey, account } of markets) {
    let m: any;
    try { m = coder.accounts.decode("Market", account.data as Buffer); } catch { continue; }
    const pk = pubkey.toBase58();
    const pools = (m.pools as BN[]).map((x) => num(x) / LAMPORTS_PER_SOL) as [number, number, number];
    const total = num(m.totalPool ?? m.total_pool) / LAMPORTS_PER_SOL;
    const resolved = !!m.resolved;
    const closesAt = num(m.closesAt ?? m.closes_at);
    const row: MarketRow = {
      fixtureId: num(m.fixtureId ?? m.fixture_id),
      pubkey: pk,
      host: (m.host as PublicKey)?.toBase58?.() ?? PublicKey.default.toBase58(),
      pools, total,
      bettors: bettorsByMarket.get(pk) ?? 0,
      resolved,
      winningOutcome: num(m.winningOutcome ?? m.winning_outcome),
      closesAt,
    };
    byMarket[pk] = row;
    // Product model: ONE shared market per fixture (host = default pubkey). A few legacy sandbox
    // markets exist on-chain from testing - keep them out of the fixture view and platform stats
    // so crowd bars / pulse reflect only the real shared pools.
    const isShared = row.host === PublicKey.default.toBase58();
    if (!isShared) continue;
    byFixture[row.fixtureId] = row;
    totalStaked += total;
    if (resolved) settled++;
    else if (closesAt > now) activeMarkets++;
  }
  for (const agg of Object.values(byFixture)) {
    if (agg.total > 0 && (!biggest || agg.total > biggest.total)) biggest = agg;
  }

  // Persist market snapshots (durable mirror for Market Pulse / analytics).
  const rows = Object.values(byFixture);
  if (rows.length && Date.now() - lastMarketStore > 60_000) {
    lastMarketStore = Date.now();
    void storeMarkets(rows.map((r) => ({
      fixtureId: r.fixtureId, market: r.pubkey, pools: r.pools, total: r.total,
      bettors: r.bettors, resolved: r.resolved, winningOutcome: r.winningOutcome, closesAt: r.closesAt,
    })));
  }

  const sharedRows = Object.values(byFixture);
  // Count only the live shared markets (excludes legacy/orphaned accounts).
  const uniqueOwners = new Set<string>();
  for (const r of sharedRows) for (const o of ownersByMarket.get(r.pubkey) ?? []) uniqueOwners.add(o);
  return {
    byFixture, byMarket, totalStaked, activeMarkets, settled,
    bettors: uniqueOwners.size,
    totalBets: sharedRows.reduce((s, r) => s + r.bettors, 0),
    marketCount: sharedRows.length, biggest,
  };
}

/** Rebuild MarketStats from the Supabase mirror - the fallback when the RPC read fails.
 *  The mirror only ever stores shared-market rows, so every row counts toward the totals.
 *  Unique bettors aren't in the mirror; the per-market position counts are the best stand-in. */
function statsFromMirror(rows: MarketRecord[]): MarketStats {
  const byFixture: Record<number, MarketRow> = {};
  const byMarket: Record<string, MarketRow> = {};
  let totalStaked = 0, activeMarkets = 0, settled = 0, biggest: MarketRow | null = null;
  const now = Date.now() / 1000;
  for (const r of rows) {
    const row: MarketRow = {
      fixtureId: r.fixtureId, pubkey: r.market, host: PublicKey.default.toBase58(),
      pools: r.pools, total: r.total, bettors: r.bettors,
      resolved: r.resolved, winningOutcome: r.winningOutcome, closesAt: r.closesAt,
    };
    byFixture[row.fixtureId] = row;
    byMarket[row.pubkey] = row;
    totalStaked += row.total;
    if (row.resolved) settled++;
    else if (row.closesAt > now) activeMarkets++;
    if (row.total > 0 && (!biggest || row.total > biggest.total)) biggest = row;
  }
  const totalBets = rows.reduce((s, r) => s + r.bettors, 0);
  return {
    byFixture, byMarket, totalStaked, activeMarkets, settled,
    bettors: totalBets, totalBets, marketCount: rows.length, biggest,
  };
}

// Shared TTL cache so multiple consumers this render don't each hit the RPC, plus a listener
// registry so a confirmed transaction can push fresh numbers to every subscriber at once.
let cache: { t: number; data: MarketStats } | null = null;
let inflight: Promise<MarketStats> | null = null;
const listeners = new Set<() => void>();

/** Call after any confirmed bet/cancel/settle/claim: drops the cache and makes every
 *  Market Pulse / crowd-bar subscriber refetch immediately instead of waiting out the poll. */
export function invalidateMarketStats() {
  cache = null;
  listeners.forEach((l) => l());
}

export async function getMarketStats(conn: Connection, maxAgeMs = 15_000): Promise<MarketStats> {
  if (cache && Date.now() - cache.t < maxAgeMs) return cache.data;
  if (!inflight) {
    inflight = load(conn)
      .then((data) => { cache = { t: Date.now(), data }; inflight = null; return data; })
      .catch(async (e) => {
        inflight = null;
        // Chain read failed (rate-limited or missing RPC). Serve the last good numbers if we
        // have them; otherwise fall back to the Supabase mirror so the pulse never flatlines.
        if (cache) return (cache as { t: number; data: MarketStats }).data;
        const mirror = await fetchMarketsMirror().catch(() => []);
        if (mirror.length) {
          const data = statsFromMirror(mirror);
          cache = { t: Date.now(), data };
          return data;
        }
        throw e;
      });
  }
  return inflight;
}

/** Subscribe to live market stats (polls every 20s, shares a cache across consumers, and
 *  refreshes instantly when invalidateMarketStats() fires after a transaction). */
export function useMarketStats(): { stats: MarketStats; loading: boolean } {
  const { connection } = useConnection();
  const [stats, setStats] = useState<MarketStats>(cache?.data ?? EMPTY);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    let alive = true;
    const run = () =>
      getMarketStats(connection)
        .then((d) => { if (alive) { setStats(d); setLoading(false); } })
        .catch(() => { if (alive) setLoading(false); });
    run();
    const t = setInterval(run, 20_000);
    listeners.add(run);
    return () => { alive = false; clearInterval(t); listeners.delete(run); };
  }, [connection]);
  return { stats, loading };
}

// ---- per-wallet positions (portfolio + claim-all) ----

export interface OpenPosition {
  market: string; // market PDA
  fixtureId: number;
  amounts: [number, number, number]; // SOL staked per outcome by this wallet
  staked: number; // total SOL this wallet has in the market
  claimed: boolean;
  resolved: boolean;
  winningOutcome: number;
  void: boolean; // resolved but nobody backed the winner → refund
  pools: [number, number, number];
  total: number;
  closesAt: number;
  /** claimable payout in SOL once resolved (0 while unresolved or if this wallet lost) */
  payout: number;
  status: "open" | "claimable" | "lost" | "claimed";
}

/** Load every position owned by `owner`, joined to its market so we know resolved/pools/payout. */
export async function loadPositions(conn: Connection, owner: PublicKey): Promise<OpenPosition[]> {
  const [accs, stats] = await Promise.all([
    conn.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: discOf("Position") } },
        { memcmp: { offset: 8 + 32, bytes: owner.toBase58() } }, // owner sits after the 32-byte market
      ],
    }),
    getMarketStats(conn),
  ]);

  const out: OpenPosition[] = [];
  for (const { account } of accs) {
    let p: any;
    try { p = coder.accounts.decode("Position", account.data as Buffer); } catch { continue; }
    const amounts = (p.amounts as BN[]).map((x) => num(x) / LAMPORTS_PER_SOL) as [number, number, number];
    const staked = amounts[0] + amounts[1] + amounts[2];
    if (staked <= 0) continue;
    const mkt = (p.market as PublicKey).toBase58();
    const row = stats.byMarket[mkt];
    const claimed = !!p.claimed;
    const resolved = row?.resolved ?? false;
    const win = row?.winningOutcome ?? 0;
    const pools = row?.pools ?? [0, 0, 0];
    const total = row?.total ?? 0;
    const isVoid = resolved && pools[win] <= 0;
    const payout = !resolved ? 0
      : isVoid ? staked
      : pools[win] > 0 ? (amounts[win] * total) / pools[win] : 0;
    const status: OpenPosition["status"] = claimed ? "claimed"
      : !resolved ? "open"
      : payout > 0 ? "claimable"
      : "lost";
    out.push({
      market: mkt, fixtureId: row?.fixtureId ?? 0, amounts, staked, claimed,
      resolved, winningOutcome: win, void: isVoid, pools, total,
      closesAt: row?.closesAt ?? 0, payout, status,
    });
  }
  // claimable first, then open, then resolved/lost/claimed
  const rank = { claimable: 0, open: 1, lost: 2, claimed: 3 } as const;
  out.sort((a, b) => rank[a.status] - rank[b.status] || b.staked - a.staked);
  return out;
}

/** Subscribe to the connected wallet's positions (reloads on demand after a claim). */
export function useOpenPositions(owner: PublicKey | null): {
  positions: OpenPosition[]; loading: boolean; reload: () => void;
} {
  const { connection } = useConnection();
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(() => {
    if (!owner) { setPositions([]); return; }
    setLoading(true);
    loadPositions(connection, owner)
      .then(setPositions).catch(() => {}).finally(() => setLoading(false));
  }, [connection, owner]);
  useEffect(() => { reload(); }, [reload]);
  return { positions, loading, reload };
}
