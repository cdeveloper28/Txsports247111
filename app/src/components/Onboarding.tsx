import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowLeft, X, SealCheck, Trophy, Circle } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { Pitch } from "./Pitch";
import { SolanaLogo } from "./SolanaLogo";

// First-visit tour, framed as a pre-match briefing: five pages on a match clock
// (0' kickoff talk, 15' test SOL, 30' staking, 60' watching, 90' proof and payout).
// Shown once per browser; Skip, Esc, backdrop and arrow keys all behave.

const SEEN_KEY = "txs_tour_v2";
const FAUCET_URL = "https://j.tools/en/tools/devnet-faucet";
const HOME = "#4f7cff", DRAW = "#f6b73c", AWAY = "#f2685f", WIN = "#2fbf7f";
const PITCH_BG = "hsl(150 16% 6.5%)";
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;

/* ---------------- illustrations (one per slide, all on the pitch panel) ---------------- */

/** 0' - the pitch with the data pipeline over it: TxODDS feed -> TxLINE proofs -> Solana. */
function ArtWelcome() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 opacity-70"><Pitch probs={[44, 29, 27]} live /></div>
      <div className="absolute inset-0 flex items-center justify-center px-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/80 px-1.5 py-1 backdrop-blur sm:gap-1.5 sm:px-2.5 sm:py-1.5">
            <img src="/txodds.png" alt="" className="h-3 object-contain sm:h-4" />
            <span className="text-[9px] font-bold sm:text-[11px]">TxODDS</span>
          </span>
          <span className="ob-flow h-px w-4 shrink-0 bg-gradient-to-r from-primary/20 via-primary to-primary/20 sm:w-8" aria-hidden />
          <span className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-background/80 px-1.5 py-1 backdrop-blur sm:gap-1.5 sm:px-2.5 sm:py-1.5">
            <span className="text-[9px] font-bold text-primary sm:text-[11px]">TxLINE</span>
            <span className="hidden text-[9px] text-muted-foreground sm:inline" style={mono}>proofs</span>
          </span>
          <span className="ob-flow2 h-px w-4 shrink-0 bg-gradient-to-r from-primary/20 via-primary to-primary/20 sm:w-8" aria-hidden />
          <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/80 px-1.5 py-1 backdrop-blur sm:gap-1.5 sm:px-2.5 sm:py-1.5">
            <SolanaLogo size={10} />
            <span className="text-[9px] font-bold sm:text-[11px]">Solana</span>
          </span>
        </div>
      </div>
      <span className="absolute bottom-2.5 left-0 right-0 text-center text-[9px] uppercase tracking-[0.2em] text-white/50" style={mono}>
        real sports data · verifiable on-chain
      </span>
    </div>
  );
}

/** 15' - Solana faucet filling the wallet balance (brand purple -> green, official mark). */
const SOL_PURPLE = "#9945FF", SOL_GREEN = "#14F195";

function ArtSetup() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="flex items-center gap-3 sm:gap-6">
        <div className="relative shrink-0">
          <span className="ob-ripple absolute inset-0 rounded-full border-2" style={{ borderColor: `${SOL_PURPLE}80` }} aria-hidden />
          <div className="relative grid h-14 w-14 place-items-center rounded-full border sm:h-16 sm:w-16"
            style={{ borderColor: `${SOL_PURPLE}66`, background: `linear-gradient(135deg, ${SOL_PURPLE}1f, ${SOL_GREEN}1a)` }}>
            <SolanaLogo size={26} />
          </div>
         
        </div>
        <div className="ob-flow h-px w-6 shrink-0 sm:w-10" style={{ background: `linear-gradient(90deg, ${SOL_PURPLE}22, ${SOL_GREEN}, ${SOL_PURPLE}22)` }} aria-hidden />
        <div className="w-36 rounded-xl border border-border bg-background/85 p-3 shadow-xl backdrop-blur sm:w-44 sm:p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground" style={mono}>wallet</span>
            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest"
              style={{ background: `${SOL_PURPLE}26`, color: "#c39bff" }}>devnet</span>
          </div>
          <div className="tnum mt-2 flex items-center gap-1.5 font-display text-xl font-bold sm:text-2xl">
            <SolanaLogo size={15} /> <span className="ob-count">2.00</span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground" style={mono}>free test SOL · no real value</div>
        </div>
      </div>
    </div>
  );
}

