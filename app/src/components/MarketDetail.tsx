import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import {
  SealCheck, Play, Pause, ArrowClockwise, CheckCircle, Sparkle, Circle, ArrowLeft, ArrowRight, XCircle,
  Trophy, Warning, ArrowSquareOut, Receipt, TreeStructure, XLogo, ChartLineUp, Scales, SoccerBall, Broadcast,
  RocketLaunch, Flask, Lock,
} from "@phosphor-icons/react";
import {
  IDL, TXORACLE, OUTCOME_LABELS, LAMPORTS_PER_SOL,
  marketPdaFor, positionPdaFor, dailyScoresPda, SHARED_HOST,
} from "../config";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Flag } from "./Flag";
import { Pitch } from "./Pitch";
import { MatchViz } from "./MatchViz";
import { ProofInspector } from "./ProofInspector";
import { WinProbChart } from "./WinProbChart";
import { LiveProbChart } from "./LiveProbChart";
import NumberFlow from "@number-flow/react";
import { recordPrediction, getHistory, type Prediction } from "../lib/history";
import { scrollToEl } from "../lib/smoothScroll";
import { useSolPrice } from "../lib/solPrice";
import { useLiveMatch } from "../lib/liveFeed";
import { invalidateMarketStats } from "../lib/onchainMarkets";
import { toast } from "../lib/toast";
import { xIntentUrl, marketUrl } from "../lib/share";

const REPLAY_MS = 1300;
const MAX_BET_USD = 50; // hard cap per bet, in USD; converted to SOL at the live price
const OUTCOME_COLORS = ["#4f7cff", "#f6b73c", "#f2685f"]; // Home / Draw / Away - matches Pitch territory
const SOL = (lamports: number) => lamports / LAMPORTS_PER_SOL;

type Stats = { poss: [number, number]; shots: [number, number]; sot?: [number, number]; corners: [number, number]; cards: [number, number] };
type Frame = { minute: number; home: number; away: number; odds: [number, number, number]; status: string; stats?: Stats };
type MatchEvent = { minute: number; kind: "goal" | "yellow" | "red" | "penalty"; team: number; note?: string };
type MarketState = { pools: [number, number, number]; total: number; resolved: boolean; outcome: number } | null;
interface FixtureMeta {
  fixtureId: number; home: string; away: string; competition?: string; category?: "real" | "simulation";
  kickoff?: number; status?: string; score?: { home: number; away: number } | null;
  odds?: [number, number, number] | null; finalOutcome?: number | null;
}

function errMsg(e: any): string {
  if (e?.error?.errorMessage) return e.error.errorMessage;
  const logs: string[] | undefined = e?.logs || e?.transactionLogs;
  const m = logs?.find((l) => l.includes("Error Message:"));
  if (m) return m.split("Error Message:")[1].trim();
  const msg = typeof e?.message === "string" ? e.message : String(e);
  if (/blockhash not found/i.test(msg)) return "Network hiccup (blockhash expired). Please try again.";
  if (/insufficient|0x1\b/i.test(msg)) return "Insufficient SOL for this bet plus network fees.";
  if (/user rejected|rejected the request|denied/i.test(msg)) return "You cancelled the request in your wallet.";
  return msg;
}

function useReplay(frames: Frame[]) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setI(0); setPlaying(false); }, [frames]);
  useEffect(() => {
    if (!playing) return;
    // Reached full time: stop the clock and drop back to a static final frame.
    if (i >= frames.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setI((x) => Math.min(x + 1, frames.length - 1)), REPLAY_MS);
    return () => clearTimeout(t);
  }, [i, playing, frames.length]);
  return {
    f: (frames[i] ?? frames[0]) as Frame, playing, setPlaying, started: i > 0,
    atEnd: i >= frames.length - 1, reset: () => { setI(0); setPlaying(false); },
  };
}

