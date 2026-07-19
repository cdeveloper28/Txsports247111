import { motion } from "framer-motion";
import { LockSimple, Prohibit, CheckCircle } from "@phosphor-icons/react";
import { Pitch } from "./Pitch";

const HOME = "#4f7cff", DRAW = "#f6b73c", AWAY = "#f2685f", WIN = "#2fbf7f";
const LINE = "hsl(220 5% 26%)";

/* ------------------------------------------------------------------ */
/* Illustrations - same line-work language as the pitch                */
/* ------------------------------------------------------------------ */

/** Step 1 - the pool is the order book: your stake joins a side and moves the price. */
function PoolArt() {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span>Live pool</span>
        <span>implied odds = pool share</span>
      </div>
      <div className="relative mt-8">
        <div className="mech-coin absolute -top-8 left-[72%] -translate-x-1/2 rounded-full border border-danger/50 bg-danger/15 px-2 py-0.5 font-mono text-[11px] font-bold text-danger">
          +◎0.5 Away
        </div>
        <div className="flex h-3 gap-[3px] overflow-hidden rounded-full">
          <div className="mech-seg-h h-full rounded-l-full" style={{ background: HOME }} />
          <div className="mech-seg-d h-full" style={{ background: DRAW }} />
          <div className="mech-seg-a h-full rounded-r-full" style={{ background: AWAY }} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 font-mono text-[11px] text-muted-foreground">
        <span>Home ◎2.0</span>
        <span className="text-center">Draw ◎1.2</span>
        <span className="text-right">Away ◎0.8 <b className="text-danger">→ 1.3</b></span>
      </div>
    </div>
  );
}

/** Step 2 - escrow in the market PDA: who holds a key, who doesn't. */
function EscrowArt() {
  return (
    <div className="w-full">
      <div className="relative mx-auto w-fit rounded-xl border-2 border-dashed border-border px-7 py-4 text-center">
        <span className="mech-pulse pointer-events-none absolute -inset-1.5 rounded-2xl border border-primary/40" aria-hidden />
        <LockSimple weight="fill" size={22} className="mx-auto text-primary" />
        <div className="mt-1.5 font-mono text-xs font-semibold">market PDA</div>
        <div className="font-mono text-[11px] text-muted-foreground">◎4.5 escrowed</div>
      </div>
      <ul className="mx-auto mt-5 w-fit space-y-2 font-mono text-[11.5px]">
        <li className="flex items-center gap-2 text-muted-foreground">
          <Prohibit weight="bold" size={14} className="text-danger" /> bookmaker - no key
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <Prohibit weight="bold" size={14} className="text-danger" /> admin - no key, no void instruction
        </li>
        <li className="flex items-center gap-2 text-foreground">
          <CheckCircle weight="fill" size={14} className="text-success" /> program - releases only on a valid proof
        </li>
      </ul>
    </div>
  );
}

/** Step 3 - the match runs on the TxLINE feed (territory = live implied odds). */
function MatchArt() {
  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-lg" style={{ background: "hsl(150 16% 6.5%)" }}>
        <div className="aspect-[2.3/1]">
          <Pitch probs={[47, 27, 26]} live />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-danger" /> TxLINE feed · live
        </span>
        <span>scores + StablePrice odds</span>
      </div>
    </div>
  );
}

