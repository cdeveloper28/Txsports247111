import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FilmSlate, Broadcast, Users, ArrowRight, Circle } from "@phosphor-icons/react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Flag } from "./Flag";
import { Pitch } from "./Pitch";
import { useMarketStats, type MarketRow } from "../lib/onchainMarkets";
import { useLiveMatch, liveMinute } from "../lib/liveFeed";

const POOL_COLORS = ["#4f7cff", "#f6b73c", "#f2685f"]; // Home / Draw / Away - matches Pitch territory
const POOL_LABELS = ["Home", "Draw", "Away"];
const PITCH_BG = "hsl(150 16% 6.5%)";

const fmtSol = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(n < 1 ? 3 : 2));

interface FixtureMeta {
  fixtureId: number; home: string; away: string; competition?: string; competitionId?: number;
  kickoff?: number; status?: string; score?: { home: number; away: number } | null;
  odds?: [number, number, number] | null; finalOutcome?: number | null;
  featured?: boolean; simulated?: boolean; category?: "real" | "simulation";
}

const CATEGORIES = [
  { key: "simulation" as const, label: "Simulation", icon: FilmSlate,
    blurb: "Replay a past World Cup match, stake SOL, watch it play out, then settle on-chain with a real TxLINE proof." },
  { key: "real" as const, label: "Real · live", icon: Broadcast,
    blurb: "Genuinely upcoming & live fixtures from the TxLINE feed. Place real bets before the match settles." },
];

const impliedProbs = (odds?: [number, number, number] | null): [number, number, number] | null =>
  odds && odds.some((o) => o > 0) ? (odds.map((o) => (o > 0 ? 100 / o : 0)) as [number, number, number]) : null;

/** Live view of a fixture: real fixtures poll the TxODDS relay so odds/score/phase track the match. */
interface FxView {
  odds?: [number, number, number] | null;
  live: boolean;
  score: [number, number] | null;
  minute: number | null;
}
function useFixtureView(fx: FixtureMeta): FxView {
  const isReal = (fx.category ?? (fx.featured ? "simulation" : "real")) === "real";
  const { live, phase } = useLiveMatch(fx.fixtureId, isReal);
  const inMatch = phase.live || phase.ended;
  return {
    odds: (live?.odds ?? fx.odds) as [number, number, number] | null | undefined,
    live: phase.live || fx.status === "LIVE",
    score: live && inMatch ? live.score : null,
    minute: live && phase.inPlay ? liveMinute(live) : null,
  };
}

