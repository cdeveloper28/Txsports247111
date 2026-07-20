import { motion } from "framer-motion";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { BetsMarquee } from "./BetsMarquee";
import ReactiveLines from "./ReactiveLines";

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
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/45 to-transparent" />
      </div>

      {/* Editorial split: oversized headline left, supporting copy + CTAs right */}
      <div className="relative z-10 w-full px-[20px] pt-12 sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end"
        >
          <div>
            <p className="flex flex-wrap items-center gap-2.5 font-mono text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              <img src="/Txsports.png" alt="" className="h-6 w-6 shrink-0 object-contain" />
              <span className="text-foreground">Txsports</span>
              <span>powered by</span>
              <img src="/txodds.png" alt="TxODDS" className="h-6 shrink-0 object-contain" />
               <span className="text-foreground">Odds</span>
            </p>
            {/* px/vw sizes on purpose: rem-based type inflates with browser font-size settings and
                wraps the lines; min() keeps each line on one line at every viewport */}
            <h1 className="mt-5 font-display text-[24px] font-bold leading-[0.98] tracking-tight sm:text-[34px] lg:text-[min(100px,6.2vw)]">
             Trustless
              <br />
              <span className="text-primary">  Prediction Market.</span>
            </h1>
          </div>

          <div className="max-w-md lg:justify-self-end lg:pb-3 lg:text-right">
            <p className="text-pretty text-[15px] leading-relaxed text-muted-foreground">
              Stake SOL on match outcomes. At full time, <b className="text-foreground">anyone</b> settles
              the market with a TxLINE Merkle proof of the real score. No centralized odds, no oracles, no admin control.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 lg:justify-end">
              <Button size="lg" asChild>
                <a href="#/app">Predict now <ArrowRight weight="bold" size={18} /></a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#how">How it works</a>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Live on-chain bets ticker */}
      <div className="relative z-10 mt-9 w-full px-[20px]">
        <BetsMarquee />
      </div>

      {/* The product itself - the markets page (ticker, featured pool, market pulse) as the preview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1 }}
        className="relative z-10 mt-8 w-full px-[20px] pb-12"
      >
        <a href="#/app" className="group block">
          <div className="relative overflow-hidden rounded-xl border border-border bg-[#0b0c0e] shadow-2xl transition-colors group-hover:border-primary/40">
            {/* Full screenshot, no crop: scaled to fit the frame width and the viewport height. */}
            <img
              src="/shots/markets.png"
              alt="Txsports markets - every World Cup fixture as an on-chain parimutuel pool"
              className="mx-auto block h-auto max-h-[88vh] w-auto max-w-full object-contain"
              loading="eager"
            />
            <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5" />
          </div>
        </a>
      </motion.div>
    </section>
  );
}
