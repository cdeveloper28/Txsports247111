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
      <div className="container relative z-10 pt-12 sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end"
        >
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              TxLINE Merkle proofs · anchored on Solana
            </p>
            <h1 className="mt-5 text-balance font-display text-5xl font-bold leading-[0.98] tracking-tight sm:text-6xl xl:text-[5.25rem]">
              Bet the World Cup.
              <br />
              <span className="text-primary">Settled by proof.</span>
            </h1>
          </div>

          <div className="max-w-md lg:justify-self-end lg:pb-2 lg:text-right">
            <p className="text-pretty text-[15px] leading-relaxed text-muted-foreground">
              Stake native SOL on match outcomes. At full time, <b className="text-foreground">anyone</b> settles
              the market with a TxLINE Merkle proof of the real score. No bookmaker, no oracle, no admin key.
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
      <div className="container relative z-10 mt-8">
        <BetsMarquee />
      </div>

      {/* The product itself - real markets page, its own baked-in ticker cropped off the top */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1 }}
        className="container relative z-10 mt-8 pb-12"
      >
        <div className="relative overflow-hidden rounded-xl border border-border bg-[#0b0c0e] shadow-2xl">
          <div className="max-h-[540px] overflow-hidden">
            <img
              src="/shots/markets.png"
              alt="Txsports markets - every World Cup fixture as an on-chain parimutuel pool"
              className="-mt-[2.4%] block w-full"
              loading="eager"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background" />
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5" />
        </div>
      </motion.div>
    </section>
  );
}
