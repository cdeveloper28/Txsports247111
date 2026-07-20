import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowLeft, X, Drop, SealCheck, Trophy, Circle } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { Pitch } from "./Pitch";

// First-visit tour, framed as a pre-match briefing: five pages on a match clock
// (0' kickoff talk, 15' test SOL, 30' staking, 60' watching, 90' proof and payout).
// Shown once per browser; Skip, Esc, backdrop and arrow keys all behave.

const SEEN_KEY = "txs_tour_v1";
const FAUCET_URL = "https://j.tools/en/tools/devnet-faucet";
const HOME = "#4f7cff", DRAW = "#f6b73c", AWAY = "#f2685f", WIN = "#2fbf7f";
const PITCH_BG = "hsl(150 16% 6.5%)";
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;

/* ---------------- illustrations (one per slide, all on the pitch panel) ---------------- */

function ArtWelcome() {
  return (
    <div className="h-full w-full">
      <Pitch probs={[44, 29, 27]} live />
    </div>
  );
}

function ArtDevnet() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="relative">
        <span className="ob-ripple absolute inset-0 rounded-full border-2 border-primary/50" aria-hidden />
        <span className="ob-ripple2 absolute inset-0 rounded-full border-2 border-primary/30" aria-hidden />
        <div className="relative grid h-24 w-24 place-items-center rounded-full border border-primary/50 bg-primary/10">
          <span className="font-display text-3xl font-bold text-foreground">◎</span>
        </div>
        <span className="absolute -right-16 top-1 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">
          <Drop weight="fill" size={11} /> free
        </span>
      </div>
    </div>
  );
}

function ArtStake() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-10">
      <div className="ob-coin mb-3 self-end rounded-full border border-danger/50 bg-danger/15 px-2.5 py-1 text-[11px] font-bold text-danger" style={mono}>
        +◎0.5 Away
      </div>
      <div className="flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full">
        <div className="ob-seg-h h-full rounded-l-full" style={{ background: HOME }} />
        <div className="h-full" style={{ background: DRAW, width: "27%" }} />
        <div className="ob-seg-a h-full rounded-r-full" style={{ background: AWAY }} />
      </div>
      <div className="mt-3 flex w-full justify-between text-[11px] text-muted-foreground" style={mono}>
        <span>Home</span><span>Draw</span><span>Away</span>
      </div>
    </div>
  );
}

function ArtWatch() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-10">
      <span className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-bold text-danger">
        <Circle weight="fill" size={7} className="animate-pulseDot" /> LIVE
      </span>
      <div className="relative w-full">
        <div className="h-px w-full bg-border" />
        <span className="ob-ball absolute -top-[7px] grid h-4 w-4 place-items-center rounded-full bg-white shadow" aria-hidden>
          <span className="h-1.5 w-1.5 rounded-full bg-black/70" />
        </span>
      </div>
      <div className="mt-3 flex w-full justify-between text-[11px] text-muted-foreground" style={mono}>
        <span>0'</span><span>45'</span><span>FT</span>
      </div>
    </div>
  );
}

function ArtProof() {
  return (
    <div className="grid h-full w-full place-items-center">
      <svg viewBox="0 0 240 110" className="h-full max-h-[130px] w-auto" aria-hidden>
        <path d="M60 88 L120 55 L180 22" stroke={WIN} strokeWidth="2.25" fill="none" strokeLinecap="round" className="ob-proofpath" />
        <rect x={30} y={74} width="60" height="28" rx="8" fill={PITCH_BG} stroke={WIN} strokeWidth="2" />
        <text x={60} y={92} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-foreground" style={mono}>2:2</text>
        <circle cx={120} cy={55} r="13" fill={PITCH_BG} stroke="#5b86ff" strokeWidth="1.5" strokeDasharray="3 3.5" />
        <text x={120} y={59} textAnchor="middle" fontSize="11" className="fill-muted-foreground" style={mono}>#</text>
        <rect x={150} y={8} width="60" height="28" rx="8" fill={PITCH_BG} stroke={WIN} strokeWidth="2" />
        <text x={180} y={26} textAnchor="middle" fontSize="11" fontWeight="700" className="fill-foreground" style={mono}>root</text>
      </svg>
    </div>
  );
}

/* ---------------- slides ---------------- */

const SLIDES = [
  {
    minute: "0'",
    kicker: "The briefing",
    title: "No bookmaker on this pitch.",
    body: "Txsports is a parimutuel prediction market for the World Cup. Bettors price each other, funds sit in a Solana program nobody controls, and a cryptographic proof of the real score settles every market.",
    art: <ArtWelcome />,
  },
  {
    minute: "15'",
    kicker: "Test currency",
    title: "You play with free devnet SOL.",
    body: "Everything here is a real on-chain transaction on Solana Devnet, but the SOL is test currency with no monetary value. Grab some from the faucet, set your wallet to Devnet, and play the full product risk free.",
    art: <ArtDevnet />,
    link: { href: FAUCET_URL, label: "Get test SOL" },
  },
  {
    minute: "30'",
    kicker: "Staking",
    title: "Your stake is the whole order.",
    body: "Pick Home, Draw or Away and stake. There is no order book: your SOL joins that outcome's pool, live odds are each pool's share of the total, and you can cancel for a full refund any time before kickoff.",
    art: <ArtStake />,
  },
  {
    minute: "60'",
    kicker: "Match time",
    title: "Kick off and watch it play.",
    body: "Simulations replay a finished match's real data to full time. Real fixtures lock at kickoff, then stream live scores and prices, so nobody can bet with the result already known.",
    art: <ArtWatch />,
  },
  {
    minute: "90'",
    kicker: "Settlement",
    title: "The proof pays you, not a person.",
    body: "At full time anyone submits the match's Merkle score proof. The program verifies it against the root anchored on-chain and winners split the entire pool. No oracle, no admin key, no one to trust.",
    art: <ArtProof />,
  },
];