/** Step 4 - the signature: a Merkle proof path drawing itself from the score leaf to the on-chain root. */
function MerkleArt() {
  const BG = "hsl(220 6% 8%)"; // opaque node fill so edges visually stop at node borders
  const SIB = "#5b86ff";
  const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;
  return (
    <div className="w-full">
      <svg viewBox="0 0 320 212" className="w-full" aria-hidden>
        <defs>
          <filter id="mkGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        {/* quiet edges (under everything) */}
        <g stroke={LINE} strokeWidth="1.25" fill="none">
          <path d="M40 163 L80 112" />
          <path d="M120 163 L80 112" />
          <path d="M280 163 L240 112" />
          <path d="M80 112 L160 49" />
        </g>

        {/* the proof path - draws leaf → parent → root on loop */}
        <path className="mech-proofpath" d="M200 163 L240 112 L160 49" stroke={WIN} strokeWidth="2.25" fill="none" strokeLinejoin="round" strokeLinecap="round" />

        {/* root glow, soft and BEHIND the node */}
        <circle className="mech-rootglow" cx={160} cy={49} r="24" fill={WIN} filter="url(#mkGlow)" />

        {/* root - anchored on-chain */}
        <rect x={124} y={36} width="72" height="26" rx="7" fill={BG} stroke={WIN} strokeWidth="2" />
        <text x={160} y={53} textAnchor="middle" fontSize="10.5" fontWeight="700" className="fill-foreground" style={mono}>root</text>
        <line x1={198} y1={49} x2={212} y2={49} stroke={LINE} strokeWidth="1" />
        <text x={216} y={52.5} fontSize="8.5" className="fill-muted-foreground" style={mono}>anchored on Solana</text>

        {/* intermediate hashes - left one is a sibling supplied by the proof (dashed blue) */}
        <circle cx={80} cy={112} r="12" fill={BG} stroke={SIB} strokeWidth="1.5" strokeDasharray="3 3.5" />
        <text x={80} y={116} textAnchor="middle" fontSize="10" className="fill-muted-foreground" style={mono}>#</text>
        <circle cx={240} cy={112} r="12" fill={BG} stroke={WIN} strokeWidth="2" />
        <text x={240} y={116} textAnchor="middle" fontSize="10" className="fill-foreground" style={mono}>#</text>

        {/* leaves: full-time scores */}
        {[
          { x: 40, s: "1:0" }, { x: 120, s: "0:0" }, { x: 200, s: "2:2" }, { x: 280, s: "3:1" },
        ].map((l, i) => {
          const yours = i === 2, sib = i === 3;
          return (
            <g key={i}>
              <rect x={l.x - 21} y={150} width="42" height="26" rx="7" fill={BG}
                stroke={yours ? WIN : sib ? SIB : LINE}
                strokeWidth={yours ? 2 : sib ? 1.5 : 1.25}
                strokeDasharray={sib ? "3 3.5" : undefined} />
              {yours && <rect x={l.x - 21} y={150} width="42" height="26" rx="7" fill={WIN} opacity="0.09" />}
              <text x={l.x} y={167} textAnchor="middle" fontSize="10.5" fontWeight="700"
                className={yours ? "fill-foreground" : "fill-muted-foreground"} style={mono}>
                {l.s}
              </text>
            </g>
          );
        })}
        <text x={160} y={198} textAnchor="middle" fontSize="8.5" className="fill-muted-foreground" style={mono}>
          full-time scores · one leaf per fixture
        </text>
        <text x={200} y={144} textAnchor="middle" fontSize="8.5" fill={WIN} style={mono}>yours</text>
      </svg>
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-5 rounded-full" style={{ background: WIN }} /> your score's path</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed" style={{ borderColor: SIB }} /> sibling hashes in the proof</span>
      </div>
    </div>
  );
}

