import { motion } from "framer-motion";
import { ArrowRight, SealCheck, Scales, Lightning, ShieldCheck, Circle } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { BetsMarquee } from "./BetsMarquee";
import { Flag } from "./Flag";
import ReactiveLines from "./ReactiveLines";

const chips = [
  { icon: SealCheck, label: "No oracle" },
  { icon: Scales, label: "No bookmaker" },
  { icon: Lightning, label: "Permissionless settlement" },
];

/** A floating product preview - a premium snapshot of a live market, used as the hero visual. */
function MarketPreview() {
  const rows = [
    { lbl: "Brazil", pct: 47, odd: "2.12", team: "Brazil" },
    { lbl: "Draw", pct: 27, odd: "3.70", team: "" },
    { lbl: "Argentina", pct: 26, odd: "3.85", team: "Argentina" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="pointer-events-none absolute -inset-8 rounded-[2.5rem] bg-primary/20 blur-3xl" aria-hidden />
      <div className="relative rounded-2xl border border-border bg-card/85 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">World Cup · Group C</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-bold text-danger">
            <Circle weight="fill" size={7} className="animate-pulseDot" /> LIVE 63'
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-2 font-display text-base font-bold"><Flag team="Brazil" big /> <span className="truncate">Brazil</span></span>
          <span className="tnum shrink-0 rounded-lg border border-border bg-secondary px-3 py-1 font-display text-xl font-bold tracking-wider">1 : 1</span>
          <span className="inline-flex min-w-0 items-center justify-end gap-2 font-display text-base font-bold"><span className="truncate">Argentina</span> <Flag team="Argentina" big /></span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {rows.map((r, i) => (
            <div key={i} className={"rounded-xl border p-3 text-center " + (i === 0 ? "border-primary bg-primary/5" : "border-border bg-secondary/40")}>
              <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                {r.team ? <><Flag team={r.team} /> <span className="truncate">{r.lbl}</span></> : r.lbl}
              </div>
              <div className="tnum mt-0.5 font-display text-lg font-bold">{r.pct}%</div>
              <div className="tnum text-[10px] text-muted-foreground">{r.odd}×</div>
            </div>
          ))}
        </div>

        {/* probability split bar */}
        <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          <div className="h-full rounded-l-full bg-primary" style={{ width: "47%" }} />
          <div className="h-full bg-amber-400" style={{ width: "27%" }} />
          <div className="h-full rounded-r-full bg-danger" style={{ width: "26%" }} />
        </div>

        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Pool <b className="tnum text-foreground">18.4 SOL</b></span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2 py-1 font-semibold text-success">
            <SealCheck weight="fill" size={12} /> Merkle-settled
          </span>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* OriginKit reactive-lines curtain - phantom black + blue accent */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <ReactiveLines
          backgroundColor="rgb(13, 14, 16)"
          lineColor="rgba(99, 142, 255, 0.42)"
          lineWidth={1}
          minLines={2}
          maxLines={44}
          fade
          fadeIntensity={24}
        />
        {/* blend the curtain into the page + keep the left copy legible */}
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-transparent to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/45 to-transparent" />
      </div>

      <div className="container relative z-10 grid items-center gap-12 pb-14 pt-20 sm:pt-28 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20">
        {/* LEFT - copy */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-xl"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-[13px] font-medium text-muted-foreground backdrop-blur">
            <ShieldCheck weight="fill" size={14} className="text-primary" />
            Powered by TxLINE · anchored on Solana
          </span>

          <h1 className="mt-6 text-balance font-display text-4xl font-extrabold leading-[1.03] sm:text-6xl">
            Bet the World Cup.
            <br />
            <span className="bg-gradient-to-r from-primary to-[#9db8ff] bg-clip-text text-transparent">Settled by proof.</span>
          </h1>

          <p className="mt-6 max-w-md text-pretty text-[17px] leading-relaxed text-muted-foreground">
            Stake native SOL on match outcomes. When the whistle blows, <b className="text-foreground">anyone</b> settles
            the market from a TxLINE Merkle proof of the real result. No bookmaker, no oracle, no admin key.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <a href="#/app">Predict now <ArrowRight weight="bold" size={18} /></a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how">How it works</a>
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            {chips.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground backdrop-blur"
              >
                <Icon weight="bold" size={15} className="text-foreground" />
                {label}
              </div>
            ))}
          </div>
        </motion.div>

        {/* RIGHT - floating product preview */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <MarketPreview />
        </motion.div>
      </div>

      <div className="container relative z-10">
        <BetsMarquee />
      </div>
    </section>
  );
}
