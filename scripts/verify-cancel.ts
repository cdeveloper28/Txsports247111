/**
 * Verify cancel_bet on-chain: open a throwaway market, stake SOL, cancel it, and confirm the
 * stake is zeroed in the position and the lamports are refunded. Non-destructive to demo fixtures.
 *
 * Run (WSL): npx ts-node scripts/verify-cancel.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import idl from "../target/idl/worldcup_market.json";

const FIXTURE = Number(process.env.FIXTURE_ID ?? 990000777);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const conn = provider.connection;
  const me = (provider.wallet as anchor.Wallet).publicKey;

  const fixtureLe = new BN(FIXTURE).toArrayLike(Buffer, "le", 8);
  const [market] = PublicKey.findProgramAddressSync([Buffer.from("market"), fixtureLe], program.programId);
  const [position] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), me.toBuffer()], program.programId);

  try {
    await (program.account as any).market.fetch(market);
  } catch {
    await program.methods.initMarket(new BN(FIXTURE), new BN(Math.floor(Date.now() / 1000) + 3600))
      .accounts({ market, creator: me, systemProgram: SystemProgram.programId }).rpc();
    console.log("opened throwaway market");
  }

  const stake = new BN(Math.round(0.05 * LAMPORTS_PER_SOL));
  const before = await conn.getBalance(me);
  await program.methods.placeBet(0, stake)
    .accounts({ market, position, bettor: me, systemProgram: SystemProgram.programId }).rpc();
  const afterBet = await conn.getBalance(me);

  await program.methods.cancelBet(0)
    .accounts({ market, position, owner: me }).rpc();
  const afterCancel = await conn.getBalance(me);

  const pos: any = await (program.account as any).position.fetch(position);
  const staked = pos.amounts[0].toString();
  console.log(`balance: before ${(before / 1e9).toFixed(4)} -> bet ${(afterBet / 1e9).toFixed(4)} -> cancel ${(afterCancel / 1e9).toFixed(4)} SOL`);
  console.log(`refund recovered: +${((afterCancel - afterBet) / 1e9).toFixed(4)} SOL (~0.05 stake back, minus tx fee)`);
  console.log(`position Home stake after cancel: ${staked}`);
  console.log(staked === "0" && afterCancel > afterBet ? "OK: cancel_bet zeroed the stake and refunded the SOL." : "FAIL");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
