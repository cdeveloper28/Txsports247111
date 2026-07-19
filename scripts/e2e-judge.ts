/**
 * End-to-end "judge flow" test against the LIVE deployed program: a fresh throwaway wallet opens
 * its own simulation sandbox, bets on the (known) winning outcome, waits for the seeder bot to
 * drop counterparty liquidity, settles with the real TxLINE proof, and claims - asserting the
 * judge walks away with MORE than they staked. Exactly what a hackathon judge will experience.
 *
 * Run: ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=~/.config/solana/id.json ts-node scripts/e2e-judge.ts
 *      (env: FIXTURE_ID - must have app/public/proof-<id>.json with finalised periods)
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import idl from "../target/idl/worldcup_market.json";

const FIXTURE_ID = Number(process.env.FIXTURE_ID ?? 18175918);
const BET = 0.1; // SOL the judge stakes
const TXORACLE = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

const revive = (p: any) => ({
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
});

const dailyScoresPda = (tsMs: number) => {
  const seed = Buffer.alloc(2);
  seed.writeUInt16LE(Math.floor(tsMs / 86_400_000) & 0xffff, 0);
  return PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), seed], TXORACLE)[0];
};

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const conn = provider.connection;
  const funder = (provider.wallet as anchor.Wallet).payer as Keypair;

  const proof = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app", "public", `proof-${FIXTURE_ID}.json`), "utf8"));
  const payload = revive(proof.payload);
  const winner: number = proof.outcome;
  console.log(`fixture ${FIXTURE_ID}: proven result = ${proof.label} (outcome ${winner})`);

  // 1) fresh judge wallet, funded with 0.35 SOL
  const judge = Keypair.generate();
  console.log(`judge wallet: ${judge.publicKey.toBase58()}`);
  await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({
    fromPubkey: funder.publicKey, toPubkey: judge.publicKey, lamports: 0.35 * LAMPORTS_PER_SOL,
  })), []);

  // 2) judge opens THEIR OWN sandbox for the fixture and bets on the winner
  const host = judge.publicKey;
  const fxLe = new BN(FIXTURE_ID).toArrayLike(Buffer, "le", 8);
  const [market] = PublicKey.findProgramAddressSync([Buffer.from("market"), fxLe, host.toBuffer()], program.programId);
  const [position] = PublicKey.findProgramAddressSync([Buffer.from("position"), market.toBuffer(), judge.publicKey.toBuffer()], program.programId);
  const closesAt = new BN(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);

  const initIx = await program.methods.initMarket(new BN(FIXTURE_ID), closesAt, host)
    .accounts({ market, creator: judge.publicKey, systemProgram: SystemProgram.programId }).instruction();
  await program.methods.placeBet(winner, new BN(BET * LAMPORTS_PER_SOL))
    .accounts({ market, position, bettor: judge.publicKey, systemProgram: SystemProgram.programId })
    .preInstructions([initIx]).signers([judge]).rpc();
  console.log(`sandbox ${market.toBase58().slice(0, 8)}… opened; judge bet ${BET} SOL on outcome ${winner}`);

  // 3) wait for the seeder bot to add counterparty liquidity
  console.log("waiting for seeder bot…");
  let seeded = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const m: any = await (program.account as any).market.fetch(market);
    const total = Number(m.totalPool.toString()) / LAMPORTS_PER_SOL;
    if (total > BET + 0.5) { console.log(`  bot seeded - pool now ${total.toFixed(3)} SOL`); seeded = true; break; }
  }
  if (!seeded) throw new Error("seeder bot never seeded the sandbox (check seeder-bot.log)");

  // 4) permissionless settle with the real TxLINE Merkle proof
  const ds = dailyScoresPda(Number(payload.fixtureSummary.updateStats.minTimestamp.toString()));
  const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  await program.methods.resolve(winner, payload)
    .accounts({ market, dailyScoresMerkleRoots: ds, txoracleProgram: TXORACLE, payer: funder.publicKey })
    .preInstructions([cu]).rpc();
  console.log("settled via Merkle proof");

  // 5) judge claims - must receive MORE than staked
  const before = await conn.getBalance(judge.publicKey);
  await program.methods.claim()
    .accounts({ market, position, owner: judge.publicKey }).signers([judge]).rpc();
  const after = await conn.getBalance(judge.publicKey);
  const won = (after - before) / LAMPORTS_PER_SOL;
  console.log(`claimed ${won.toFixed(4)} SOL on a ${BET} SOL stake (${won > BET ? "PROFIT +" + (won - BET).toFixed(4) : "NO PROFIT"})`);
  if (won <= BET) throw new Error("E2E FAIL: judge did not profit");
  console.log("E2E PASS: judge flow (sandbox -> bet -> bot seed -> proof settle -> profitable claim) works");
}

main().then(() => process.exit(0)).catch((e) => { console.error("E2E FAIL:", e?.message ?? e); process.exit(1); });