export function MarketDetail({ fixtureId }: { fixtureId: number }) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [meta, setMeta] = useState<FixtureMeta | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [feedSource, setFeedSource] = useState<string>("");
  const [proof, setProof] = useState<any>(null);
  const solPrice = useSolPrice();

  useEffect(() => {
    fetch("/fixtures.json").then((r) => (r.ok ? r.json() : [])).then((list: FixtureMeta[]) => {
      setMeta(list.find((x) => x.fixtureId === fixtureId) ?? null);
    }).catch(() => setMeta(null));
  }, [fixtureId]);

  useEffect(() => {
    fetch(`/feed-${fixtureId}.json`).then((r) => (r.ok ? r.json() : null)).then((fd) => {
      setFrames(fd?.frames?.length ? fd.frames : []);
      setEvents(Array.isArray(fd?.events) ? fd.events : []);
      setFeedSource(fd?.source ?? "");
    }).catch(() => { setFrames([]); setEvents([]); setFeedSource(""); });
    fetch(`/proof-${fixtureId}.json`).then((r) => (r.ok ? r.json() : null)).then(setProof).catch(() => setProof(null));
  }, [fixtureId]);

  const displayFrames: Frame[] = useMemo(() => {
    if (frames.length) return frames;
    const st = meta?.status === "FT" ? "FT" : meta?.status === "LIVE" ? "LIVE" : "UPCOMING";
    return [{
      minute: st === "FT" ? 90 : 0, home: meta?.score?.home ?? 0, away: meta?.score?.away ?? 0,
      odds: (meta?.odds ?? [0, 0, 0]) as [number, number, number], status: st,
    }];
  }, [frames, meta]);

  const { f: fReplay, playing, setPlaying, started, atEnd, reset } = useReplay(displayFrames);
  const hasReplay = displayFrames.length > 1;

  const homeTeam = meta?.home ?? "Home";
  const awayTeam = meta?.away ?? "Away";
  const isReal = (meta?.category ?? "simulation") === "real";
  const finalOutcome = meta?.finalOutcome ?? proof?.outcome ?? null;

  // Real fixtures stream from TxODDS: scripts/live-relay.ts mirrors the authenticated
  // /scores/stream + /odds/stream SSE feeds into /live-<id>.json, which we poll. While the feed is
  // fresh, the displayed score / phase / minute / 1X2 odds come straight from that stream (the
  // odds also drive the bet panel), using the documented on-chain phase + stat-key encodings.
  const { live: liveMatch, phase: livePhase } = useLiveMatch(fixtureId, isReal);
  // feedFresh: the relay is delivering fresh TxODDS data (any phase - odds tick pre-kickoff too).
  // streaming: the match itself is live/ended, which additionally drives score/phase/settle.
  const feedFresh = isReal && !!liveMatch;
  const streaming = feedFresh && (livePhase.live || livePhase.ended);
  const f: Frame = useMemo(() => {
    if (!feedFresh || !liveMatch) return fReplay;
    const inMatch = livePhase.live || livePhase.ended;
    return {
      ...fReplay,
      // live 1X2 prices apply the moment the relay has them (they drive the bet panel + pills)
      odds: (liveMatch.odds ?? fReplay.odds) as [number, number, number],
      home: inMatch ? liveMatch.score[0] : fReplay.home,
      away: inMatch ? liveMatch.score[1] : fReplay.away,
      status: livePhase.ended ? "FT" : livePhase.live ? "LIVE" : fReplay.status,
    };
  }, [feedFresh, streaming, liveMatch, livePhase, fReplay]);

  const [market, setMarket] = useState<MarketState>(null);
  const [myStakes, setMyStakes] = useState<[number, number, number] | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [amountUsd, setAmountUsd] = useState(10);
  const [sel, setSel] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const [receipt, setReceipt] = useState<{ payout: number; staked: number; sig: string; win: boolean; void: boolean; ts: number; outcome: number } | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [histVer, setHistVer] = useState(0);
  const [simInfo, setSimInfo] = useState(false);
  const simInfoShownRef = useRef<number | null>(null);

  // Landing on an already-settled SIMULATION is a dead end ("Market settled") that confuses first-
  // timers. Instead, pop a broad explainer: what sim mode is for, why it's locked (known results),
  // and how the pool pays out. Shown once per fixture, and skipped for a bettor who came back to
  // claim (they hold a stake) so we don't block their payout.
  useEffect(() => {
    const hasStake = !!myStakes && myStakes.some((s) => s > 0);
    if (!isReal && market?.resolved && !hasStake && simInfoShownRef.current !== fixtureId) {
      simInfoShownRef.current = fixtureId;
      setSimInfo(true);
    }
  }, [isReal, market?.resolved, myStakes, fixtureId]);
  const [railRows, setRailRows] = useState<Prediction[]>([]);
  const [railFx, setRailFx] = useState<Record<number, { home: string; away: string }>>({});
  const logRef = useRef<HTMLDivElement>(null);
  const say = (m: string) => setLog((l) => [...l.slice(-40), m]);
  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [log]);

  const program = useMemo(() => {
    if (!wallet) return null;
    return new Program(IDL, new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
  }, [connection, wallet]);
  // EVERY market - real AND simulation - settles the ONE shared pool (host = SHARED_HOST) that the
  // dev wallet pre-seeds on all three outcomes. Sandboxing sims to the bettor's wallet made every
  // solo sim bet single-sided ([you, 0, 0]), so any result you didn't back left winning_pool == 0
  // and the program voided the market and refunded you - there was no counterparty pool to pay a
  // winner from. Sharing the seeded pool fixes that: real liquidity on all three outcomes, so wrong
  // bets lose, right bets profit, and a void is impossible. Trade-off: a fixture promoted from real
  // whose shared market is already resolved shows "Market settled" (it genuinely is). Stakes stuck
  // in old per-wallet sandboxes stay recoverable via the "legacy" recovery path below.
  const host = useMemo(() => SHARED_HOST, []);
  const marketPda = useMemo(() => (host ? marketPdaFor(fixtureId, host) : null), [fixtureId, host]);

  const refresh = useCallback(async () => {
    if (!program || !marketPda) { setMarket(null); setMyStakes(null); setClaimed(false); return; }
    try {
      const m: any = await (program.account as any).market.fetch(marketPda);
      setMarket({
        pools: (m.pools as BN[]).map((x) => SOL(x.toNumber())) as [number, number, number],
        total: SOL((m.totalPool as BN).toNumber()), resolved: m.resolved, outcome: m.winningOutcome,
      });
    } catch { setMarket(null); }
    if (publicKey) {
      try {
        const p: any = await (program.account as any).position.fetch(positionPdaFor(marketPda, publicKey));
        setMyStakes((p.amounts as BN[]).map((x) => SOL(x.toNumber())) as [number, number, number]);
        setClaimed(!!p.claimed);
      } catch { setMyStakes(null); setClaimed(false); }
    } else { setMyStakes(null); setClaimed(false); }
  }, [program, marketPda, publicKey]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);

  // "Your bets" rail - the connected wallet's history + a fixture->teams map for labels
  useEffect(() => {
    fetch("/fixtures.json").then((r) => (r.ok ? r.json() : [])).then((list: any[]) => {
      const m: Record<number, { home: string; away: string }> = {};
      for (const fx of list) m[fx.fixtureId] = { home: fx.home, away: fx.away };
      setRailFx(m);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (publicKey) getHistory(publicKey.toBase58()).then(setRailRows).catch(() => setRailRows([]));
    else setRailRows([]);
  }, [publicKey, histVer]);

  const act = async (
    label: string, fn: () => Promise<string>,
    logMeta?: { kind: "bet" | "cancel" | "settle" | "claim"; outcome?: number; amount?: number },
    onSuccess?: (sig: string) => void,
  ) => {
    setBusy(true); say(`→ ${label}…`);
    try {
      const sig = await fn();
      say(`✓ ${sig.slice(0, 24)}…`);
      if (logMeta && publicKey && marketPda) {
        await recordPrediction({
          wallet: publicKey.toBase58(), market: marketPda.toBase58(), fixtureId,
          sig, kind: logMeta.kind, outcome: logMeta.outcome, amount: logMeta.amount,
        });
        setHistVer((v) => v + 1);
      }
      onSuccess?.(sig);
      await refresh();
      // Push the confirmed change into Market Pulse / crowd bars everywhere, right now.
      invalidateMarketStats();
    } catch (e: any) {
      const msg = errMsg(e);
      say(`✗ ${msg}`);
      toast.error(/cancelled the request/i.test(msg) ? "Transaction cancelled" : "Transaction failed", msg);
    } finally { setBusy(false); }
  };

  // Stranded stakes: bets placed during the per-wallet sandbox era live on a market derived from
  // the bettor's own key. Detect a live position there and offer a one-click withdraw/claim.
  const legacyPda = useMemo(() => (publicKey ? marketPdaFor(fixtureId, publicKey) : null), [fixtureId, publicKey]);
  const [legacy, setLegacy] = useState<{ stakes: [number, number, number]; total: number; resolved: boolean; outcome: number; pools: [number, number, number] } | null>(null);
  useEffect(() => {
    (async () => {
      if (!program || !publicKey || !legacyPda || legacyPda.equals(marketPda)) { setLegacy(null); return; }
      try {
        const m: any = await (program.account as any).market.fetch(legacyPda);
        const p: any = await (program.account as any).position.fetch(positionPdaFor(legacyPda, publicKey));
        if (p.claimed) { setLegacy(null); return; }
        const stakes = (p.amounts as BN[]).map((x) => SOL(x.toNumber())) as [number, number, number];
        if (!stakes.some((s) => s > 0)) { setLegacy(null); return; }
        setLegacy({
          stakes, resolved: m.resolved, outcome: m.winningOutcome,
          pools: (m.pools as BN[]).map((x) => SOL(x.toNumber())) as [number, number, number],
          total: SOL((m.totalPool as BN).toNumber()),
        });
      } catch { setLegacy(null); }
    })();
  }, [program, publicKey, legacyPda, marketPda, histVer]);
  // Recoverable: unresolved (cancel refunds), resolved-won, or resolved-void (claim refunds).
  const legacyRecoverable = !!legacy && (!legacy.resolved || legacy.pools[legacy.outcome] === 0 || legacy.stakes[legacy.outcome] > 0);
  const legacyTotal = legacy ? legacy.stakes[0] + legacy.stakes[1] + legacy.stakes[2] : 0;
  const recoverLegacy = () => {
    if (!legacy || !legacyPda) return;
    act("recover stranded stake", async () => {
      if (!program || !publicKey) throw new Error("connect a wallet");
      const position = positionPdaFor(legacyPda, publicKey);
      if (legacy.resolved) {
        return program.methods.claim().accounts({ market: legacyPda, position, owner: publicKey }).rpc();
      }
      let sig = "";
      for (let i = 0; i < 3; i++) {
        if (legacy.stakes[i] > 0) {
          sig = await program.methods.cancelBet(i)
            .accounts({ market: legacyPda, position, owner: publicKey }).rpc();
        }
      }
      return sig;
    }, { kind: legacy.resolved ? "claim" : "cancel", amount: legacyTotal },
      () => { setLegacy(null); toast.success("Stake recovered", `${legacyTotal.toFixed(3)} SOL returned to your wallet`); });
  };

  const maxUsd = MAX_BET_USD;
  const maxSol = MAX_BET_USD / solPrice; // $50 worth of SOL at the current price
  const betSol = Math.min(maxSol, Math.max(0, amountUsd / solPrice));
  const oddsAvailable = !!f.odds && f.odds.some((o) => o > 0);
  // Real markets close at kickoff ON-CHAIN (in-play parimutuel bets would be free money once the
  // score is known) - block the wallet prompt client-side too, or the tx just reverts.
  const betClosed = isReal && !market?.resolved && (
    livePhase.live || livePhase.ended || (meta?.kickoff ? Date.now() >= meta.kickoff : false)
  );

  const bet = () => {
    if (amountUsd <= 0) return setNotice({ title: "Enter an amount", body: "Your bet must be more than $0." });
    if (amountUsd > MAX_BET_USD + 1e-6) return setNotice({ title: "Bet too large", body: `The maximum bet is $${MAX_BET_USD} (~${maxSol.toFixed(3)} SOL). Lower your amount.` });
    if (betClosed) return setNotice({ title: "Market closed at kickoff", body: "Real markets take bets only before kickoff - the pool locks when the match starts, so nobody can bet with the score already known. Watch it live, then settle and claim after full time." });
    if (isReal && !oddsAvailable) return setNotice({ title: "Betting not open yet", body: "No betting is allowed on this fixture until live odds are available from the TxLINE feed." });
    act(`bet $${amountUsd} on ${OUTCOME_LABELS[sel]}`, async () => {
      if (!program || !publicKey || !marketPda) throw new Error("connect a wallet");
      const position = positionPdaFor(marketPda, publicKey);
      const lamports = new BN(Math.round(betSol * LAMPORTS_PER_SOL));
      const pre: any[] = [];
      if (!market) {
        // Sims sandbox to the bettor's wallet; reals share the global market and close at kickoff.
        const closesAt = new BN(
          isReal && meta?.kickoff ? Math.floor(meta.kickoff / 1000) : Math.floor(Date.now() / 1000) + 365 * 24 * 3600
        );
        pre.push(await program.methods.initMarket(new BN(fixtureId), closesAt, host)
          .accounts({ market: marketPda, creator: publicKey, systemProgram: SystemProgram.programId }).instruction());
      }
      return program.methods.placeBet(sel, lamports)
        .accounts({ market: marketPda, position, bettor: publicKey, systemProgram: SystemProgram.programId })
        .preInstructions(pre).rpc();
    }, { kind: "bet", outcome: sel, amount: betSol },
      () => toast.success("Bet placed", `$${amountUsd} (${betSol.toFixed(3)} SOL) on ${OUTCOME_LABELS[sel]}`));
  };

  const settle = () => {
    // You can only settle once the outcome is known: the replay must have played to full time
    // (or the market is already resolved). Guards the "bet then settle without watching" shortcut.
    if (!matchOver) {
      toast.info("Match still in play", "Play the match to full time. You can settle once the final outcome is available.");
      return;
    }
    return act("settle via TxLINE proof", async () => {
    if (!program || !publicKey || !marketPda) throw new Error("connect a wallet");
    if (!proof) throw new Error("no captured proof bundled for this fixture");
    const p = revive(proof.payload);
    const ds = dailyScoresPda(Number(p.fixtureSummary.updateStats.minTimestamp.toString()));
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
    return program.methods.resolve(proof.outcome, p)
      .accounts({ market: marketPda, dailyScoresMerkleRoots: ds, txoracleProgram: TXORACLE, payer: publicKey })
      .preInstructions([cuIx]).rpc();
  }, { kind: "settle", outcome: proof?.outcome },
    (sig) => {
      toast.success("Market settled", proof ? `${proof.label} · Merkle-verified on-chain` : undefined);
      // The settler just proved their own pick lost: hand them the loss receipt right away.
      const staked = myStakes ? myStakes[0] + myStakes[1] + myStakes[2] : 0;
      const winnersPool = proof != null ? market?.pools?.[proof.outcome] ?? 0 : 0;
      if (proof && staked > 0 && (myStakes?.[proof.outcome] ?? 0) <= 0 && winnersPool > 0) {
        setReceipt({ payout: 0, staked, sig, win: false, void: false, ts: Date.now(), outcome: proof.outcome });
      }
    });
  };

  const claimPayout = useCallback(() => {
    if (!market?.resolved || !myStakes) return { payout: 0, staked: 0, win: false, void: false };
    const win = market.outcome, wp = market.pools[win];
    const staked = myStakes[0] + myStakes[1] + myStakes[2];
    if (wp === 0) return { payout: staked, staked, win: false, void: true };
    return { payout: (myStakes[win] * market.total) / wp, staked, win: myStakes[win] > 0, void: false };
  }, [market, myStakes]);

  const claim = () => {
    const { payout, staked, win, void: voided } = claimPayout();
    act("claim winnings", async () => {
      if (!program || !publicKey || !marketPda) throw new Error("connect a wallet");
      return program.methods.claim()
        .accounts({ market: marketPda, position: positionPdaFor(marketPda, publicKey), owner: publicKey }).rpc();
    }, { kind: "claim", amount: payout }, (sig) => {
      setReceipt({ payout, staked, sig, win, void: voided, ts: Date.now(), outcome: market?.outcome ?? 0 });
      if (voided) toast.info("Refunded", `${payout.toFixed(3)} SOL returned`);
      else if (win) toast.win(`You won ${payout.toFixed(3)} SOL!`, `+${(payout - staked).toFixed(3)} SOL profit`);
      else toast.info("Settled, no winnings", "Your pick didn't win this one");
    });
  };

  /**
   * Settle + claim in ONE transaction: [resolve, claim]. Instructions run in order within a tx, so
   * claim sees the market already resolved. Only offered when the connected wallet holds a stake on
   * the proven winning outcome — otherwise there's nothing to claim and plain settle() is used.
   */
  const settleAndClaim = () => {
    if (!matchOver) {
      toast.info("Match still in play", "Play the match to full time. You can settle once the final outcome is available.");
      return;
    }
    const win = proof?.outcome ?? 0;
    const wp = market?.pools?.[win] ?? 0;
    const staked = myStakes ? myStakes[0] + myStakes[1] + myStakes[2] : 0;
    // Mirrors on-chain claim(): winner splits the whole pool pro-rata.
    const payout = wp > 0 ? ((myStakes?.[win] ?? 0) * (market?.total ?? 0)) / wp : staked;
    act("settle + claim in one transaction", async () => {
      if (!program || !publicKey || !marketPda) throw new Error("connect a wallet");
      if (!proof) throw new Error("no captured proof bundled for this fixture");
      const p = revive(proof.payload);
      const ds = dailyScoresPda(Number(p.fixtureSummary.updateStats.minTimestamp.toString()));
      const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
      const claimIx = await program.methods.claim()
        .accounts({ market: marketPda, position: positionPdaFor(marketPda, publicKey), owner: publicKey }).instruction();
      return program.methods.resolve(proof.outcome, p)
        .accounts({ market: marketPda, dailyScoresMerkleRoots: ds, txoracleProgram: TXORACLE, payer: publicKey })
        .preInstructions([cuIx]).postInstructions([claimIx]).rpc();
    }, { kind: "claim", amount: payout }, (sig) => {
      setReceipt({ payout, staked, sig, win: true, void: false, ts: Date.now(), outcome: win });
      toast.win(`You won ${payout.toFixed(3)} SOL!`, "Settled and claimed in one transaction");
    });
  };

  const cancel = (outcome: number) => {
    const amt = myStakes?.[outcome] ?? 0;
    act(`cancel ${OUTCOME_LABELS[outcome]} bet`, async () => {
      if (!program || !publicKey || !marketPda) throw new Error("connect a wallet");
      return program.methods.cancelBet(outcome)
        .accounts({ market: marketPda, position: positionPdaFor(marketPda, publicKey), owner: publicKey }).rpc();
    }, { kind: "cancel", outcome, amount: amt },
      () => toast.info("Bet cancelled", `${amt.toFixed(3)} SOL refunded`));
  };

  const total = market?.total || 0;
  const poolPct = (i: number) => (total > 0 ? Math.round(((market?.pools[i] || 0) / total) * 100) : 0);
  const prob = (i: number) => (f.odds[i] > 0 ? Math.round(100 / f.odds[i]) : finalOutcome === i ? 100 : 0);
  // Demargined live implied probability from the current odds (streamed for real fixtures,
  // per-frame for replays) - the same numbers the live probability chart shows.
  const liveProb = useMemo(() => {
    if (!f.odds || !f.odds.some((o) => o > 0)) return null;
    const raw = f.odds.map((o) => (o > 0 ? 1 / o : 0));
    const s = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map((x) => Math.round((x / s) * 100)) as [number, number, number];
  }, [f.odds]);
  const winner = market?.resolved ? market.outcome : atEnd && finalOutcome != null ? finalOutcome : -1;
  const dispStatus = market?.resolved ? "FT"
    : streaming ? f.status // live TxODDS phase drives real fixtures (LIVE while in play, FT once ended)
    : (started && atEnd) ? "FT" : started ? "LIVE" : (meta?.status ?? "LIVE");
  // Match is over: the replay has played to full time (or it's already resolved). Once over you can
  // only settle + claim - no cancelling, no pausing.
  const matchOver = dispStatus === "FT";
  const live = dispStatus === "LIVE";

  // Floating "Settle now" pill: the result is in, the proof is bundled, and the pool is still
  // unresolved. Hidden while the settlement card itself is on screen.
  const settleCardRef = useRef<HTMLDivElement>(null);
  const [settleCardVisible, setSettleCardVisible] = useState(false);
  const canSettleNow = !!market && !market.resolved && matchOver && !!proof && !!publicKey;
  useEffect(() => {
    const el = settleCardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setSettleCardVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [canSettleNow]);

  // A sandbox market is created by your first bet, then the seeder bot immediately adds
  // counterparty liquidity: SEED_SANDBOX SOL split across outcomes by the consensus odds with a
  // per-outcome floor (mirror scripts/seeder-bot.ts exactly). While the pool doesn't exist yet,
  // estimate against that projected seed so the payout reflects the ODDS, not a lone-stake +0%.
  const projectedPools = useMemo<[number, number, number] | null>(() => {
    const SEED_TOTAL = 1.5, SEED_FLOOR = 0.16;
    if (!f.odds || !f.odds.some((o) => o > 0)) return null;
    const raw = f.odds.map((o) => (o > 0 ? 1 / o : 0));
    const s0 = raw.reduce((a, b) => a + b, 0) || 1;
    const w = raw.map((x) => Math.max(SEED_FLOOR, x / s0));
    const s1 = w.reduce((a, b) => a + b, 0);
    return w.map((x) => (x / s1) * SEED_TOTAL) as [number, number, number];
  }, [f.odds]);

  // Parimutuel estimate - this mirrors claim() on-chain exactly: winners split the WHOLE pool pro
  // rata, so payout = stake × (total + stake) / (backingPool + stake). `share` is the fraction of
  // the pool backing your side once your bet lands; the payout multiple is simply 1/share.
  const est = useMemo(() => {
    const empty = !market || market.total <= 0;
    const projected = empty && !!projectedPools;
    const p = !empty ? market!.pools : projected ? projectedPools! : [0, 0, 0];
    const t = !empty ? market!.total : projected ? p[0] + p[1] + p[2] : 0;
    const wp = p[sel] + betSol, tot = t + betSol;
    const sol = wp > 0 ? (betSol * tot) / wp : betSol;
    const share = tot > 0 ? (wp / tot) * 100 : 0;
    return {
      sol, usd: sol * solPrice,
      pct: betSol > 0 ? Math.round(((sol - betSol) / betSol) * 100) : 0,
      share, mult: share > 0 ? 100 / share : 0, hasPool: t > 0, projected,
    };
  }, [market, projectedPools, sel, betSol, solPrice]);

  // crowd (pool) vs consensus (odds) - the outcome the crowd most under-backs is the "value" pick
  const edges = useMemo(() => {
    const t = market?.total ?? 0;
    return [0, 1, 2].map((i) => {
      const cons = f.odds[i] > 0 ? 100 / f.odds[i] : 0;
      const crowd = t > 0 ? ((market!.pools[i] ?? 0) / t) * 100 : 0;
      return { cons, crowd, edge: cons - crowd };
    });
  }, [market, f]);
  const valueIdx = market && market.total > 0
    ? edges.reduce((b, e, i, arr) => (e.edge > arr[b].edge ? i : b), 0) : -1;

  const hasBet = !!myStakes && myStakes.some((x) => x > 0);
  // The on-chain position can be invisible to this page (market layout changed, or a slow RPC)
  // while the wallet's ledger still records a live bet here. The ledger is only a FALLBACK for
  // when the position is unknown (myStakes === null): when the account is readable it is the
  // truth, and the ledger must net cancels against bets or a cancelled bet re-arms Kick off.
  const ledgerNet = railRows.reduce(
    (s, r) => (r.fixtureId === fixtureId
      ? s + (r.kind === "bet" ? (r.amount ?? 0) : r.kind === "cancel" ? -(r.amount ?? 0) : 0)
      : s),
    0
  );
  const hasBetHere = hasBet || (myStakes === null && ledgerNet > 1e-9);
  const cp = claimPayout();
  const canClaim = !!market?.resolved && !claimed && !!myStakes && (cp.void ? myStakes.some((x) => x > 0) : (!!market && myStakes[market.outcome] > 0));
  const lostBet = !!market?.resolved && !claimed && !!myStakes && myStakes.some((x) => x > 0) && !canClaim;
  // Unresolved market at full time where the wallet already backed the proven winner: one tap
  // settles AND claims atomically. wp>0 always holds here (the wallet itself is on the winner).
  const winStake = proof && myStakes ? (myStakes[proof.outcome] ?? 0) : 0;
  const canSettleClaim = !!market && !market.resolved && matchOver && !!proof && winStake > 0;
  const settleClaimPayout = canSettleClaim && market ? (winStake * market.total) / (market.pools[proof!.outcome] || 1) : 0;
  const selTeam = sel === 0 ? homeTeam : sel === 2 ? awayTeam : "";
  const railPnl = (() => {
    const sum = (k: string) => railRows.filter((r) => r.kind === k).reduce((s, r) => s + (r.amount ?? 0), 0);
    return sum("claim") - Math.max(0, sum("bet") - sum("cancel"));
  })();

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      <a href="#/app" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft weight="bold" size={15} /> All markets
      </a>

      {/* Broadcast scoreboard - the pitch-territory illustration carries the model odds */}
      <div className="relative mb-6 overflow-hidden rounded-xl border border-border" style={{ background: "hsl(150 16% 6.5%)" }}>
        <div className="absolute inset-0" aria-hidden>
          <Pitch
            probs={oddsAvailable ? (f.odds.map((o) => (o > 0 ? 100 / o : 0)) as [number, number, number]) : null}
            live={live}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/55 via-transparent to-background/70" />
        </div>
        <div className="relative px-4 py-5 sm:px-8 sm:py-7">
          <h1 className="sr-only">{homeTeam} vs {awayTeam}</h1>
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span>{meta?.competition ?? "World Cup"} · {isReal ? "Real · live" : "Simulation"}</span>
            <span className="inline-flex items-center gap-2">
              {streaming && (
                <span className="hidden items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[9px] font-bold tracking-wide text-success sm:inline-flex">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  TXODDS STREAM
                </span>
              )}
              <Badge variant={live ? "danger" : dispStatus === "FT" ? "outline" : "secondary"} className="py-1">
                <Circle weight="fill" size={7} className={live ? "animate-pulseDot" : dispStatus === "FT" ? "text-amber-500" : "text-muted-foreground"} />
                {dispStatus === "FT" ? "FULL TIME"
                  : streaming && livePhase.inPlay ? `LIVE · ${livePhase.code}`
                  : streaming ? livePhase.label.toUpperCase()
                  : live ? `LIVE · ${f.minute}'` : isReal ? "UPCOMING" : "REPLAY"}
              </Badge>
            </span>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:mt-5 sm:gap-6">
            <div className="flex min-w-0 items-center justify-end gap-2.5 sm:gap-4">
              <div className="truncate text-right font-display text-xl font-bold sm:text-4xl">{homeTeam}</div>
              <Flag team={homeTeam} big />
            </div>
            <div className="tnum rounded-xl border border-border bg-background/60 px-3.5 py-1.5 text-center font-display text-2xl font-bold tracking-wider backdrop-blur-sm sm:px-6 sm:py-2.5 sm:text-5xl">
              {f.home} : {f.away}
            </div>
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
              <Flag team={awayTeam} big />
              <div className="truncate font-display text-xl font-bold sm:text-4xl">{awayTeam}</div>
            </div>
          </div>
          {!isReal && meta?.kickoff && (
            <div className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 sm:mt-4">
              Replayed from real TxLINE data
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)_340px] xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        {/* LEFT RAIL: your bets + P&L (desktop) */}
        <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:self-start">
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Your net P&amp;L</div>
            <div className={"tnum mt-0.5 font-display text-xl font-bold " + (railPnl > 0 ? "text-success" : railPnl < 0 ? "text-danger" : "")}>
              {railPnl >= 0 ? "+" : ""}{railPnl.toFixed(3)} <span className="text-sm text-muted-foreground">SOL</span>
            </div>
          </Card>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-sm font-bold">Your bets</span>
              <a href="#/history" className="text-[11px] font-medium text-primary hover:underline">All →</a>
            </div>
            {!publicKey ? (
              <p className="text-xs text-muted-foreground">Connect your wallet to see your bets and history here.</p>
            ) : railRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No bets yet. Place one and it appears here instantly.</p>
            ) : (
              <div className="space-y-2">
                {railRows.slice(0, 12).map((r, i) => {
                  const fx = railFx[r.fixtureId];
                  return (
                    <a key={i} href={`#/app/${r.fixtureId}`} className="block rounded-lg border border-border p-2.5 transition-colors hover:bg-secondary/50">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={r.kind === "claim" ? "success" : r.kind === "settle" ? "secondary" : "outline"} className="text-[10px] capitalize">{r.kind}</Badge>
                        {r.amount != null && <span className="tnum text-[11px] font-semibold">{r.amount.toFixed(3)} SOL</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                        {fx ? (
                          <>
                            <Flag team={fx.home} />
                            <span className="min-w-0 flex-1 truncate">{fx.home} <span className="text-muted-foreground">v</span> {fx.away}</span>
                            <Flag team={fx.away} />
                          </>
                        ) : (
                          <span className="truncate">Fixture {r.fixtureId}</span>
                        )}
                      </div>
                      {r.outcome != null && <div className="mt-0.5 text-[10px] text-muted-foreground">{OUTCOME_LABELS[r.outcome]}</div>}
                    </a>
                  );
                })}
              </div>
            )}
          </Card>
        </aside>

        {/* MAIN: match + settlement + activity */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            {hasReplay && (
              <div className="space-y-4 border-b border-border p-5">
                <div>
                  <MatchViz minute={f.minute} home={f.home} away={f.away} status={dispStatus} playing={playing} homeTeam={homeTeam} awayTeam={awayTeam} />
                  {!playing && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      {hasBetHere ? "Bet placed. Press Kick off in the bet panel to start the match." : "Place a bet, then kick off to start the match."}
                    </p>
                  )}
                </div>

                {f.stats && <StatStrip stats={f.stats} />}

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><ChartLineUp weight="bold" size={13} /> Live win probability</span>
                    <span className="tnum normal-case">
                      <span style={{ color: "#4f7cff" }}>{prob(0)}%</span> · <span style={{ color: "#f6b73c" }}>{prob(1)}%</span> · <span style={{ color: "#f2685f" }}>{prob(2)}%</span>
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border"><WinProbChart frames={displayFrames} currentMinute={f.minute} height={80} /></div>
                  {feedSource && <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Sparkle weight="fill" size={11} /> {feedSource}</div>}
                </div>

                {events.length > 0 && <EventTimeline events={events} currentMinute={f.minute} homeTeam={homeTeam} awayTeam={awayTeam} />}
              </div>
            )}

            {/* compact outcomes */}
            <div className="p-5">
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkle weight="fill" size={13} /> Live pool split · winners share the whole pool
              </div>
              <div className="grid grid-cols-3 gap-2">
                {OUTCOME_LABELS.map((lbl, i) => {
                  const isWin = winner === i;
                  const tn = i === 0 ? homeTeam : i === 2 ? awayTeam : "";
                  return (
                    <button key={i} onClick={() => setSel(i)}
                      className={["rounded-xl border-[1.5px] p-3 text-left transition-colors",
                        isWin ? "border-success bg-success/5" : sel === i ? "border-primary bg-secondary" : "border-border hover:bg-secondary/50"].join(" ")}>
                      <div className="flex items-center gap-1 truncate text-[11px] font-medium text-muted-foreground">
                        {tn ? <><Flag team={tn} /> <span className="truncate">{tn}</span></> : <span>{lbl}</span>}
                        {isWin && <CheckCircle weight="fill" size={13} className="ml-auto text-success" />}
                      </div>
                      <div className="tnum mt-0.5 font-display text-xl font-bold">{total > 0 ? `${poolPct(i)}%` : "-"}</div>
                      <div className="tnum text-[10px] text-muted-foreground">{(market?.pools[i] ?? 0).toFixed(2)} SOL backed</div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full" style={{ width: poolPct(i) + "%", background: isWin ? "hsl(var(--success))" : OUTCOME_COLORS[i] }} />
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-right text-xs text-muted-foreground">Pool <b className="tnum text-foreground">{total.toFixed(3)} SOL</b></div>
            </div>
          </Card>

          {/* live TxODDS match data (real games, while the stream is fresh) */}
          {streaming && liveMatch && (
            <Card className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Broadcast weight="fill" size={15} className="text-success" /> Live match data</span>
                <span className="font-mono text-[10px] normal-case tracking-normal text-muted-foreground/70">streamed from TxODDS · {livePhase.label}</span>
              </div>

              {/* per-period goals (period-prefixed stat keys) - only the periods the match has
                  actually REACHED per the phase encoding (H1>=2, H2>=4, ET1>=7, ET2>=9, PE>=12),
                  so regulation matches never show empty ET/PE columns. */}
              {(() => {
                const MIN_PHASE: Record<string, number> = { H1: 2, H2: 4, ET1: 7, ET2: 9, PE: 12 };
                const reached = ["H1", "H2", "ET1", "ET2", "PE"].filter((p) => liveMatch.phase >= MIN_PHASE[p]);
                if (reached.length === 0) return null;
                return (
                  <div className="mb-4 overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-center text-sm">
                      <thead>
                        <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-1.5 text-left font-semibold">Goals</th>
                          {reached.map((p) => <th key={p} className="px-3 py-1.5 font-semibold">{p}</th>)}
                          <th className="px-3 py-1.5 font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="tnum">
                        {[0, 1].map((side) => (
                          <tr key={side} className={side === 0 ? "border-b border-border/60" : ""}>
                            <td className="flex items-center gap-1.5 px-3 py-1.5 text-left font-medium">
                              <Flag team={side === 0 ? homeTeam : awayTeam} /> <span className="truncate">{side === 0 ? homeTeam : awayTeam}</span>
                            </td>
                            {reached.map((p) => <td key={p} className="px-3 py-1.5">{liveMatch.periods[p]?.[side] ?? 0}</td>)}
                            <td className="px-3 py-1.5 font-bold">{liveMatch.score[side]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* discipline + corners (total-period keys 3-8) */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Yellow cards", v: liveMatch.yellows, dot: "#f6b73c" },
                  { label: "Red cards", v: liveMatch.reds, dot: "#f2685f" },
                  { label: "Corners", v: liveMatch.corners, dot: "#4f7cff" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-secondary/40 px-2 py-2">
                    <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} /> {s.label}
                    </div>
                    <div className="tnum mt-0.5 font-display text-sm font-bold">{s.v[0]} : {s.v[1]}</div>
                  </div>
                ))}
              </div>

              {liveMatch.lastAction && (
                <div className="mt-3 truncate text-[11px] text-muted-foreground">
                  Latest: <span className="font-medium text-foreground">{liveMatch.lastAction.action.replace(/_/g, " ")}</span>
                  {liveMatch.lastAction.participant ? ` · ${liveMatch.lastAction.participant === 1 ? homeTeam : awayTeam}` : ""}
                  {liveMatch.lastAction.text ? ` · ${liveMatch.lastAction.text}` : ""}
                </div>
              )}
            </Card>
          )}

          {/* live implied-probability chart (real games) */}
          {isReal && (
            <Card className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ChartLineUp weight="fill" size={15} /> Win probability
              </div>
              <LiveProbChart odds={oddsAvailable ? f.odds : null} homeTeam={homeTeam} awayTeam={awayTeam} seed={fixtureId} />
            </Card>
          )}

          {/* crowd vs consensus - value / edge finder */}
          {market && market.total > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Scales weight="fill" size={15} /> Crowd vs consensus
              </div>
              <div className="space-y-3">
                {OUTCOME_LABELS.map((lbl, i) => {
                  const e = edges[i];
                  const isValue = i === valueIdx && e.edge > 3;
                  const tn = i === 0 ? homeTeam : i === 2 ? awayTeam : "";
                  return (
                    <div key={i}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-medium">{tn && <Flag team={tn} />}{tn || lbl}</span>
                        {isValue && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">VALUE · crowd under-backing</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tnum w-16 shrink-0 text-[11px] text-muted-foreground">cons {Math.round(e.cons)}%</span>
                        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div className="absolute inset-y-0 left-0 rounded-full bg-primary/35" style={{ width: `${Math.min(100, e.cons)}%` }} title="Consensus (TxLINE odds)" />
                          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.min(100, e.crowd)}%` }} title="Crowd (staked SOL)" />
                        </div>
                        <span className="tnum w-16 shrink-0 text-right text-[11px] text-muted-foreground">crowd {Math.round(e.crowd)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Consensus = TxLINE demargined odds. Crowd = how the staked SOL splits. Where the crowd under-backs the consensus, there's <b className="text-success">value</b>.
              </p>
            </Card>
          )}

          {/* settlement */}
          <div ref={settleCardRef} className="scroll-mt-24">
          <Card className={"p-5" + (canSettleNow ? " border-success/40" : "")}>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <SealCheck weight="fill" size={15} /> Trustless settlement
            </div>
            {proof ? (
              <button type="button" onClick={() => setInspecting(true)}
                className="group block w-full overflow-hidden rounded-xl border border-success/30 bg-success/[0.04] text-left transition-colors hover:border-success/60">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-success/20 px-4 py-3">
                  <span className="font-display text-sm font-semibold">Proven full-time {proof.home}:{proof.away} → {proof.label}</span>
                  <Badge variant="success"><SealCheck weight="fill" size={13} /> Merkle-verified</Badge>
                </div>
                <div className="grid grid-cols-3 divide-x divide-success/15 text-center">
                  {[["Fixture", proof.payload?.fixtureProof?.length ?? 0], ["Main tree", proof.payload?.mainTreeProof?.length ?? 0], ["Stat", proof.payload?.stats?.[0]?.statProof?.length ?? 0]].map(([k, v]) => (
                    <div key={k as string} className="px-2 py-3">
                      <div className="tnum font-display text-lg font-bold">{v as number}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k} proof</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-success/20 px-4 py-2 font-mono text-[10px] text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-2"><TreeStructure size={12} className="shrink-0" /><span className="truncate">root {proof.dailyScoresPda}</span></span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-sans font-semibold text-success">Inspect proof <ArrowRight weight="bold" size={11} className="transition-transform group-hover:translate-x-0.5" /></span>
                </div>
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isReal ? "This live market settles once the match is final and its TxLINE score proof is available."
                  : "No bundled proof for this fixture yet. It settles once anyone submits its TxLINE score proof."}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {canSettleClaim ? (
                <Button variant="success" disabled={busy} onClick={settleAndClaim}>
                  <Trophy weight="fill" size={16} /> Settle &amp; claim ◎{settleClaimPayout.toFixed(3)}
                </Button>
              ) : (
                <Button variant="success" disabled={busy || !publicKey || !proof || market?.resolved || !market} onClick={settle}>
                  <SealCheck weight="fill" size={16} /> Settle with proof (anyone can)
                </Button>
              )}
              {market?.resolved && (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CheckCircle weight="fill" size={16} /> Resolved → {OUTCOME_LABELS[market.outcome]} wins
                </span>
              )}
            </div>
            {canSettleClaim && (
              <p className="mt-2 text-xs text-muted-foreground">One transaction proves the result and pays your winnings — no separate claim step.</p>
            )}
            {/* say WHY settlement isn't available instead of a silently dead button */}
            {!market?.resolved && (
              <p className="mt-2 text-xs text-amber-500">
                {!publicKey ? "Connect a wallet to settle."
                  : !market ? "This market has no stakes yet - the market account is created by the first bet, so there is nothing to settle."
                  : !proof ? "The score proof for this fixture isn't published yet. It appears once the result is anchored on-chain."
                  : !matchOver ? "Play the match to full time, then settle."
                  : "Ready - anyone can settle now."}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              resolve() rebuilds the win/draw/loss predicate itself and CPIs txoracle.validate_stat_v2. It settles only if the proof verifies against the on-chain root.
            </p>
          </Card>
          </div>

          {/* activity */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity</div>
              <a href="#/history" className="text-xs font-medium text-primary hover:underline">Your history →</a>
            </div>
            <div ref={logRef} className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/50 p-3 font-mono text-[12px] text-muted-foreground">
              {log.length ? log.join("\n") : (publicKey ? "Place a bet, play the match, then settle with the proof once it's final." : "Connect a wallet to place a bet.")}
            </div>
          </Card>
        </div>

        {/* RIGHT: Kalshi-style bet panel */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-base font-bold">Place a prediction</span>
              <span className="text-[11px] text-muted-foreground">≈ ${solPrice.toFixed(0)}/SOL</span>
            </div>

            {/* outcome pills - colour-keyed to the pitch territory */}
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
              {OUTCOME_LABELS.map((lbl, i) => (
                <button key={i} onClick={() => setSel(i)}
                  className={"rounded-lg py-2 text-center transition-colors " + (sel === i ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: OUTCOME_COLORS[i], opacity: sel === i ? 1 : 0.55 }} />
                    {lbl}
                  </div>
                  <div className="tnum text-[11px] font-bold">
                    {liveProb ? `${liveProb[i]}%` : total > 0 ? `${poolPct(i)}%` : "-"}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Backing</span>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  {selTeam ? <><Flag team={selTeam} /> {selTeam}</> : "Draw"}
                </span>
              </div>
              {est.hasPool && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your pool share</span>
                  <span className="tnum font-semibold">
                    {est.share.toFixed(0)}%
                    <span className="text-muted-foreground"> → pays {est.mult > 0 ? `${est.mult.toFixed(2)}×` : "-"}</span>
                  </span>
                </div>
              )}
            </div>

            {/* amount in USD */}
            <div className="mt-4">
              <div className="mb-1 text-xs text-muted-foreground">Amount</div>
              <div className="flex items-center rounded-xl border border-border bg-secondary px-3 transition-colors focus-within:border-primary/60">
                <span className="text-lg font-semibold text-muted-foreground">$</span>
                <input type="number" min={0} max={maxUsd} value={amountUsd}
                  onChange={(e) => setAmountUsd(Number(e.target.value))}
                  className="tnum w-full bg-transparent px-2 py-3 text-lg font-bold outline-none" />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {[5, 10, 25].map((v) => (
                  <button key={v} onClick={() => setAmountUsd(v)}
                    className={"rounded-lg border py-1.5 text-xs font-semibold transition-colors " +
                      (amountUsd === v ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                    ${v}
                  </button>
                ))}
                <button onClick={() => setAmountUsd(Math.floor(maxUsd))}
                  className={"rounded-lg border py-1.5 text-xs font-semibold transition-colors " +
                    (amountUsd === Math.floor(maxUsd) ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                  Max
                </button>
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">≈ {betSol.toFixed(3)} SOL · max ${MAX_BET_USD}</div>
            </div>

            {/* est payout - only when betting is actually possible (odds published, market open) */}
            {(!isReal || oddsAvailable) && !matchOver && !market?.resolved ? (
              <div className="mt-3 rounded-xl bg-secondary/60 px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Est. payout if it wins</span>
                  <div className="text-right">
                    <NumberFlow prefix="$" value={est.usd} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} className="tnum block font-display text-lg font-bold" />
                    <NumberFlow value={est.pct / 100} format={{ style: "percent", signDisplay: "always" }} className={"tnum block text-[11px] font-semibold " + (est.pct >= 0 ? "text-success" : "text-danger")} />
                  </div>
                </div>
                {est.projected && (
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    Projected from the consensus odds — your bet opens this market and it's auto-seeded with 1.5 SOL of counterparty liquidity.
                  </div>
                )}
              </div>
            ) : !market?.resolved && !matchOver ? (
              <div className="mt-3 rounded-xl bg-secondary/60 px-3.5 py-3 text-sm text-muted-foreground">
                Payout estimates appear once live odds are published for this fixture.
              </div>
            ) : null}

            {/* actions */}
            {!publicKey ? (
              <div className="mt-4"><WalletMultiButton style={{ width: "100%", justifyContent: "center" }} /></div>
            ) : (
              <>
                <Button className="mt-4 w-full" size="lg" disabled={busy || market?.resolved || matchOver || betClosed || (isReal && !oddsAvailable)} onClick={bet}>
                  {market?.resolved ? "Market settled"
                    : matchOver ? "Full time · settle below"
                    : betClosed ? "Closed at kickoff"
                    : `Bet $${amountUsd || 0} on ${OUTCOME_LABELS[sel]}`}
                </Button>
                {betClosed && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Warning weight="fill" size={13} className="text-amber-500" /> The pool locked at kickoff - no in-play bets. Settle &amp; claim after full time.
                  </p>
                )}
                {!betClosed && isReal && !oddsAvailable && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"><Warning weight="fill" size={13} /> No betting until odds are available.</p>
                )}
                {hasReplay && (
                  <div className="mt-2 flex gap-2">
                    {/* One-way control: kick off starts the match and it runs to full time - no pause,
                        no mid-match restarts (a paused match is a paused settlement). */}
                    <Button
                      variant={hasBetHere && !started && !matchOver ? "default" : "outline"}
                      className={"flex-1" + (hasBetHere && !started && !matchOver ? " kickoff-glow" : "")}
                      disabled={!hasBetHere || matchOver || started}
                      title={matchOver ? "Match ended" : started ? "Match in play" : !hasBetHere ? "Place a bet first" : undefined}
                      onClick={() => { if (!started && !playing) setPlaying(true); }}>
                      {matchOver ? "Full time"
                        : started ? <><Circle weight="fill" size={9} className="animate-pulseDot text-danger" /> In play · {f.minute}'</>
                        : <><SoccerBall weight="fill" size={15} /> Kick off</>}
                    </Button>
                    {matchOver && started && <Button variant="ghost" onClick={reset} title="Watch the replay again"><ArrowClockwise size={15} /></Button>}
                  </div>
                )}
              </>
            )}

            {/* your position */}
            {hasBet && !market?.resolved && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your position</div>
                <div className="space-y-1.5">
                  {myStakes!.map((amt, i) => (amt > 0 ? (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span><b>{OUTCOME_LABELS[i]}</b> <span className="tnum text-muted-foreground">{amt.toFixed(3)} SOL</span></span>
                      {!matchOver && !betClosed && !started && (
                        <button disabled={busy} onClick={() => cancel(i)} className="inline-flex items-center gap-1 text-xs font-medium text-danger hover:underline disabled:opacity-50">
                          <XCircle weight="fill" size={13} /> Cancel
                        </button>
                      )}
                    </div>
                  ) : null))}
                </div>
                {matchOver && (
                  <p className="mt-2 text-[11px] text-muted-foreground">Match over. Settle the market to claim your outcome.</p>
                )}
              </div>
            )}

            {/* stranded stake from the old per-wallet market layout */}
            {legacy && legacyRecoverable && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-500">Stranded stake found</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  A bet of <b className="tnum text-foreground">{legacyTotal.toFixed(3)} SOL</b> on this fixture sits on an
                  older market account this page no longer uses. {legacy.resolved ? "That market resolved - claim it back." : "Withdraw it back to your wallet."}
                </p>
                <Button variant="outline" size="sm" className="mt-2.5 w-full" disabled={busy} onClick={recoverLegacy}>
                  {legacy.resolved ? "Claim from old market" : `Withdraw ${legacyTotal.toFixed(3)} SOL`}
                </Button>
              </div>
            )}
            {legacy && !legacyRecoverable && (
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                An old bet on this fixture resolved against your pick - nothing left to recover.
              </p>
            )}

            {/* claim / result */}
            {canClaim && (
              <Button variant="success" className="mt-3 w-full" size="lg" disabled={busy} onClick={claim}>
                <Trophy weight="fill" size={16} /> Claim ${(cp.payout * solPrice).toFixed(2)}
              </Button>
            )}
            {claimed && <div className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-success"><CheckCircle weight="fill" size={16} /> Claimed</div>}
            {lostBet && (
              <button
                onClick={() => setReceipt({
                  payout: 0,
                  staked: (myStakes?.[0] ?? 0) + (myStakes?.[1] ?? 0) + (myStakes?.[2] ?? 0),
                  sig: "", win: false, void: false, ts: Date.now(), outcome: market?.outcome ?? 0,
                })}
                className="mt-3 w-full rounded-lg border border-border py-2.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground">
                Your pick didn't win · view loss receipt
              </button>
            )}

            <p className="mt-4 text-center text-[11px] text-muted-foreground">Parimutuel · winners split the pool · no house</p>
          </Card>
        </div>
      </div>

      {/* Floating "Settle now" pill — slides up like a bottom sheet once the result is in, and
          takes you to the settlement card. Hidden while that card is already on screen. */}
      {canSettleNow && !settleCardVisible && (
        <button
          type="button"
          aria-label="Go to settlement"
          onClick={() => scrollToEl(settleCardRef.current)}
          className="animate-settle-pop fixed bottom-5 left-1/2 z-[70] -translate-x-1/2"
        >
          <span className="settle-glow inline-flex items-center gap-2 rounded-full bg-success px-5 py-3 font-display text-sm font-bold text-success-foreground">
            <SealCheck weight="fill" size={17} /> Full time — settle now
          </span>
        </button>
      )}

      {/* notice modal */}
      <Modal open={!!notice} onClose={() => setNotice(null)}
        title={<span className="inline-flex items-center gap-2"><Warning weight="fill" size={20} className="text-amber-500" /> {notice?.title}</span>}>
        <p className="text-sm text-muted-foreground">{notice?.body}</p>
        <Button className="mt-5 w-full" onClick={() => setNotice(null)}>Got it</Button>
      </Modal>

      {/* simulation explainer - shown when landing on an already-settled sim */}
      <Modal open={simInfo} onClose={() => setSimInfo(false)} size="2xl">
        <div className="-m-6 overflow-hidden">
          {/* illustrated header - sim-balls.png artwork under a brand scrim so it blends with the
              dark modal and the light title/badge stay legible */}
          <div className="relative h-28 overflow-hidden rounded-t-2xl">
            <img src="/sim-balls.png" alt="" aria-hidden
              className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-br from-primary/45 via-background/70 to-card" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card via-card/60 to-transparent" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-end p-3">
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300 backdrop-blur-sm">
                <Flask weight="fill" size={11} /> Devnet · testing only
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-6 pb-3">
              <Sparkle weight="fill" size={22} className="text-primary" />
              <span className="font-display text-xl font-bold">Simulation mode</span>
            </div>
          </div>

          {/* body */}
          <div className="px-6 pb-6 pt-4 text-sm text-muted-foreground">
            <p>This match is a <b className="text-foreground">simulation</b>, and it has already been settled, so betting on it is closed. Here is what that means.</p>

            {/* four notices, 2 per row on desktop */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
                <div className="mb-1.5 flex items-center gap-2 font-semibold text-foreground"><SoccerBall weight="fill" size={17} className="text-primary" /> What it is for</div>
                <p>Simulation mode lets you experience the full Txsports flow. You place a stake, watch the match play out, and see it settle. It is here so you can test the platform when there is no upcoming real match to bet on.</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
                <div className="mb-1.5 flex items-center gap-2 font-semibold text-foreground"><SealCheck weight="fill" size={17} className="text-primary" /> Anyone can settle it</div>
                <p>There is no admin and no oracle. When the match is over, any Txsports user can settle the market by submitting an on chain proof of the real result. The person who settles is just a regular bettor, not the platform.</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
                <div className="mb-1.5 flex items-center gap-2 font-semibold text-foreground"><Lock weight="fill" size={17} className="text-primary" /> It settles once, then closes</div>
                <p>The moment one user settles it, the result is locked in and betting closes for everyone. A simulation replays a match whose result is already known, so it can be settled only once. This keeps it fair and stops anyone winning on a result they can look up.</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
                <div className="mb-1.5 flex items-center gap-2 font-semibold text-foreground"><Trophy weight="fill" size={17} className="text-primary" /> How payouts work</div>
                <p>Once the result is locked in, the whole pool is shared between everyone who backed the winning outcome, in proportion to their stake. There is no house and no rake, so winners are paid by the losing side.</p>
              </div>
            </div>

            {/* mainnet note, full width */}
            <div className="mt-3 flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5">
              <RocketLaunch weight="fill" size={18} className="mt-0.5 shrink-0 text-amber-400" />
              <p><b className="text-foreground">Testing only, not on Mainnet.</b> Simulation mode lets you try Txsports risk free on Solana Devnet. When Txsports launches on Mainnet, simulation mode is removed completely, and you will bet only on real, upcoming matches with live odds.</p>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1"><a href="#/app">Find another match to bet on <ArrowRight weight="bold" size={16} /></a></Button>
              <Button variant="outline" className="flex-1" onClick={() => setSimInfo(false)}>Got it</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* claim receipt - ticket style */}
      <Modal open={!!receipt} onClose={() => setReceipt(null)}>
        {receipt && (
          <div className="-m-6 overflow-hidden">
            {/* header */}
            <div className={"relative overflow-hidden px-6 pb-5 pt-6 " + (receipt.win && receipt.payout > receipt.staked ? "bg-success/10" : !receipt.win && !receipt.void && receipt.payout <= 0 ? "bg-danger/10" : "bg-secondary/40")}>
              {/* ball-in-net flourish, bleeding off the right edge and fading under the text */}
              <img
                src="/goal-net.png"
                alt=""
                aria-hidden
                className="pointer-events-none absolute -right-3 top-1/2 h-[150%] w-auto -translate-y-1/2 object-contain opacity-70 [mask-image:linear-gradient(to_left,#000_45%,transparent_85%)]"
              />
              <div className="relative flex items-center gap-3">
                <div className={"grid h-10 w-10 shrink-0 place-items-center rounded-full " + (!receipt.win && !receipt.void && receipt.payout <= 0 ? "bg-danger/15" : "bg-success/15")}>
                  {receipt.win ? <Trophy weight="fill" size={20} className="text-success" />
                    : !receipt.void && receipt.payout <= 0 ? <XCircle weight="fill" size={20} className="text-danger" />
                    : <Receipt weight="fill" size={20} />}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg font-bold leading-none">{receipt.void ? "Refunded" : receipt.win ? "You won!" : receipt.payout <= 0 ? "No win this time" : "Claim settled"}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{new Date(receipt.ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
                </div>
               
              </div>
            </div>

            {/* payout hero */}
            <div className="px-6 py-6 text-center">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{receipt.void ? "Refund" : "Payout"}</div>
              <div className="tnum mt-1.5 font-display text-4xl font-black leading-none">{receipt.payout.toFixed(3)} <span className="text-xl font-bold text-muted-foreground">SOL</span></div>
              <div className="tnum mt-1 text-sm text-muted-foreground">≈ ${(receipt.payout * solPrice).toFixed(2)}</div>
              {!receipt.void && receipt.win && (
                receipt.payout > receipt.staked + 1e-9 ? (
                  <div className="tnum mt-2.5 inline-block rounded-full bg-success/15 px-3 py-1 text-sm font-bold text-success">
                    +{(receipt.payout - receipt.staked).toFixed(3)} SOL profit ({receipt.staked > 0 ? Math.round(((receipt.payout - receipt.staked) / receipt.staked) * 100) : 0}%)
                  </div>
                ) : (
                  <div className="mt-2.5 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">Stake returned, no opposing bets in this pool yet</div>
                )
              )}
              {!receipt.void && !receipt.win && <div className="mt-2 text-sm text-muted-foreground">Your pick didn't win this one.</div>}
              {receipt.void && (
                <div className="mx-auto mt-3 max-w-sm rounded-lg border border-border bg-secondary/50 px-3 py-2 text-left text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Why the refund?</span> The result was{" "}
                  <span className="font-semibold text-foreground">
                    {receipt.outcome === 1 ? "a Draw" : receipt.outcome === 0 ? homeTeam : awayTeam}
                  </span>
                  , but nobody had staked on {receipt.outcome === 1 ? "the Draw" : receipt.outcome === 0 ? homeTeam : awayTeam}.
                  With no winning pool to split, the market is <span className="font-semibold text-foreground">void</span> and every
                  stake is returned in full — you got your {receipt.staked.toFixed(3)} SOL back.
                </div>
              )}
            </div>

            {/* perforated divider with ticket notches */}
            <div className="relative py-1">
              <div className="absolute left-0 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50" />
              <div className="mx-6 border-t-2 border-dashed border-border" />
              <div className="absolute right-0 top-1/2 h-5 w-5 translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50" />
            </div>

            {/* details */}
            <div className="space-y-2 px-6 py-4 font-mono text-[12px]">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Network</span><span>Solana Devnet</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Match</span><span className="truncate">{homeTeam} v {awayTeam}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Result</span><span>{OUTCOME_LABELS[receipt.outcome]} wins</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Staked</span><span className="tnum">{receipt.staked.toFixed(3)} SOL</span></div>
              {receipt.sig && (
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Signature</span>
                  <a className="truncate text-primary hover:underline" href={`https://explorer.solana.com/tx/${receipt.sig}?cluster=devnet`} target="_blank" rel="noreferrer">{receipt.sig.slice(0, 6)}…{receipt.sig.slice(-6)}</a>
                </div>
              )}
            </div>

            {/* faux barcode */}
            <div className="mx-6 mb-4 h-9 rounded text-foreground/70" style={{ backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px, currentColor 5px 6px, transparent 6px 10px, currentColor 10px 12px, transparent 12px 16px)" }} />

            {/* actions - explorer needs a tx signature; Post on X only when the user won or lost
                (not on a void refund, which is neither). */}
            <div className="flex items-center gap-2 px-6 pb-6">
              {receipt.sig && (
                <a href={`https://explorer.solana.com/tx/${receipt.sig}?cluster=devnet`} target="_blank" rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-secondary/60">
                  <ArrowSquareOut size={14} /> Explorer
                </a>
              )}
              {receipt.sig && !receipt.void && (
                <a
                  href={xIntentUrl(
                    receipt.win
                      ? `I won ${receipt.payout.toFixed(3)} SOL predicting ${homeTeam} vs ${awayTeam} on Txsports, a trustless on-chain prediction market settled by proof.`
                      : `My ${homeTeam} vs ${awayTeam} prediction on Txsports settled trustlessly on-chain by proof. No oracle, no house.`,
                    marketUrl(fixtureId)
                  )}
                  target="_blank" rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-secondary/60">
                  <XLogo weight="fill" size={14} /> Post on X
                </a>
              )}
              <Button className="flex-1" onClick={() => setReceipt(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      {inspecting && proof && <ProofInspector proof={proof} onClose={() => setInspecting(false)} />}
    </section>
  );
}

/** Live match stats comparison (possession %, shots, on-target, corners, cards) - home blue / away red. */
function StatStrip({ stats }: { stats: Stats }) {
  const rows: [string, number, number, string?][] = [
    ["Possession", stats.poss[0], stats.poss[1], "%"],
    ["Shots", stats.shots[0], stats.shots[1]],
    ["On target", stats.sot?.[0] ?? 0, stats.sot?.[1] ?? 0],
    ["Corners", stats.corners[0], stats.corners[1]],
    ["Cards", stats.cards[0], stats.cards[1]],
  ];
  return (
    <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
      {rows.map(([label, h, a, unit]) => {
        const hPct = label === "Possession" ? h : ((h + a) ? (h / (h + a)) * 100 : 50);
        return (
          <div key={label}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="tnum w-10 font-bold">{h}{unit ?? ""}</span>
              <span className="uppercase tracking-wide text-muted-foreground">{label}</span>
              <span className="tnum w-10 text-right font-bold">{a}{unit ?? ""}</span>
            </div>
            <div className="mt-1 flex h-1 gap-0.5 overflow-hidden rounded-full bg-secondary">
              <div style={{ width: `${hPct}%`, background: "#4f7cff" }} className="h-full" />
              <div style={{ width: `${100 - hPct}%`, background: "#f2685f" }} className="h-full" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Key-event timeline across the match minutes - home above the line, away below. */
function EventTimeline({ events, currentMinute, homeTeam, awayTeam }: {
  events: MatchEvent[]; currentMinute: number; homeTeam: string; awayTeam: string;
}) {
  const marker = (e: MatchEvent) => {
    const color = e.team === 0 ? "#4f7cff" : "#f2685f";
    if (e.kind === "goal") return <span className="grid h-4 w-4 place-items-center rounded-full text-white" style={{ background: color }}><SoccerBall weight="fill" size={10} /></span>;
    if (e.kind === "yellow") return <span className="h-3 w-2.5 rounded-[2px]" style={{ background: "#f6b73c" }} />;
    if (e.kind === "red") return <span className="h-3 w-2.5 rounded-[2px]" style={{ background: "#ef4444" }} />;
    return <span className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-black text-white" style={{ background: color }}>P</span>;
  };
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Match events</div>
      <div className="relative h-11">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {events.map((e, i) => {
          const x = Math.min(98, Math.max(2, (e.minute / 92) * 100));
          const played = e.minute <= currentMinute;
          return (
            <div key={i} className={"absolute flex -translate-x-1/2 flex-col items-center gap-0.5 transition-opacity " + (played ? "opacity-100" : "opacity-20")}
              style={{ left: `${x}%`, top: 0 }} title={`${e.minute}' ${e.note ? e.note + " " : ""}${e.kind} · ${e.team === 0 ? homeTeam : awayTeam}`}>
              <div className="h-4">{e.team === 0 && marker(e)}</div>
              <span className="tnum text-[8px] leading-none text-muted-foreground">{e.minute}'</span>
              <div className="h-4">{e.team === 1 && marker(e)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The bundled proof.json stores BN numeric fields as hex (BN.toJSON), so parse them base 16.
function revive(p: any) {
  return {
    ...p,
    ts: new BN(p.ts, 16),
    fixtureSummary: {
      ...p.fixtureSummary,
      fixtureId: new BN(p.fixtureSummary.fixtureId, 16),
      updateStats: {
        updateCount: p.fixtureSummary.updateStats.updateCount,
        minTimestamp: new BN(p.fixtureSummary.updateStats.minTimestamp, 16),
        maxTimestamp: new BN(p.fixtureSummary.updateStats.maxTimestamp, 16),
      },
    },
  };
}
