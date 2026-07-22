import { useEffect, useMemo, useState } from "react";
import { Trophy, ShareNetwork, Broadcast, Ticket, UsersThree, ArrowRight } from "@phosphor-icons/react";
import NumberFlow from "@number-flow/react";
import { Flag } from "./Flag";
import { SolanaLogo } from "./SolanaLogo";
import { useMarketStats } from "../lib/onchainMarkets";
import { fetchRecentTrades, type TradeRecord } from "../lib/supabase";
import { useSolPrice } from "../lib/solPrice";
import { shareLink, marketUrl } from "../lib/share";
import { toast } from "../lib/toast";

type Fx = { home: string; away: string; competition?: string };

const OUT = ["#4f7cff", "#f6b73c", "#f2685f"]; // Home / Draw / Away
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const fmtSol = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(n < 1 ? 3 : 2));
const ago = (ts: number) => {
  if (!ts) return "";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const teamFor = (fx: Fx | undefined, o: number) =>
  o === 1 ? "Draw" : !fx ? (o === 0 ? "Home" : "Away") : o === 0 ? fx.home : fx.away;
const flagTeam = (fx: Fx | undefined, o: number) => (!fx || o === 1 ? undefined : o === 0 ? fx.home : fx.away);

async function doShare(text: string, url?: string) {
  const r = await shareLink(text, url);
  if (r === "copied") toast.success("Copied", "Share text copied to your clipboard");
  else if (r === "failed") toast.error("Couldn't share", "Your browser blocked sharing and clipboard access");
}

/** One row in the global bet feed. */
function FeedRow({ t, fx, fid }: { t: TradeRecord; fx?: Fx; fid?: number }) {
  const team = flagTeam(fx, t.outcome);
  const pick = teamFor(fx, t.outcome);
  const url = fid != null ? marketUrl(fid) : undefined;
  const text = `${pick} backed${fx ? ` in ${fx.home} v ${fx.away}` : ""} on Txsports, a trustless on-chain prediction market.`;
  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/30">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OUT[t.outcome] ?? "#888" }} />
      <a href={fid != null ? marketUrl(fid) : "#/app"} className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm">
          <span className="font-mono text-xs text-muted-foreground">{short(t.bettor)}</span>
          <span className="text-muted-foreground"> backed </span>
          <span className="inline-flex items-center gap-1 font-semibold text-foreground">
            {team && <Flag team={team} />}{pick}
          </span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{fx ? `${fx.home} v ${fx.away}` : short(t.market)} · {ago(t.ts)}</div>
      </a>
      <span className="tnum inline-flex shrink-0 items-center gap-1 text-sm font-semibold"><SolanaLogo size={12} /> {t.amount.toFixed(2)}</span>
      <button type="button" aria-label="Share bet" onClick={() => doShare(text, url)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">
        <ShareNetwork size={15} />
      </button>
    </div>
  );
}

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{icon} {label}</div>
      <div className="tnum mt-2 font-display text-2xl font-black sm:text-3xl">{value}</div>
      {sub && <div className="tnum mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function GlobalActivity() {
  const { stats } = useMarketStats();
  const solPrice = useSolPrice();
  const [fxMap, setFxMap] = useState<Record<number, Fx>>({});
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/fixtures.json").then((r) => r.json()).then((list: any[]) => {
      const m: Record<number, Fx> = {};
      for (const f of list) m[f.fixtureId] = { home: f.home, away: f.away, competition: f.competition };
      setFxMap(m);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const pull = () => fetchRecentTrades(60)
      .then((t) => { if (alive) { setTrades(t); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    pull();
    const id = setInterval(pull, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const feed = useMemo(
    () => trades
      .map((t) => ({ t, fid: stats.byMarket[t.market]?.fixtureId }))
      .filter((x) => x.fid != null),
    [trades, stats]
  );

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      {/* header */}
      <div className="max-w-2xl">
        <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-primary">
          <Broadcast weight="fill" size={13} /> Global activity
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Every bet, on the record.</h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          A public, on-chain feed of every bet placed across Txsports, from every wallet. No edits, no deletions,
          verifiable by anyone.
        </p>
      </div>

      {/* stat strip */}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Ticket weight="fill" size={13} />} label="Total bets" value={<NumberFlow value={stats.totalBets} />} />
        <StatTile icon={<UsersThree weight="fill" size={13} />} label="Bettors" value={<NumberFlow value={stats.bettors} />} />
        <StatTile icon={<SolanaLogo size={12} />} label="Volume staked" value={<span className="inline-flex items-center gap-1.5"><SolanaLogo size={18} /> {fmtSol(stats.totalStaked)}</span>} sub={solPrice > 0 ? `$${(stats.totalStaked * solPrice).toFixed(0)}` : undefined} />
        <StatTile icon={<Trophy weight="fill" size={13} />} label="Matches settled" value={<NumberFlow value={stats.settled} />} />
      </div>

      {/* global bet feed */}
      <div className="mx-auto mt-8 max-w-3xl">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Platforms bets
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {feed.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {loading ? "Loading the global feed…" : "No bets to show yet. Once someone places a bet, it appears here."}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {feed.slice(0, 60).map(({ t, fid }) => (
                <FeedRow key={t.sig} t={t} fid={fid ?? undefined} fx={fid != null ? fxMap[fid] : undefined} />
              ))}
            </div>
          )}
        </div>
        <a href="#/app" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          Place a bet <ArrowRight weight="bold" size={14} />
        </a>
      </div>
    </section>
  );
}