/** Step 5 - winners split the whole pool pro-rata. */
function SplitArt() {
  return (
    <div className="w-full">
      <svg viewBox="0 0 320 156" className="w-full" aria-hidden>
        {/* the settled pool */}
        <rect x={10} y={56} width="84" height="46" rx="9" fill="none" stroke={LINE} strokeWidth="1.25" />
        <text x={52} y={76} textAnchor="middle" fontSize="10.5" fontWeight="700" className="fill-foreground" style={{ fontFamily: "ui-monospace, monospace" }}>pool ◎4.5</text>
        <text x={52} y={91} textAnchor="middle" fontSize="9" className="fill-muted-foreground" style={{ fontFamily: "ui-monospace, monospace" }}>Away wins</text>

        {/* flows */}
        <path d="M94 70 L216 30" stroke={WIN} strokeWidth="1.5" fill="none" />
        <path d="M94 84 L216 82" stroke={WIN} strokeWidth="1.5" fill="none" />
        <path d="M94 98 L216 132" stroke={LINE} strokeWidth="1.25" strokeDasharray="3 4" fill="none" />
        <circle className="mech-dot1" r="3.2" fill={WIN} />
        <circle className="mech-dot2" r="3.2" fill={WIN} />

        {/* recipients */}
        <g style={{ fontFamily: "ui-monospace, monospace" }}>
          <rect x={216} y={14} width="94" height="30" rx="7" fill="none" stroke={WIN} strokeWidth="1.5" />
          <text x={263} y={33} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-foreground">you +◎1.73</text>
          <rect x={216} y={66} width="94" height="30" rx="7" fill="none" stroke={WIN} strokeWidth="1.5" />
          <text x={263} y={85} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-foreground">7dK…q2 +◎2.77</text>
          <rect x={216} y={118} width="94" height="30" rx="7" fill="none" stroke={LINE} strokeWidth="1.25" />
          <text x={263} y={137} textAnchor="middle" fontSize="10" className="fill-muted-foreground">backed Draw · ◎0</text>
        </g>
      </svg>
      <div className="mt-1.5 text-center font-mono text-[11px] text-muted-foreground">
        payout = stake × total ÷ winning pool
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const steps: { kicker: string; title: string; body: React.ReactNode; art: React.ReactNode; extra?: React.ReactNode }[] = [
  {
    kicker: "The pool is the order book",
    title: "Stake a side. That is the whole order.",
    body: (
      <>
        There's no order book, no matching engine, no odds locked at bet time. Your SOL joins the pool
        of the outcome you back - Home, Draw or Away - and the live implied odds are simply each
        pool's share of the total. Until kickoff (or any time in a replay), you can cancel a bet and
        take your stake back.
      </>
    ),
    extra: (
      <div className="mt-4 w-fit rounded-lg border border-border bg-secondary/40 px-4 py-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
        pools ◎2.0 / ◎1.2 / ◎0.8 · you stake <b className="text-foreground">◎0.5 on Away</b><br />
        if Away wins: 0.5 × 4.5 ÷ 1.3 = <b className="text-success">◎1.73 (3.46×)</b>
      </div>
    ),
    art: <PoolArt />,
  },
  {
    kicker: "No custodian",
    title: "Your stake escrows in the market itself.",
    body: (
      <>
        Every stake sits in the market's program-derived account on Solana - not a bookmaker's wallet.
        Nobody holds a key to it: there is no admin instruction to void a market, freeze a pool, or
        move funds. The only thing that can release the pool is the program, and the only thing that
        convinces the program is a valid proof of the final score.
      </>
    ),
    art: <EscrowArt />,
  },
  {
    kicker: "Live from TxLINE",
    title: "The match streams in as it happens.",
    body: (
      <>
        Scores, match stats and StablePrice consensus odds stream from the TxLINE feed while the game
        runs - the same institutional data TxODDS supplies to the betting industry. Real markets close
        at kickoff; replays stream a finished match's real data frame by frame so you can watch your
        position play out.
      </>
    ),
    art: <MatchArt />,
  },
  {
    kicker: "The Merkle proof",
    title: "At full time, the score becomes a proof.",
    body: (
      <>
        TxODDS anchors a Merkle root of every day's final scores on Solana. Anyone - you, a bot, a
        stranger - can fetch the proof for this fixture: the score leaf plus the sibling hashes that
        recompute the root. Submitting <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px]">resolve(outcome, proof)</code> is
        permissionless; there is no oracle to wait for and no resolver to trust.
      </>
    ),
    art: <MerkleArt />,
  },
  {
    kicker: "Pro-rata split",
    title: "Verify on-chain, then winners split everything.",
    body: (
      <>
        The program rebuilds the win/draw/loss predicate itself and CPIs into TxLINE's{" "}
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px]">validate_stat_v2</code>.
        If the proof doesn't hash to the anchored root, the transaction reverts and nothing settles.
        If it verifies, the market resolves and winners claim the <b className="text-foreground">entire pool</b> pro-rata
        to their stake. No house cut, no margin - the losers' side is the winners' payout.
      </>
    ),
    art: <SplitArt />,
  },
];