/** 30' - the three outcome tiles + your stake landing in one, pool re-weighting. */
function ArtStake() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-5 sm:px-9">
      <div className="mb-3 grid w-full grid-cols-3 gap-2">
        {[
          { l: "Home", p: "44%", c: HOME, dim: false },
          { l: "Draw", p: "29%", c: DRAW, dim: true },
          { l: "Away", p: "27%", c: AWAY, dim: false, pick: true },
        ].map((o) => (
          <div key={o.l}
            className={"relative rounded-lg border bg-background/80 px-2 py-1.5 text-center backdrop-blur " + (o.pick ? "ob-pick border-transparent" : "border-border " + (o.dim ? "opacity-70" : ""))}
            style={o.pick ? { borderColor: AWAY } : undefined}>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground" style={mono}>{o.l}</div>
            <div className="tnum font-display text-sm font-bold" style={{ color: o.c }}>{o.p}</div>
            {o.pick && (
              <span className="ob-coin absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-danger/50 bg-danger/15 px-2 py-0.5 text-[10px] font-bold text-danger" style={mono}>
                +◎0.5
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full">
        <div className="ob-seg-h h-full rounded-l-full" style={{ background: HOME }} />
        <div className="h-full" style={{ background: DRAW, width: "27%" }} />
        <div className="ob-seg-a h-full rounded-r-full" style={{ background: AWAY }} />
      </div>
      <div className="mt-2 flex w-full items-center justify-between gap-2 text-[8px] uppercase tracking-widest text-muted-foreground sm:text-[9px]" style={mono}>
        <span>one shared pool</span><span className="text-right">cancel free before kickoff</span>
      </div>
    </div>
  );
}

/** 60' - live scoreboard fed by the TxODDS stream: score, phase chips, flowing packets. */
function ArtWatch() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-5 sm:gap-3 sm:px-9">
      <div className="flex w-full max-w-[300px] items-center justify-between rounded-xl border border-border bg-background/85 px-3.5 py-2.5 shadow-xl backdrop-blur sm:px-4 sm:py-3">
        <span className="font-display text-sm font-bold">ESP</span>
        <span className="relative">
          <span className="tnum rounded-lg bg-secondary px-3 py-1 font-display text-lg font-bold tracking-widest"><span className="ob-goal">1</span> : 0</span>
        </span>
        <span className="font-display text-sm font-bold">ARG</span>
      </div>
      <div className="flex items-center gap-1.5" style={mono}>
        {["H1", "HT", "H2", "ET"].map((p, k) => (
          <span key={p} className={"rounded px-1.5 py-0.5 text-[9px] font-bold uppercase " + (k === 2 ? "bg-danger/15 text-danger" : "bg-secondary text-muted-foreground")}>
            {k === 2 && <Circle weight="fill" size={5} className="mr-1 inline animate-pulseDot" />}{p}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground" style={mono}>
        <img src="/txodds.png" alt="" className="h-3.5 object-contain" />
        <span className="ob-dots inline-flex gap-1" aria-hidden>
          <span className="h-1 w-1 rounded-full bg-primary" /><span className="h-1 w-1 rounded-full bg-primary" /><span className="h-1 w-1 rounded-full bg-primary" />
        </span>
        streaming scores · phases · odds
      </div>
    </div>
  );
}

/** 90' - the TxLINE Merkle proof path (score leaf -> hash -> anchored root) paying the winner. */
function ArtProof() {
  return (
    <div className="grid h-full w-full place-items-center">
      <svg viewBox="0 0 300 118" className="h-full max-h-[140px] w-auto" aria-hidden>
        <path d="M62 90 L128 58 L194 26" stroke={WIN} strokeWidth="2.25" fill="none" strokeLinecap="round" className="ob-proofpath" />
        <path d="M206 34 C 238 52 244 66 248 78" stroke={WIN} strokeWidth="1.75" fill="none" strokeLinecap="round" strokeDasharray="3 4" className="ob-proofpath2" />
        <rect x={30} y={76} width="64" height="28" rx="8" fill={PITCH_BG} stroke={WIN} strokeWidth="2" />
        <text x={62} y={90} textAnchor="middle" fontSize="11" fontWeight="700" className="fill-foreground" style={mono}>1:0 FT</text>
        <text x={62} y={100} textAnchor="middle" fontSize="6.5" className="fill-muted-foreground" style={mono}>score leaf</text>
        <circle cx={128} cy={58} r="13" fill={PITCH_BG} stroke="#5b86ff" strokeWidth="1.5" strokeDasharray="3 3.5" />
        <text x={128} y={62} textAnchor="middle" fontSize="11" className="fill-muted-foreground" style={mono}>#</text>
        <rect x={162} y={10} width="86" height="28" rx="8" fill={PITCH_BG} stroke={WIN} strokeWidth="2" />
        <text x={205} y={24} textAnchor="middle" fontSize="9" fontWeight="700" className="fill-foreground" style={mono}>TxLINE root</text>
        <text x={205} y={33} textAnchor="middle" fontSize="6.5" className="fill-muted-foreground" style={mono}>anchored on-chain</text>
        <g className="ob-payout">
          <rect x={216} y={80} width="66" height="26" rx="13" fill="rgba(47,191,127,0.14)" stroke={WIN} strokeWidth="1.5" />
          <text x={249} y={97} textAnchor="middle" fontSize="10" fontWeight="700" fill={WIN} style={mono}>+ payout</text>
        </g>
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
    body: "Txsports is a parimutuel prediction market for the World Cup, built on data from TxODDS the sports-data house behind TxLINE, which anchors real match results on Solana as cryptographic proofs. Bettors price each other; a proof of the real score settles every market.",
    art: <ArtWelcome />,
  },
  {
    minute: "15'",
    kicker: "Step 1 · get set up",
    title: "Connect a wallet, grab free SOL.",
    body: "Set your Solana wallet to Devnet and hit Connect in the top bar. Everything is a real on-chain transaction, but the SOL is test currency with no monetary value  fill up at the faucet and play the full product risk free.",
    art: <ArtSetup />,
    link: { href: FAUCET_URL, label: "Get test SOL" },
  },
  {
    minute: "30'",
    kicker: "Step 2 · place a bet",
    title: "Open a market, back an outcome.",
    body: "Browse Markets, open a fixture, and stake on Home, Draw or Away. There's no order book: your SOL joins that outcome's pool and the odds are simply each pool's share of the total. Changed your mind? Cancel for a full refund any time before kickoff.",
    art: <ArtStake />,
  },
  {
    minute: "60'",
    kicker: "Step 3 · watch it live",
    title: "Real matches stream from TxODDS.",
    body: "Live fixtures stream scores, match phases and consensus odds straight from the TxODDS feed  the same data TxLINE later proves on-chain. Simulations replay a finished match's real feed instead, so you can experience the whole flow any time.",
    art: <ArtWatch />,
  },
  {
    minute: "90'",
    kicker: "Step 4 · settle & claim",
    title: "The TxLINE proof pays you out.",
    body: "At full time, anyone submits the match's TxLINE Merkle score proof. The program verifies it against the root TxODDS anchored on Solana, the market resolves, and winners hit Claim to split the entire pool. No oracle, no admin key, no one to trust.",
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
        .ob-proofpath { stroke-dasharray: 160; stroke-dashoffset: 160; animation: obDraw 3.2s ease-in-out infinite; }
        @keyframes obDraw { 0% { stroke-dashoffset:160 } 45%,90% { stroke-dashoffset:0 } 100% { stroke-dashoffset:0; opacity:.35 } }
        .ob-proofpath2 { stroke-dasharray: 90; stroke-dashoffset: 90; animation: obDraw2 3.2s ease-in-out infinite; }
        @keyframes obDraw2 { 0%,45% { stroke-dashoffset:90; opacity:0 } 55% { opacity:1 } 75%,100% { stroke-dashoffset:0; opacity:1 } }
        .ob-payout { opacity: 0; animation: obPayout 3.2s ease-in-out infinite; }
        @keyframes obPayout { 0%,68% { opacity:0; transform:translateY(4px) } 80%,100% { opacity:1; transform:translateY(0) } }
        .ob-flow { animation: obFlow 1.6s ease-in-out infinite; }
        .ob-flow2 { animation: obFlow 1.6s .8s ease-in-out infinite; }
        @keyframes obFlow { 0%,100% { opacity:.35 } 50% { opacity:1 } }
        .ob-pick { animation: obPick 2.6s ease-in-out infinite; }
        @keyframes obPick { 0%,60% { box-shadow: 0 0 0 0 rgba(242,104,95,0) } 75% { box-shadow: 0 0 0 5px rgba(242,104,95,.22) } 100% { box-shadow: 0 0 0 0 rgba(242,104,95,0) } }
        .ob-goal { display:inline-block; animation: obGoal 3.4s ease-in-out infinite; }
        @keyframes obGoal { 0%,55% { transform:translateY(0) } 62% { transform:translateY(-5px) } 70%,100% { transform:translateY(0) } }
        .ob-dots span { animation: obDot 1.2s ease-in-out infinite; }
        .ob-dots span:nth-child(2) { animation-delay: .2s }
        .ob-dots span:nth-child(3) { animation-delay: .4s }
        @keyframes obDot { 0%,100% { opacity:.25; transform:translateX(0) } 50% { opacity:1; transform:translateX(3px) } }
        @media (prefers-reduced-motion: reduce) {
          .ob-ripple,.ob-ripple2,.ob-coin,.ob-seg-h,.ob-seg-a,.ob-ball,.ob-proofpath,.ob-proofpath2,.ob-payout,.ob-flow,.ob-flow2,.ob-pick,.ob-goal,.ob-dots span { animation: none; }
          .ob-proofpath,.ob-proofpath2 { stroke-dashoffset: 0; }
          .ob-payout { opacity: 1; }
          .ob-ball { left: calc(100% - 16px); }
        }
      `}</style>

      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />

      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
        role="dialog" aria-modal="true" aria-label="Welcome tour"
      >
        {/* illustration stage on the pitch panel */}
        <div className="relative h-40 overflow-hidden sm:h-48" style={{ background: PITCH_BG }}>
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
        <div className="min-h-[230px] px-5 pb-2 pt-4 sm:min-h-[190px] sm:px-7 sm:pt-5">
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
                  <SolanaLogo size={15} /> {s.link.label}
                </a>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* footer: match-clock progress + controls */}
        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-3 sm:gap-4 sm:px-7 sm:pb-5">
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

      </motion.div>
    </div>,
    document.body
  );
}