/** Home / Draw / Away implied % + odds, keyed to the pitch territory colours by a hairline rule. */
function Outcomes({ odds, size = "sm" }: { odds?: [number, number, number] | null; size?: "sm" | "lg" }) {
  const p = (i: number) => (odds && odds[i] > 0 ? 100 / odds[i] : null);
  const align = ["text-left", "text-center", "text-right"];
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {[0, 1, 2].map((i) => {
        const prob = p(i);
        return (
          <div key={i} className={align[i] + " border-t-2 pt-1.5"} style={{ borderColor: POOL_COLORS[i] + "59" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{POOL_LABELS[i]}</div>
            <div className={"tnum font-display font-bold " + (size === "lg" ? "text-xl" : "text-[15px]")}>
              {prob != null ? `${prob.toFixed(1)}%` : "-"}
            </div>
            <div className="tnum text-[11px] text-muted-foreground">
              {odds && odds[i] > 0 ? `${odds[i].toFixed(2)}×` : " "}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Real staked split as a single hairline - volume and bettor count on the right. */
function CrowdLine({ row }: { row?: MarketRow }) {
  if (!row || row.total <= 0) {
    return <div className="text-[11px] text-muted-foreground/60">No bets yet - the pool opens at your stake.</div>;
  }
  const seg = (i: number) => (row.pools[i] / row.total) * 100;
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-1 flex-1 gap-px overflow-hidden rounded-full">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${seg(i)}%`, background: POOL_COLORS[i] }} />
        ))}
      </div>
      <span className="tnum inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">◎ {fmtSol(row.total)}</span>
        <Users size={11} weight="bold" /> {row.bettors}
      </span>
    </div>
  );
}

function LiveChip({ score, minute }: { score?: [number, number] | null; minute?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-bold text-danger backdrop-blur">
      <Circle weight="fill" size={7} className="animate-pulseDot" /> LIVE
      {score && <span className="tnum text-foreground">{score[0]} : {score[1]}</span>}
      {minute != null && <span className="tnum text-danger/80">{minute}'</span>}
    </span>
  );
}

function PitchBand({ fx, view, tall = false }: { fx: FixtureMeta; view: FxView; tall?: boolean }) {
  const isSim = (fx.category ?? (fx.featured ? "simulation" : "real")) === "simulation";
  const dt = fx.kickoff ? new Date(fx.kickoff) : null;
  return (
    <div
      className={"relative flex items-center overflow-hidden rounded-lg " + (tall ? "h-full min-h-[200px]" : "")}
      style={{ background: PITCH_BG }}
    >
      <div className={"w-full " + (tall ? "" : "aspect-[2.3/1]")} style={tall ? { aspectRatio: "2.1/1" } : undefined}>
        <Pitch probs={impliedProbs(view.odds)} live={view.live} />
      </div>
      <div className="absolute inset-0 grid place-items-center">
        {view.live ? (
          <LiveChip score={view.score} minute={view.minute} />
        ) : !isSim && dt ? (
          <span className="rounded-md bg-background/60 px-2.5 py-1 font-display text-sm font-bold backdrop-blur-sm">
            {dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Eyebrow({ fx, live }: { fx: FixtureMeta; live: boolean }) {
  const isSim = (fx.category ?? (fx.featured ? "simulation" : "real")) === "simulation";
  const dt = fx.kickoff ? new Date(fx.kickoff) : null;
  return (
    <div className="flex items-center justify-between font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      <span>{fx.competition ?? "World Cup"}</span>
      {live ? (
        <span className="inline-flex items-center gap-1.5 font-bold text-danger">
          <Circle weight="fill" size={6} className="animate-pulseDot" /> Live
        </span>
      ) : isSim ? (
        <span className="inline-flex items-center gap-1"><FilmSlate weight="fill" size={11} /> Replay</span>
      ) : dt ? (
        <span>{dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
      ) : null}
    </div>
  );
}

function TeamsRow({ fx, size = "sm" }: { fx: FixtureMeta; size?: "sm" | "lg" }) {
  const nameCls = size === "lg" ? "font-display text-xl font-bold" : "font-display text-[14px] font-bold";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex min-w-0 items-center gap-2">
        <Flag team={fx.home} big={size === "lg"} />
        <span className={"truncate " + nameCls}>{fx.home}</span>
      </span>
      <span className="shrink-0 px-1 text-[11px] font-semibold text-muted-foreground">v</span>
      <span className="inline-flex min-w-0 items-center justify-end gap-2">
        <span className={"truncate text-right " + nameCls}>{fx.away}</span>
        <Flag team={fx.away} big={size === "lg"} />
      </span>
    </div>
  );
}

function FixtureCard({ fx, row }: { fx: FixtureMeta; row?: MarketRow }) {
  const view = useFixtureView(fx);
  return (
    <a href={`#/app/${fx.fixtureId}`} className="group block h-full">
      <Card className="flex h-full flex-col gap-3 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
        <Eyebrow fx={fx} live={view.live} />
        <PitchBand fx={fx} view={view} />
        <TeamsRow fx={fx} />
        <Outcomes odds={view.odds} />
        <div className="mt-auto pt-0.5">
          <CrowdLine row={row} />
        </div>
      </Card>
    </a>
  );
}

/** Wide feature card - the eyebrow names the reason it leads (live now / biggest pool / next kickoff). */
function HeroCard({ fx, row, reason }: { fx: FixtureMeta; row?: MarketRow; reason: string }) {
  const view = useFixtureView(fx);
  return (
    <a href={`#/app/${fx.fixtureId}`} className="group block">
      <Card className="grid overflow-hidden p-0 transition-all hover:border-primary/40 hover:shadow-lg lg:grid-cols-[1.15fr_1fr]">
        <div className="p-4 lg:pr-0">
          <PitchBand fx={fx} view={view} tall />
        </div>
        <div className="flex flex-col gap-4 p-5 lg:p-6">
          <div className="flex items-center justify-between font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
            <span className={view.live ? "font-bold text-danger" : "text-primary"}>{view.live ? "● Live now" : reason}</span>
            <span className="text-muted-foreground">{fx.competition ?? "World Cup"}</span>
          </div>
          <TeamsRow fx={fx} size="lg" />
          <Outcomes odds={view.odds} size="lg" />
          <CrowdLine row={row} />
          <div className="mt-auto pt-1">
            <Button className="w-full sm:w-auto">
              Open market <ArrowRight weight="bold" size={16} />
            </Button>
          </div>
        </div>
      </Card>
    </a>
  );
}

export function MarketsGrid() {
  const [fixtures, setFixtures] = useState<FixtureMeta[]>([]);
  const [category, setCategory] = useState<"real" | "simulation">("simulation");
  const [loading, setLoading] = useState(true);
  const { stats } = useMarketStats();

  useEffect(() => {
    fetch("/fixtures.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: FixtureMeta[]) => setFixtures(Array.isArray(list) ? list : []))
      .catch(() => setFixtures([]))
      .finally(() => setLoading(false));
  }, []);

  const cat = (f: FixtureMeta) => f.category ?? (f.featured ? "simulation" : "real");
  const shown = useMemo(() => {
    let list = fixtures.filter((f) => cat(f) === category);
    if (category === "real") list = list.filter((f) => f.status === "LIVE" || f.status === "UPCOMING");
    return list.sort((a, b) =>
      (a.status === "LIVE" ? -1 : 0) - (b.status === "LIVE" ? -1 : 0) || (a.kickoff || 0) - (b.kickoff || 0)
    );
  }, [fixtures, category]);

  /** The match that leads the page, and why. */
  const feature = useMemo(() => {
    if (shown.length < 2) return null;
    const live = shown.find((f) => f.status === "LIVE");
    if (live) return { fx: live, reason: "Live now" };
    const byPool = [...shown].sort(
      (a, b) => (stats.byFixture[b.fixtureId]?.total ?? 0) - (stats.byFixture[a.fixtureId]?.total ?? 0)
    )[0];
    if (byPool && (stats.byFixture[byPool.fixtureId]?.total ?? 0) > 0) return { fx: byPool, reason: "Biggest pool" };
    return { fx: shown[0], reason: category === "real" ? "Next kickoff" : "Featured replay" };
  }, [shown, stats, category]);

  const rest = feature ? shown.filter((f) => f.fixtureId !== feature.fx.fixtureId) : shown;

  const count = (key: "real" | "simulation") =>
    fixtures.filter((f) => cat(f) === key && (key === "simulation" || f.status === "LIVE" || f.status === "UPCOMING")).length;

  const active = CATEGORIES.find((c) => c.key === category)!;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">World Cup markets</h1>
          <motion.p key={category} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
            className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {active.blurb}
          </motion.p>
        </div>

        {/* category toggle - sliding pill */}
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const on = category === c.key;
            return (
              <button key={c.key} onClick={() => setCategory(c.key)}
                className={"relative inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors " +
                  (on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {on && (
                  <motion.span layoutId="market-tab-pill" className="absolute inset-0 -z-0 rounded-lg bg-primary"
                    transition={{ type: "tween", duration: 0.2, ease: "easeOut" }} />
                )}
                <span className="relative z-10 inline-flex items-center gap-2">
                  <Icon weight={on ? "fill" : "regular"} size={16} /> {c.label}
                  <span className={"tnum text-xs " + (on ? "opacity-80" : "opacity-60")}>{count(c.key)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Card className="h-64 animate-pulse bg-secondary/40" />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-72 animate-pulse bg-secondary/40" />)}
          </div>
        </div>
      ) : (
        <motion.div key={category} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
          {shown.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              {category === "real"
                ? "No live or upcoming real fixtures in the feed right now. Try the Simulation tab to bet on a past World Cup match."
                : "No simulation markets loaded. Run scripts/fetch-fixtures.ts, capture-matchday.sh and rebuild_matchday.py."}
            </Card>
          ) : (
            <div className="space-y-4">
              {feature && <HeroCard fx={feature.fx} row={stats.byFixture[feature.fx.fixtureId]} reason={feature.reason} />}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {rest.map((fx) => <FixtureCard key={fx.fixtureId} fx={fx} row={stats.byFixture[fx.fixtureId]} />)}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
