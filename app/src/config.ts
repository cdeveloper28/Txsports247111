import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import idl from "./idl/worldcup_market.json";
import deploy from "./deploy.json";

export const IDL = idl as any;
export const PROGRAM_ID = new PublicKey(IDL.address);
export const RPC = (import.meta as any).env?.VITE_RPC_URL ?? "https://api.devnet.solana.com";
export const TXORACLE = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

// The "hero" fixture wired by scripts/demo.ts - it has an on-chain market + a captured proof.
export const HERO_FIXTURE_ID = Number((deploy as any).fixtureId ?? 0);
export const HERO_MARKET = (deploy as any).market ? new PublicKey((deploy as any).market) : null;

export const OUTCOME_LABELS = ["Home", "Draw", "Away"] as const;
export const LAMPORTS_PER_SOL = 1_000_000_000;

// Platform liquidity/seed wallet - its 3-way pool provisioning is not user betting activity.
export const LIQUIDITY_WALLET = "CNsw2bqPDgogQyizetudUmJvb26oCWLTMXc1veaMsJeg";

/** Host key for the shared, global market of a fixture (real/live events). */
export const SHARED_HOST = PublicKey.default;

/**
 * Market PDA: keyed by fixture id + host. `SHARED_HOST` (default pubkey) is the one global market
 * for a fixture; a wallet pubkey is that wallet's private simulation sandbox, so every player can
 * replay the same fixture independently.
 */
export function marketPdaFor(fixtureId: number, host: PublicKey = SHARED_HOST): PublicKey {
  const fx = new BN(fixtureId).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync([Buffer.from("market"), fx, host.toBuffer()], PROGRAM_ID)[0];
}

export function positionPdaFor(market: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function dailyScoresPda(minTimestampMs: number): PublicKey {
  const epochDay = Math.floor(minTimestampMs / 86_400_000);
  const seed = Buffer.alloc(2);
  seed.writeUInt16LE(epochDay & 0xffff, 0);
  return PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), seed], TXORACLE)[0];
}
