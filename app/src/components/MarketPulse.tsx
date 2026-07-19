import { useEffect, useState, type ReactNode } from "react";
import { Storefront, Users, SealCheck, Trophy, Ticket } from "@phosphor-icons/react";
import NumberFlow from "@number-flow/react";
import { Flag } from "./Flag";
import { useMarketStats, type MarketRow } from "../lib/onchainMarkets";

type Fx = { home: string; away: string };
const POOL_COLORS = ["#4f7cff", "#f6b73c", "#f2685f"]; // Home / Draw / Away

const fmtSol = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(n < 1 ? 3 : 2));

function Stat({ icon: Icon, label, value, unit }: { icon: any; label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon size={13} weight="bold" /> {label}
      </div>
      <div className="tnum mt-1.5 font-display text-xl font-bold leading-none">
        {value}{unit && <span className="ml-1 text-xs font-semibold text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function PoolRow({ row, fx, rank }: { row: MarketRow; fx?: Fx; rank: number }) {
  const seg = (i: number) => (row.total > 0 ? (row.pools[i] / row.total) * 100 : 0);
  return (
    <a href={`#/app/${row.fixtureId}`} className="group block rounded-xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-semibold">
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-secondary text-[9px] font-bold text-muted-foreground">{rank}</span>
          {fx ? (
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <Flag team={fx.home} /> <span className="truncate">{fx.home}</span>
              <span className="text-muted-foreground">v</span>
              <Flag team={fx.away} /> <span className="truncate">{fx.away}</span>
            </span>
          ) : (
            <span className="truncate">Fixture {row.fixtureId}</span>
          )}
        </span>
        <span className="tnum shrink-0 text-[12px] font-bold">◎ {fmtSol(row.total)}</span>
      </div>
      <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: `${seg(i)}%`, background: POOL_COLORS[i] }} className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
    </a>
  );
}

export function MarketPulse() {
  const { stats, loading } = useMarketStats();
  const [byId, setById] = useState<Record<number, Fx>>({});

  useEffect(() => {
    fetch("/fixtures.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: any[]) => {
        const m: Record<number, Fx> = {};
        for (const f of list) m[f.fixtureId] = { home: f.home, away: f.away };
        setById(m);
      })
      .catch(() => {});
  }, []);

  const biggest = Object.values(stats.byFixture)
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="mb-4">
        
        <p className="mt-1.5 text-[11px] text-muted-foreground">On-chain activity across every market</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Stat icon={Ticket} label="Total bets" value={<NumberFlow value={stats.totalBets} />} />
        <Stat icon={Users} label="Total bettors" value={<NumberFlow value={stats.bettors} />} />
        <Stat icon={Storefront} label="Active markets" value={<NumberFlow value={stats.activeMarkets} />} />
        <Stat icon={SealCheck} label="Settled" value={<NumberFlow value={stats.settled} />} />
      </div>

      <div className="mt-5">
        <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Trophy size={13} weight="fill" /> Biggest pools
        </div>
        {loading && biggest.length === 0 ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-secondary/40" />)}
          </div>
        ) : biggest.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-[12px] text-muted-foreground">
            No staked markets yet. Place the first bet to light up the pulse.
          </div>
        ) : (
          <div className="space-y-2.5">
            {biggest.map((row, i) => <PoolRow key={row.fixtureId} row={row} fx={byId[row.fixtureId]} rank={i + 1} />)}
          </div>
        )}
      </div>
    </aside>
  );
}