export function Mechanics() {
  return (
    <section id="how" className="container py-14">
      {/* scoped animations - all disabled under prefers-reduced-motion */}
      <style>{`
        .mech-coin { animation: mechCoin 3.6s ease-in-out infinite; }
        @keyframes mechCoin { 0%,55% { transform: translate(-50%,0); opacity:1 } 70%,80% { transform: translate(-50%,26px); opacity:0 } 81% { transform: translate(-50%,-8px); opacity:0 } 95%,100% { transform: translate(-50%,0); opacity:1 } }
        .mech-seg-h { width:44.4%; animation: mechH 3.6s ease-in-out infinite; }
        .mech-seg-d { width:26.7%; animation: mechD 3.6s ease-in-out infinite; }
        .mech-seg-a { width:17.8%; animation: mechA 3.6s ease-in-out infinite; }
        @keyframes mechH { 0%,60% { width:44.4% } 75%,88% { width:40% } 100% { width:44.4% } }
        @keyframes mechD { 0%,60% { width:26.7% } 75%,88% { width:24% } 100% { width:26.7% } }
        @keyframes mechA { 0%,60% { width:17.8% } 75%,88% { width:26% } 100% { width:17.8% } }
        .mech-pulse { animation: mechPulse 2.6s ease-in-out infinite; }
        @keyframes mechPulse { 0%,100% { opacity:.25 } 50% { opacity:.8 } }
        .mech-proofpath { stroke-dasharray: 170; stroke-dashoffset: 170; animation: mechDraw 3.2s ease-in-out infinite; }
        @keyframes mechDraw { 0% { stroke-dashoffset:170 } 45%,80% { stroke-dashoffset:0 } 100% { stroke-dashoffset:0; opacity:.25 } }
        .mech-rootglow { opacity:.07; animation: mechGlow 3.2s ease-in-out infinite; }
        @keyframes mechGlow { 0%,40% { opacity:.05 } 55%,80% { opacity:.2 } 100% { opacity:.05 } }
        .mech-dot1 { animation: mechDot1 2.4s linear infinite; }
        .mech-dot2 { animation: mechDot2 2.4s .9s linear infinite; }
        @keyframes mechDot1 { 0% { transform: translate(94px,70px); opacity:0 } 12% { opacity:1 } 88% { opacity:1 } 100% { transform: translate(216px,30px); opacity:0 } }
        @keyframes mechDot2 { 0% { transform: translate(94px,84px); opacity:0 } 12% { opacity:1 } 88% { opacity:1 } 100% { transform: translate(216px,82px); opacity:0 } }
        @media (prefers-reduced-motion: reduce) {
          .mech-coin, .mech-seg-h, .mech-seg-d, .mech-seg-a, .mech-pulse,
          .mech-proofpath, .mech-rootglow, .mech-dot1, .mech-dot2 { animation: none; }
          .mech-proofpath { stroke-dashoffset: 0; }
          .mech-rootglow { opacity: .12; }
          .mech-dot1, .mech-dot2 { opacity: 0; }
        }
      `}</style>

      <div className="max-w-3xl">
        <div className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">How it works</div>
        <h2 className="mt-3 font-display text-3xl font-bold sm:text-5xl">
          From stake to payout,
          <br />
          no one to trust on the way.
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Txsports is a parimutuel market: bettors price each other, funds escrow in the program, and a
          cryptographic proof of the real score - not a person - settles every market. This is the whole
          lifecycle of a bet.
        </p>
      </div>

      <ol className="mt-12 space-y-14">
        {steps.map((s, i) => (
          <motion.li
            key={s.kicker}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="grid items-center gap-8 lg:grid-cols-[0.42fr_0.58fr] lg:gap-14"
          >
            <div className={"flex items-center rounded-xl border border-border bg-card/60 p-6 sm:p-8 " + (i % 2 ? "lg:order-2" : "")}>
              {s.art}
            </div>
            <div className={i % 2 ? "lg:order-1" : ""}>
              <div className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                <span className="text-primary">step {i + 1} of 5</span> · {s.kicker}
              </div>
              <h3 className="mt-2.5 text-balance font-display text-2xl font-bold sm:text-3xl">{s.title}</h3>
              <p className="mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">{s.body}</p>
              {s.extra}
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
