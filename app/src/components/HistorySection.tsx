import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ArrowSquareOut, Wallet, ArrowClockwise, ChartLineUp, Ticket, Trophy, XCircle, SealCheck,
} from "@phosphor-icons/react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Flag } from "./Flag";
import { OUTCOME_LABELS } from "../config";
import { getHistory, remoteEnabled, type Prediction } from "../lib/history";
import { useSolPrice } from "../lib/solPrice";
import { PositionsPanel } from "./PositionsPanel";

const fmtTime = (ms?: number) =>
  ms ? new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const OUT_COLORS = ["#4f7cff", "#f6b73c", "#f2685f"];

/** Cumulative P&L (SOL) over the wallet's events - a crisp area+line sparkline. */
function EquityCurve({ points }: { points: number[] }) {
  const raw = useId();
  const gid = "eq" + raw.replace(/[^a-zA-Z0-9]/g, "");
  if (points.length < 2) {
    return <div className="grid h-full min-h-[160px] place-items-center px-6 text-center text-sm text-muted-foreground">Place a few bets and settle them. Your running P&amp;L curve builds here.</div>;
  }
  const W = 600, H = 190, pad = 16;
  const min = Math.min(0, ...points), max = Math.max(0, ...points);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(H - pad).toFixed(1)} L${x(0).toFixed(1)},${(H - pad).toFixed(1)} Z`;
  const last = points[points.length - 1];
  const up = last >= 0;
  const col = up ? "#22c55e" : "#f2685f";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.32" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.18" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={col} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(points.length - 1)} cy={y(last)} r="3.5" fill={col} />
    </svg>
  );
}

/** Donut of bet distribution across Home / Draw / Away. */
function OutcomeDonut({ counts }: { counts: [number, number, number] }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const R = 42, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0">
      <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--secondary))" strokeWidth="13" />
      {total > 0 && counts.map((c, i) => {
        const len = (c / total) * C;
        const seg = (
          <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={OUT_COLORS[i]} strokeWidth="13"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" />
        );
        off += len;
        return seg;
      })}
      <text x="50" y="48" textAnchor="middle" className="fill-foreground font-display" style={{ fontWeight: 700 }} fontSize="20">{total}</text>
      <text x="50" y="63" textAnchor="middle" className="fill-muted-foreground" fontSize="7.5" letterSpacing="1">BETS</text>
    </svg>
  );
}

/** One number in the season strip - mono eyebrow, tabular value, quiet sub. */
function Metric({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="tnum mt-1.5 font-display text-2xl font-bold leading-none">
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="tnum mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function HistorySection() {
  const { publicKey } = useWallet();
  const [rows, setRows] = useState<Prediction[]>([]);
  const [fixtures, setFixtures] = useState<Record<number, { home: string; away: string }>>({});
  const [loading, setLoading] = useState(false);
  const solPrice = useSolPrice();

  useEffect(() => {
    fetch("/fixtures.json").then((r) => (r.ok ? r.json() : [])).then((list: any[]) => {
      const map: Record<number, { home: string; away: string }> = {};
      for (const f of list) map[f.fixtureId] = { home: f.home, away: f.away };
      setFixtures(map);
    }).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (!publicKey) { setRows([]); return; }
    setLoading(true);
    try { setRows(await getHistory(publicKey.toBase58())); }
    finally { setLoading(false); }
  }, [publicKey]);
  useEffect(() => { refresh(); }, [refresh]);

  const stats = useMemo(() => {
    const sum = (k: string) => rows.filter((r) => r.kind === k).reduce((s, r) => s + (r.amount ?? 0), 0);
    const staked = sum("bet"), refunded = sum("cancel"), won = sum("claim");
    const netStaked = Math.max(0, staked - refunded);
    const pnl = won - netStaked;
    const outcomeCounts: [number, number, number] = [0, 0, 0];
    rows.forEach((r) => { if (r.kind === "bet" && r.outcome != null) outcomeCounts[r.outcome]++; });
    const markets = new Set(rows.filter((r) => r.kind === "bet").map((r) => r.fixtureId)).size;
    const biggestWin = Math.max(0, ...rows.filter((r) => r.kind === "claim").map((r) => r.amount ?? 0));
    // cumulative P&L over time
    const ordered = [...rows].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    let cum = 0;
    const curve = ordered.map((e) => {
      if (e.kind === "bet") cum -= e.amount ?? 0;
      else if (e.kind === "cancel" || e.kind === "claim") cum += e.amount ?? 0;
      return cum;
    });
    return {
      predictions: rows.filter((r) => r.kind === "bet").length,
      staked, won, pnl, outcomeCounts, markets, biggestWin, curve,
      claims: rows.filter((r) => r.kind === "claim").length,
      roi: netStaked > 0 ? Math.round((pnl / netStaked) * 100) : 0,
    };
  }, [rows]);

  const label = (fid: number) => { const f = fixtures[fid]; return f ? `${f.home} vs ${f.away}` : `Fixture ${fid}`; };
  const teams = (fid: number) => fixtures[fid];
  const sign = (k: string) => (k === "bet" ? -1 : k === "cancel" || k === "claim" ? 1 : 0);
  const kindMeta: Record<string, { icon: any; cls: string }> = {
    bet: { icon: Ticket, cls: "text-foreground" },
    cancel: { icon: XCircle, cls: "text-muted-foreground" },
    settle: { icon: SealCheck, cls: "text-primary" },
    claim: { icon: Trophy, cls: "text-success" },
  };

  const pnlTone = stats.pnl > 0 ? "text-success" : stats.pnl < 0 ? "text-danger" : "";

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Your history</h1>
          <p className="mt-2 text-muted-foreground">Every prediction is keyed to your wallet. Reconnect anywhere and it all comes back.</p>
        </div>
        <div className="flex items-center gap-3">
          {publicKey && (
            <span className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 font-mono text-[11px] text-muted-foreground sm:inline-flex">
              <span className={"h-1.5 w-1.5 rounded-full " + (remoteEnabled ? "bg-success" : "bg-muted-foreground/50")} />
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
              <span className="text-muted-foreground/60">· {remoteEnabled ? "synced" : "local"}</span>
            </span>
          )}
          {publicKey && (
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <ArrowClockwise size={16} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          )}
        </div>
      </div>

      {!publicKey ? (
        <Card className="flex flex-col items-center gap-4 p-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary"><Wallet weight="fill" size={22} /></div>
          <div>
            <div className="font-display text-lg font-semibold">Connect your wallet</div>
            <p className="mt-1 text-sm text-muted-foreground">Your wallet address is your identity. Connect to see your stats and P&amp;L.</p>
          </div>
          <WalletMultiButton />
        </Card>
      ) : rows.length === 0 ? (
        <>
          <div className="mb-6"><PositionsPanel onClaimed={refresh} /></div>
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-secondary"><ChartLineUp weight="fill" size={22} className="text-muted-foreground" /></div>
            <div className="font-display text-lg font-semibold">No predictions yet</div>
            <p className="max-w-xs text-sm text-muted-foreground">Open a market, place your first bet, and your analytics + P&amp;L curve will appear here.</p>
            <Button asChild className="mt-1"><a href="#/app">Browse markets</a></Button>
          </Card>
        </>
      ) : (
        <>
          {/* P&L dashboard - number, curve, and pick split in one row */}
          <Card className="mb-4 overflow-hidden">
            <div className="grid lg:grid-cols-[260px_minmax(0,1fr)_300px]">
              <div className="flex flex-col justify-center gap-1 border-b border-border p-6 lg:border-b-0 lg:border-r">
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Net P&amp;L</div>
                <div className={"tnum font-display text-4xl font-bold leading-none " + pnlTone}>
                  {stats.pnl >= 0 ? "+" : ""}{stats.pnl.toFixed(3)}
                  <span className="ml-1.5 text-lg font-semibold text-muted-foreground">SOL</span>
                </div>
                <div className={"tnum mt-1 text-sm font-semibold " + pnlTone}>
                  {stats.roi >= 0 ? "+" : ""}{stats.roi}% ROI · ≈ ${(stats.pnl * solPrice).toFixed(2)}
                </div>
              </div>
              <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
                <div className="h-[200px] text-foreground"><EquityCurve points={stats.curve} /></div>
              </div>
              <div className="flex items-center gap-4 p-5">
                <OutcomeDonut counts={stats.outcomeCounts} />
                <div className="min-w-0 flex-1 space-y-2">
                  {OUTCOME_LABELS.map((l, i) => {
                    const c = stats.outcomeCounts[i];
                    const tot = stats.outcomeCounts.reduce((a, b) => a + b, 0) || 1;
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OUT_COLORS[i] }} />
                        <span className="flex-1 text-muted-foreground">{l}</span>
                        <span className="tnum font-semibold">{c}</span>
                        <span className="tnum w-9 text-right text-[11px] text-muted-foreground">{Math.round((c / tot) * 100)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {/* season numbers - quiet hairline strip */}
          <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            <Metric label="Predictions" value={String(stats.predictions)} sub={`${stats.markets} market${stats.markets === 1 ? "" : "s"}`} />
            <Metric label="Volume staked" value={stats.staked.toFixed(3)} unit="SOL" sub={`≈ $${(stats.staked * solPrice).toFixed(2)}`} />
            <Metric label="Total won" value={stats.won.toFixed(3)} unit="SOL" sub={`${stats.claims} claim${stats.claims === 1 ? "" : "s"}`} />
            <Metric label="Best claim" value={stats.biggestWin.toFixed(3)} unit="SOL" sub={`≈ $${(stats.biggestWin * solPrice).toFixed(2)}`} />
          </div>

          {/* open + claimable positions */}
          <div className="mb-4"><PositionsPanel onClaimed={refresh} /></div>

          {/* ledger */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="font-display text-sm font-bold">Activity</span>
              <span className="inline-flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="font-mono">{publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}</span>
              </span>
            </div>
            <div className="divide-y divide-border">
              {rows.map((r, i) => {
                const km = kindMeta[r.kind] ?? kindMeta.bet;
                const KI = km.icon;
                const t = teams(r.fixtureId);
                const s = sign(r.kind);
                return (
                  <div key={i} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-secondary/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary " + km.cls}><KI weight="fill" size={15} /></span>
                      <div className="min-w-0">
                        <a href={`#/app/${r.fixtureId}`} className="flex items-center gap-1.5 truncate text-sm font-semibold hover:text-primary">
                          {t ? <><Flag team={t.home} /> <span className="truncate">{t.home}</span> <span className="text-muted-foreground">v</span> <span className="truncate">{t.away}</span> <Flag team={t.away} /></> : label(r.fixtureId)}
                        </a>
                        <div className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                          {r.kind}{r.outcome != null && <span> · {OUTCOME_LABELS[r.outcome]}</span>}{r.ts && <span> · {fmtTime(r.ts)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      {r.amount != null && s !== 0 && (
                        <span className={"tnum text-sm font-bold " + (s > 0 ? "text-success" : "text-foreground")}>{s > 0 ? "+" : "−"}{(r.amount ?? 0).toFixed(3)}</span>
                      )}
                      <a className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-primary"
                        href={`https://explorer.solana.com/tx/${r.sig}?cluster=devnet`} target="_blank" rel="noreferrer">
                        {r.sig.slice(0, 4)}… <ArrowSquareOut size={11} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </section>
  );
}
