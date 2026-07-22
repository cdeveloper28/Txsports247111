import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { ArrowSquareOut, Receipt, Confetti, TreeStructure } from "@phosphor-icons/react";
import { Flag } from "./Flag";
import { Modal } from "./ui/modal";
import { LazyProofInspector } from "./ProofInspector";
import { OUTCOME_LABELS, LIQUIDITY_WALLET } from "../config";
import { fetchRecentBets, type OnchainBet } from "../lib/onchainBets";
import { fetchRecentTrades } from "../lib/supabase";
import { useMarketStats } from "../lib/onchainMarkets";
import { SolanaLogo } from "./SolanaLogo";

type Fx = { home: string; away: string };

const DOT = ["#4f7cff", "#f6b73c", "#f2685f"]; // Home / Draw / Away
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const teamFor = (fx: Fx | undefined, o: number) =>
  o === 1 ? "the Draw" : !fx ? (o === 0 ? "Home" : "Away") : o === 0 ? fx.home : fx.away;
const flagTeam = (fx: Fx | undefined, o: number) => (!fx || o === 1 ? undefined : o === 0 ? fx.home : fx.away);
const ago = (ts: number) => {
  if (!ts) return "";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const Row = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-muted-foreground">{k}</span>
    <span className="text-right">{v}</span>
  </div>
);

