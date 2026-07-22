import { motion } from "framer-motion";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { BetsMarquee } from "./BetsMarquee";
import { FlipWords } from "./ui/flip-words";
import LineRippleBackground from "./LineRippleBackground";
import { HeroCarousel } from "./HeroCarousel";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* Editorial split: oversized headline left, supporting copy + CTAs right */}
      <div className="relative z-10 w-full px-5 sm:px-8 lg:px-12 xl:px-16 pt-12 sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end"
        >
          <div>
            <p className="flex flex-wrap items-center gap-2.5 font-mono text-xs font-small uppercase tracking-[0.22em] text-muted-foreground">
             
              <span>powered by</span>
              <img src="/txodds.png" alt="TxODDS" className="h-6 shrink-0 object-contain" />
               <span className="text-foreground">Odds</span>
            </p>
            {/* px/vw sizes on purpose: rem-based type inflates with browser font-size settings and
                wraps the lines; min() keeps each line on one line at every viewport */}
            <h1 className="mt-5 font-display text-[24px] font-bold leading-[0.98] tracking-tight sm:text-[34px] lg:text-[min(78px,5.4vw)]">
              <FlipWords words={["Trustless", "Permissionless"]} className="text-foreground" />
              <br />
              <span className="text-primary">Prediction Market.</span>
            </h1>
          </div>

          <div className="max-w-md lg:justify-self-end lg:pb-3 lg:text-right">
            <p className="text-pretty text-[15px] leading-relaxed text-muted-foreground">
              Bet on match outcomes.<b className="text-foreground"></b> settle
              the market with a TxLINE Merkle proof of the real score.<span className="font-bold text-white">Txsports doesnt decide winning.</span> No centralized odds, no oracles, no house control.
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
      <div className="relative z-10 mt-9 w-full px-5 sm:px-8 lg:px-12 xl:px-16">
        <BetsMarquee />
      </div>

      {/* The product itself - the markets page (ticker, featured pool, market pulse) as the preview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1 }}
        className="relative z-10 w-full px-5 sm:px-8 lg:px-12 xl:px-16 pb-12 pt-16 sm:pt-14"
      >
        {/* Line-ripple field (OriginKit, lines #4E81EF) housed behind + around the framed
            screenshot only — not the whole hero. Full-width band with top padding so the ripples
            also fill the strip ABOVE the shot; the 75% screenshot sits centered on top so the
            lines read in the margins around it. Edge gradients melt it into the page. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <LineRippleBackground strokeColor="#4E81EF" backgroundColor="transparent" />
          <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-background to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
        </div>

        {/* Product showreel: real app screens cycling like a carousel. A touch larger on mobile
            (max-w-[92%]) than desktop (md:max-w-[80%]), centered so the ripple reads in the margins. */}
        <div className="relative z-10 mx-auto max-w-[92%] md:max-w-[80%]">
          <HeroCarousel />
        </div>
      </motion.div>
    </section>
  );
}
