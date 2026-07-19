import { BorshCoder, EventParser, BN } from "@coral-xyz/anchor";
import type { Connection } from "@solana/web3.js";
import { IDL, PROGRAM_ID, LAMPORTS_PER_SOL } from "../config";
import { storeTrades } from "./supabase";

// A single platform-wide bet, decoded from a `BetPlaced` event the program emits on every stake.
// Unlike lib/history.ts (which is the connected wallet's own history), this reads the chain so the
// "Recent bets" rail shows EVERY bettor's activity, not just yours.
export interface OnchainBet {
  sig: string;
  ts: number; // ms
  market: string; // market PDA (base58)
  bettor: string; // wallet (base58)
  outcome: number; // 0=Home, 1=Draw, 2=Away
  amount: number; // SOL
}

const coder = new BorshCoder(IDL);
const parser = new EventParser(PROGRAM_ID, coder);

// Mirror what we read into Supabase at most once a minute (polling calls this every 20s).
let lastStore = 0;

/**
 * Fetch the most recent bets placed across all markets on the platform.
 * Scans the program's latest transactions and decodes their `BetPlaced` events, newest first.
 */
export async function fetchRecentBets(conn: Connection, limit = 40): Promise<OnchainBet[]> {
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit });
  if (sigs.length === 0) return [];

  // Fetch each transaction INDIVIDUALLY (not as a JSON-RPC batch): Helius rejects batched
  // getTransactions (-32413), so we run single-tx calls with a small concurrency cap instead.
  const bets: OnchainBet[] = [];
  let idx = 0;
  const worker = async () => {
    while (idx < sigs.length) {
      const s = sigs[idx++];
      let tx;
      try {
        tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
      } catch { continue; }
      const logs = tx?.meta?.logMessages;
      if (!logs || tx?.meta?.err) continue;
      const ts = ((s.blockTime ?? tx?.blockTime ?? 0) as number) * 1000;
      try {
        for (const ev of parser.parseLogs(logs)) {
          if (ev.name.toLowerCase() !== "betplaced") continue;
          const d: any = ev.data;
          bets.push({
            sig: s.signature,
            ts,
            market: d.market.toBase58(),
            bettor: d.bettor.toBase58(),
            outcome: Number(d.outcome),
            amount: (d.amount as BN).toNumber() / LAMPORTS_PER_SOL,
          });
        }
      } catch {
        /* logs from an unrelated program / undecodable - skip */
      }
    }
  };
  await Promise.all(Array.from({ length: 2 }, worker)); // low concurrency to stay under RPC rate limits
  bets.sort((a, b) => b.ts - a.ts); // newest first (workers finish out of order)

  // Persist the platform trade log (durable mirror for the marquee / analytics).
  if (bets.length && Date.now() - lastStore > 60_000) {
    lastStore = Date.now();
    void storeTrades(bets);
  }
  return bets;
}