/** A polished, ticket-style receipt for a single on-chain bet, with a Solscan link. */
function BetReceipt({ bet, fx, onClose }: { bet: OnchainBet; fx?: Fx; onClose: () => void }) {
  const [inspect, setInspect] = useState(false);
  const team = flagTeam(fx, bet.outcome);
  const pick = teamFor(fx, bet.outcome);
  // Solana Explorer, not Solscan: Solscan discontinued devnet, its links 404 there.
  const solscan = `https://explorer.solana.com/tx/${bet.sig}?cluster=devnet`;
  const when = new Date(bet.ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  // Market outcome (from the shared on-chain stats cache): did this pick win?
  const { stats } = useMarketStats();
  const mkt = stats.byMarket[bet.market];
  const resolved = !!mkt?.resolved;
  const won = resolved && mkt!.winningOutcome === bet.outcome;
  const status = resolved ? (won ? "WON" : "LOST") : "OPEN";
  const statusCls = resolved
    ? won ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
    : "bg-primary/15 text-primary";
  return (
    <Modal open onClose={onClose}>
      <div className="-m-6">
        {/* banner */}
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent px-6 pb-5 pt-6">
          <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-primary/20 blur-2xl" />
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary">
            <Receipt weight="fill" size={14} /> Bet receipt
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 font-display text-sm font-bold">
              {fx ? <><Flag team={fx.home} /> <span className="truncate">{fx.home}</span></> : <span className="font-mono">{short(bet.market)}</span>}
            </span>
            {fx && <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">vs</span>}
            {fx && (
              <span className="inline-flex min-w-0 items-center justify-end gap-2 font-display text-sm font-bold">
                <span className="truncate">{fx.away}</span> <Flag team={fx.away} />
              </span>
            )}
          </div>
        </div>

        {/* pick + amount */}
        <div className="px-6 py-6 text-center">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Backed {OUTCOME_LABELS[bet.outcome]}</div>
          <div className="mt-1.5 inline-flex items-center gap-2 font-display text-2xl font-black">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DOT[bet.outcome] ?? "#888" }} />
            {team && <Flag team={team} big />} {pick}
          </div>
          <div className="tnum mt-3 flex items-center justify-center gap-2 font-display text-3xl font-black text-primary">
            <SolanaLogo size={22} /> {bet.amount.toFixed(3)}<span className="text-base font-bold text-muted-foreground">SOL</span>
          </div>
          <div className={"mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold tracking-wide " + statusCls}>
            {status === "OPEN" ? "MARKET OPEN" : (
              <>
                {status} ·
                {flagTeam(fx, mkt!.winningOutcome) && <Flag team={flagTeam(fx, mkt!.winningOutcome)} />}
                <span>{mkt!.winningOutcome === 1 ? "Draw" : `${teamFor(fx, mkt!.winningOutcome)} won`}</span>
              </>
            )}
          </div>
        </div>

        <div className="mx-6 border-t border-dashed border-border" />

        {/* details */}
        <div className="space-y-2.5 px-6 py-5 text-sm">
          <Row k="Outcome" v={resolved
            ? <span className={"inline-flex items-center gap-1.5 font-semibold " + (won ? "text-success" : "text-danger")}>
                {won ? "Won" : "Lost"} · settled {mkt!.winningOutcome === 1 ? "Draw" : <>
                  {flagTeam(fx, mkt!.winningOutcome) && <Flag team={flagTeam(fx, mkt!.winningOutcome)} />} {teamFor(fx, mkt!.winningOutcome)}
                </>} ({OUTCOME_LABELS[mkt!.winningOutcome]})
              </span>
            : <span className="text-muted-foreground">Pending - market open</span>} />
          <Row k="Bettor" v={<span className="font-mono text-xs">{short(bet.bettor)}</span>} />
          <Row k="Placed" v={when} />
          <Row k="Network" v="Solana Devnet" />
          <Row k="Signature" v={<span className="font-mono text-xs">{bet.sig.slice(0, 8)}…{bet.sig.slice(-8)}</span>} />
        </div>

        <div className="px-6 pb-6">
          <a href={solscan} target="_blank" rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-display text-sm font-bold text-primary-foreground transition hover:brightness-110">
            View transaction on Explorer <ArrowSquareOut weight="bold" size={16} />
          </a>
          {resolved && mkt?.fixtureId != null && (
            <button type="button" onClick={() => setInspect(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-success/30 bg-success/[0.06] px-4 py-2.5 text-sm font-semibold text-success transition hover:border-success/60">
              <TreeStructure weight="fill" size={15} /> Inspect the settlement proof
            </button>
          )}
          <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
            <Confetti size={12} weight="fill" /> Settled trustlessly by on-chain proof
          </div>
        </div>
      </div>
      {inspect && mkt?.fixtureId != null && (
        <LazyProofInspector fixtureId={mkt.fixtureId} onClose={() => setInspect(false)} />
      )}
    </Modal>
  );
}

/** Full-width ticker of the latest bets placed across every market. Reads Supabase's durable `trades`
 *  table first (falls back to live on-chain reads when it's empty). `bar` renders the strip under the
 *  navbar; otherwise it's the hero ticker. Both ends fade so items glide in and out. */
export function BetsMarquee({ bar = false }: { bar?: boolean }) {
  const { connection } = useConnection();
  const [teams, setTeams] = useState<Record<number, Fx>>({});
  const [bets, setBets] = useState<OnchainBet[]>([]);
  const [sel, setSel] = useState<OnchainBet | null>(null);

  useEffect(() => {
    fetch("/fixtures.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: any[]) => {
        const t: Record<number, Fx> = {};
        for (const f of list) t[f.fixtureId] = { home: f.home, away: f.away };
        setTeams(t);
      })
      .catch(() => {});
  }, []);

  // Map every decodable on-chain market back to its fixture's teams. Built from the shared
  // stats cache (self-refreshing), so new markets get names without a reload; orphaned
  // pre-upgrade markets never decode and simply stay unmapped.
  const { stats } = useMarketStats();
  const byMarket = useMemo(() => {
    const m: Record<string, Fx> = {};
    for (const [pk, row] of Object.entries(stats.byMarket)) {
      const t = teams[row.fixtureId];
      if (t) m[pk] = t;
    }
    return m;
  }, [stats, teams]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      // Latest 50 from the database, merged with a live chain read (Supabase only refreshes when
      // the indexer runs - the browser can't write it - so the chain surfaces brand-new bets).
      const [remote, chain] = await Promise.all([
        fetchRecentTrades(50).catch(() => [] as OnchainBet[]),
        fetchRecentBets(connection, 14).catch(() => [] as OnchainBet[]),
      ]);
      const merged = [...new Map([...remote, ...chain].map((b) => [b.sig, b])).values()]
        .filter((b) => b.bettor !== LIQUIDITY_WALLET) // hide pool-seeding ops - only real user bets
        .sort((a, b) => b.ts - a.ts);
      if (alive && merged.length) setBets(merged.slice(0, 24));
    };
    load();
    const t = setInterval(load, 5 * 60_000); // refresh every 5 minutes
    return () => { alive = false; clearInterval(t); };
  }, [connection]);

  // Only show bets we can name: trades against orphaned pre-upgrade markets have no team mapping
  // and would render as bare "Home/Away" noise.
  const shown = bets.filter((b) => byMarket[b.market]);
  if (shown.length === 0) return null;

  // Duplicate the row so the translateX(-50%) loop is seamless.
  const items = [...shown, ...shown];

  return (
    <div className={"relative flex items-center " + (bar ? "border-b border-border bg-card/40 px-4 py-1.5 sm:px-6" : "mt-12")}>
      {/* masked, scrolling track - items fade in at the left edge, out at the right */}
      <div className="marquee-wrap marquee-mask relative min-w-0 flex-1 overflow-hidden">
        <div className="flex w-max animate-marquee items-center gap-2">
          {items.map((b, i) => {
            const fx = byMarket[b.market];
            const team = flagTeam(fx, b.outcome);
            const t = ago(b.ts);
            const c = DOT[b.outcome] ?? "#888";
            const body = (
              <>
                {/* flat outcome accent down the left edge */}
                <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: c }} />
                <span className="font-mono text-[11px] text-muted-foreground">{short(b.bettor)}</span>
                <span className="text-muted-foreground/70">backed</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  {team && <Flag team={team} />}{teamFor(fx, b.outcome)}
                </span>
                <span className="tnum flex items-center gap-1.5 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  <SolanaLogo size={11} /> {b.amount.toFixed(2)}
                </span>
                {t && <span className="pr-1 text-[10px] text-muted-foreground/80">{t}</span>}
              </>
            );
            const key = `${b.sig}-${b.outcome}-${i}`;
            const base = "relative flex shrink-0 items-center gap-2 border border-border bg-card py-1 pl-3 pr-1.5 text-[12px]";
            // Only the markets-page bar opens receipts; the hero ticker is display-only.
            return bar ? (
              <button type="button" onClick={() => setSel(b)} key={key} title="View receipt"
                className={base + " cursor-pointer transition-colors hover:border-primary/50"}>
                {body}
              </button>
            ) : (
              <span key={key} className={base}>{body}</span>
            );
          })}
        </div>
      </div>

      {bar && sel && <BetReceipt bet={sel} fx={byMarket[sel.market]} onClose={() => setSel(null)} />}
    </div>
  );
}
