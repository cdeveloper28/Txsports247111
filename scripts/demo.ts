/**
 * End-to-end demo of the trustless parimutuel market (native SOL stakes):
 *   open market -> two bettors stake SOL -> permissionless resolve via a REAL TxLINE Merkle proof
 *   (CPI into txoracle.validate_stat_v2) -> winner claims the whole pool.
 *
 * Requires a saved proof from `capture-proof.ts` at fixtures/<FIXTURE_ID>.json and a built
 * program IDL at target/idl/worldcup_market.json.
 *
 * Run (WSL):
 *   ANCHOR_PROVIDER_URL=<devnet rpc> ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   FIXTURE_ID=17926686 ts-node scripts/demo.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import { TXLINE, dailyScoresPda } from "./txline";

import idl from "../target/idl/worldcup_market.json";

const FIXTURE_ID = Number(process.env.FIXTURE_ID ?? 0);
const OUTCOME_LABELS = ["Home", "Draw", "Away"];
const lamports = (sol: number) => new BN(Math.round(sol * LAMPORTS_PER_SOL));

/** Revive the BN fields that JSON.stringify turned into strings. */
// BN.toJSON() serialises to hex, so the saved proof's numeric fields are hex strings — parse base 16.
function revivePayload(p: any) {
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

// Retry transient RPC/network failures (WSL connectivity can be flaky).
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      console.log(`  retry ${label} (${i + 1}/${tries}): ${String(e?.message ?? e).slice(0, 70)}`);
      await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
    }
  }
  throw last;
}

async function fundSol(provider: anchor.AnchorProvider, to: PublicKey, sol: number) {
  const ix = SystemProgram.transfer({
    fromPubkey: provider.wallet.publicKey,
    toPubkey: to,
    lamports: Math.round(sol * LAMPORTS_PER_SOL),
  });
  await withRetry("fundSol", () => provider.sendAndConfirm(new anchor.web3.Transaction().add(ix), []));
}

const solBal = async (c: anchor.web3.Connection, k: PublicKey) => (await c.getBalance(k)) / LAMPORTS_PER_SOL;

async function main() {
  if (!FIXTURE_ID) throw new Error("Set FIXTURE_ID (must match a saved fixtures/<id>.json proof)");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const connection = provider.connection;
  const creator = (provider.wallet as anchor.Wallet).payer as Keypair;

  const saved = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "fixtures", `${FIXTURE_ID}.json`), "utf8")
  );
  const payload = revivePayload(saved.payload);
  const winner: number = saved.outcome;
  const loser = winner === 2 ? 0 : winner + 1; // any other outcome
  console.log(
    `Fixture ${FIXTURE_ID}: proven full-time ${saved.home}-${saved.away} => ${saved.label} (winning outcome ${winner})`
  );

  // --- two bettors, funded with native SOL ---
  const alice = Keypair.generate(); // backs the WINNER
  const bob = Keypair.generate(); // backs a LOSER
  await fundSol(provider, alice.publicKey, 0.12);
  await fundSol(provider, bob.publicKey, 0.10);

  // --- PDAs (market keyed only by fixture id now that stakes are native SOL) ---
  const fixtureLe = new BN(FIXTURE_ID).toArrayLike(Buffer, "le", 8);
  const [market] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), fixtureLe],
    program.programId
  );
  const positionPda = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), market.toBuffer(), owner.toBuffer()],
      program.programId
    )[0];

  // --- open market ---
  const closesAt = new BN(Math.floor(Date.now() / 1000) + 3600);
  console.log("opening market...");
  await withRetry("initMarket", () =>
    program.methods
      .initMarket(new BN(FIXTURE_ID), closesAt)
      .accounts({
        market,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  );

  // --- place bets (native SOL) ---
  const bet = async (who: Keypair, outcome: number, amtSol: number) => {
    await withRetry("bet", () =>
      program.methods
        .placeBet(outcome, lamports(amtSol))
        .accounts({
          market,
          position: positionPda(who.publicKey),
          bettor: who.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([who])
        .rpc()
    );
    console.log(`  ${who.publicKey.toBase58().slice(0, 6)} staked ${amtSol} SOL on ${OUTCOME_LABELS[outcome]}`);
  };
  console.log("placing bets...");
  await bet(alice, winner, 0.06); // Alice backs the eventual winner
  await bet(bob, loser, 0.04); // Bob backs a loser
  console.log(`  pool: ${await solBal(connection, market)} SOL held in the market PDA`);

  // --- permissionless resolve via real TxLINE proof (anyone can call) ---
  const dsPda = dailyScoresPda(payload.fixtureSummary.updateStats.minTimestamp);
  console.log(`resolving via TxLINE proof (CPI -> validate_stat_v2), root PDA ${dsPda.toBase58()}...`);
  const cuIx = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  await withRetry("resolve", () =>
    program.methods
      .resolve(winner, payload)
      .accounts({
        market,
        dailyScoresMerkleRoots: dsPda,
        txoracleProgram: TXLINE.oracleProgram,
        payer: creator.publicKey,
      })
      .preInstructions([cuIx])
      .rpc()
  );
  console.log(`  market resolved to ${OUTCOME_LABELS[winner]} — enforced purely by the Merkle proof`);

  // --- claims (native SOL) ---
  const claim = async (who: Keypair) => {
    const before = await solBal(connection, who.publicKey);
    await withRetry("claim", () =>
      program.methods
        .claim()
        .accounts({
          market,
          position: positionPda(who.publicKey),
          owner: who.publicKey,
        })
        .signers([who])
        .rpc()
    );
    const after = await solBal(connection, who.publicKey);
    console.log(`  ${who.publicKey.toBase58().slice(0, 6)} claim: ${before.toFixed(4)} -> ${after.toFixed(4)} SOL (+${(after - before).toFixed(4)})`);
  };
  console.log("claiming...");
  await claim(alice); // winner: gets the whole 0.10 SOL pool
  await claim(bob); // loser: +0

  // --- wire the frontend to this on-chain market + captured proof ---
  try {
    const appSrc = path.join(__dirname, "..", "app", "src");
    const appPub = path.join(__dirname, "..", "app", "public");
    fs.mkdirSync(appPub, { recursive: true });
    fs.writeFileSync(
      path.join(appSrc, "deploy.json"),
      JSON.stringify(
        { programId: program.programId.toBase58(), fixtureId: FIXTURE_ID, market: market.toBase58() },
        null,
        2
      )
    );
    fs.copyFileSync(
      path.join(__dirname, "..", "fixtures", `${FIXTURE_ID}.json`),
      path.join(appPub, "proof.json")
    );
    console.log("wired frontend: app/src/deploy.json + app/public/proof.json");
  } catch (e) {
    console.warn("could not wire frontend files:", e);
  }

  console.log("\nDONE: winner paid the entire SOL pool, settled with no oracle and no admin key.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
