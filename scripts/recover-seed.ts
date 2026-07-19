/**
 * Recover all of this wallet's seed liquidity from OPEN (unresolved, not-yet-closed) markets by
 * cancelling every outcome stake. Run BEFORE a program upgrade that changes market PDA seeds, or
 * the funds become unreachable under the new derivation.
 *
 * Run (WSL): ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=~/.config/solana/id.json ts-node scripts/recover-seed.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import idl from "../target/idl/worldcup_market.json";

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 6): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e: any) { last = e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); }
  }
  throw last;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const me = provider.wallet.publicKey;

  const bal0 = await provider.connection.getBalance(me);
  console.log(`wallet ${me.toBase58().slice(0, 6)}… balance: ${(bal0 / LAMPORTS_PER_SOL).toFixed(3)} SOL`);

  // Every position owned by this wallet (memcmp on the owner field after the 8-byte disc + 32-byte market).
  const positions = await (program.account as any).position.all([
    { memcmp: { offset: 8 + 32, bytes: me.toBase58() } },
  ]);
  console.log(`found ${positions.length} positions`);

  let recovered = 0, skipped = 0;
  for (const { account: p } of positions) {
    const marketPk: PublicKey = p.market;
    let m: any;
    // No retry here: old-layout (pre-upgrade) markets fail DECODE permanently - retrying just
    // burns a minute per orphan. A transient network miss is fine; the script is re-runnable.
    try { m = await (program.account as any).market.fetch(marketPk); }
    catch { console.log(`  ${marketPk.toBase58().slice(0, 8)}…: unreadable (old layout) - skipping`); skipped++; continue; }
    const id = (m.fixtureId as BN).toString();
    // Recover from SANDBOX markets only (host != default). Shared markets are deliberate,
    // ongoing seed liquidity - set RECOVER_SHARED=1 to include them (e.g. before a seed-scheme change).
    if (m.host && (m.host as PublicKey).equals(PublicKey.default) && process.env.RECOVER_SHARED !== "1") {
      console.log(`  ${id}: shared market - leaving seed liquidity in place`); skipped++; continue;
    }
    if (m.resolved) {
      // Resolved: cancel is impossible, but an unclaimed winning/void position can still be claimed.
      if (p.claimed) { console.log(`  ${id}: resolved + already claimed`); skipped++; continue; }
      const [position] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), marketPk.toBuffer(), me.toBuffer()], program.programId);
      try {
        const before = await provider.connection.getBalance(me);
        await withRetry("claim", () => program.methods.claim()
          .accounts({ market: marketPk, position, owner: me }).rpc());
        const after = await provider.connection.getBalance(me);
        recovered += (after - before) / LAMPORTS_PER_SOL;
        console.log(`  ${id}: resolved - claimed ${((after - before) / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
      } catch (e: any) { console.log(`  ${id}: claim failed (${e?.message ?? e})`); skipped++; }
      continue;
    }
    if ((m.closesAt as BN).toNumber() <= Date.now() / 1000) { console.log(`  ${id}: betting closed - not cancellable`); skipped++; continue; }

    for (let o = 0; o < 3; o++) {
      const amt = (p.amounts[o] as BN).toNumber() / LAMPORTS_PER_SOL;
      if (amt <= 0) continue;
      const [position] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), marketPk.toBuffer(), me.toBuffer()], program.programId);
      try {
        await withRetry(`cancel${o}`, () => program.methods.cancelBet(o)
          .accounts({ market: marketPk, position, owner: me })
          .rpc());
        recovered += amt;
        console.log(`  ${id}: cancelled outcome ${o} (+${amt.toFixed(3)} SOL)`);
      } catch (e: any) {
        console.log(`  ${id}: cancel outcome ${o} FAILED (${e?.message ?? e})`);
      }
    }
  }

  const bal1 = await provider.connection.getBalance(me);
  console.log(`done. recovered ~${recovered.toFixed(3)} SOL (skipped ${skipped}); wallet now ${(bal1 / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? e); process.exit(1); });