/* ---------------- carousel ---------------- */

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [[i, dir], setPos] = useState<[number, number]>([0, 0]);
  const reduced = useReducedMotion();

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch { /* private mode */ }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ }
  };
  const go = (next: number) => {
    if (next < 0 || next >= SLIDES.length) return;
    setPos([next, next > i ? 1 : -1]);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i]);

  if (!open) return null;
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  const slideVariants = {
    enter: (d: number) => (reduced ? { opacity: 0 } : { x: d * 46, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => (reduced ? { opacity: 0 } : { x: d * -46, opacity: 0 }),
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <style>{`
        .ob-ripple { animation: obRipple 2.2s ease-out infinite; }
        .ob-ripple2 { animation: obRipple 2.2s 1.1s ease-out infinite; }
        @keyframes obRipple { 0% { transform: scale(1); opacity: .8 } 100% { transform: scale(1.9); opacity: 0 } }
        .ob-coin { animation: obCoin 3s ease-in-out infinite; }
        @keyframes obCoin { 0%,55% { transform: translateY(0); opacity:1 } 72%,80% { transform: translateY(18px); opacity:0 } 81% { transform: translateY(-6px); opacity:0 } 95%,100% { transform: translateY(0); opacity:1 } }
        .ob-seg-h { width: 46%; animation: obSegH 3s ease-in-out infinite; }
        .ob-seg-a { width: 27%; animation: obSegA 3s ease-in-out infinite; }
        @keyframes obSegH { 0%,70% { width:46% } 82%,90% { width:41% } 100% { width:46% } }
        @keyframes obSegA { 0%,70% { width:27% } 82%,90% { width:32% } 100% { width:27% } }
        .ob-ball { animation: obBall 4s ease-in-out infinite; left: 0%; }
        @keyframes obBall { 0% { left: 0% } 48%,54% { left: 47% } 100% { left: calc(100% - 16px) } }
        .ob-proofpath { stroke-dasharray: 150; stroke-dashoffset: 150; animation: obDraw 2.8s ease-in-out infinite; }
        @keyframes obDraw { 0% { stroke-dashoffset:150 } 55%,85% { stroke-dashoffset:0 } 100% { stroke-dashoffset:0; opacity:.3 } }
        @media (prefers-reduced-motion: reduce) {
          .ob-ripple,.ob-ripple2,.ob-coin,.ob-seg-h,.ob-seg-a,.ob-ball,.ob-proofpath { animation: none; }
          .ob-proofpath { stroke-dashoffset: 0; }
          .ob-ball { left: calc(100% - 16px); }
        }
      `}</style>

      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />

      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        role="dialog" aria-modal="true" aria-label="Welcome tour"
      >
        {/* illustration stage on the pitch panel */}
        <div className="relative h-44 overflow-hidden sm:h-48" style={{ background: PITCH_BG }}>
          <AnimatePresence custom={dir} mode="popLayout" initial={false}>
            <motion.div key={i} custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit"
              transition={reduced ? { duration: 0.18 } : { type: "spring", stiffness: 380, damping: 34 }}
              className="absolute inset-0">
              {s.art}
            </motion.div>
          </AnimatePresence>
          <button onClick={dismiss} aria-label="Skip tour"
            className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-background/60 text-muted-foreground backdrop-blur transition-colors hover:text-foreground">
            <X size={15} weight="bold" />
          </button>
        </div>

        {/* copy */}
        <div className="min-h-[190px] px-6 pb-2 pt-5 sm:px-7">
          <AnimatePresence custom={dir} mode="popLayout" initial={false}>
            <motion.div key={i} custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit"
              transition={reduced ? { duration: 0.18 } : { type: "spring", stiffness: 380, damping: 36 }}>
              <div className="flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <span className="tnum rounded bg-secondary px-1.5 py-0.5 font-bold text-foreground">{s.minute}</span>
                {s.kicker}
              </div>
              <h2 className="mt-2.5 font-display text-2xl font-bold">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              {s.link && (
                <a href={s.link.href} target="_blank" rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  <Drop weight="fill" size={15} /> {s.link.label}
                </a>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* footer: match-clock progress + controls */}
        <div className="flex items-center justify-between gap-4 px-6 pb-5 pt-3 sm:px-7">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Tour progress">
            {SLIDES.map((sl, k) => (
              <button key={k} role="tab" aria-selected={k === i} aria-label={`Minute ${sl.minute}`}
                onClick={() => go(k)}
                className={"h-1.5 rounded-full transition-all duration-300 " + (k === i ? "w-7 bg-primary" : k < i ? "w-3 bg-primary/50" : "w-3 bg-secondary hover:bg-accent")} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <Button variant="ghost" size="sm" onClick={() => go(i - 1)} aria-label="Back">
                <ArrowLeft weight="bold" size={15} />
              </Button>
            )}
            {last ? (
              <Button size="sm" onClick={dismiss}>
                <Trophy weight="fill" size={15} /> Kick off
              </Button>
            ) : (
              <Button size="sm" onClick={() => go(i + 1)}>
                Next <ArrowRight weight="bold" size={15} />
              </Button>
            )}
          </div>
        </div>

        {/* settlement seal, only on the last page */}
        {last && (
          <div className="flex items-center justify-center gap-1.5 border-t border-border py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <SealCheck weight="fill" size={12} className="text-success" /> settled by proof · no house · no admin key
          </div>
        )}
      </motion.div>
    </div>,
    document.body
  );
}
