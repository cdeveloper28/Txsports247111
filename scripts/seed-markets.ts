/**
 * Seed the top simulation markets with counterparty liquidity from the dev wallet so that a winning
 * bettor actually profits (parimutuel pays winners a share of the *other* pools — with no other
 * bettors, a lone winner only gets their stake back). Each market gets a fixed SOL budget split
 * across the 3 outcomes *proportional to the TxLINE consensus* (with a floor so every pool has real
 * liquidity) — so the pre-loaded pools mirror the odds rather than a flat 33/33/33 (which would make
 * the crowd-vs-consensus edge finder flag the favourite on every market). Backing the favourite then
 * pays a little; backing an underdog pays a lot — real parimutuel. Never reveals the actual result.
 * Picks the most competitive markets (by odds) so the featured / hot picks are covered.
 *
 * Run (WSL): npx ts-node scripts/seed-markets.ts   (env: SEED_N, SEED_TOTAL, SEED_FLOOR)
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import idl from "../target/idl/worldcup_market.json";

const N = Number(process.env.SEED_N ?? 12);
const TOTAL = Number(process.env.SEED_TOTAL ?? 0.12); // SOL seeded per market, split across outcomes
const FLOOR = Number(process.env.SEED_FLOOR ?? 0.16); // min share of the budget per outcome
const lam = (s: number) => new BN(Math.round(s * LAMPORTS_PER_SOL));

function implied(odds?: number[]): [number, number, number] {
  const p = odds && odds.some((o) => o > 0) ? odds.map((o) => (o > 0 ? 1 / o : 0)) : [1, 1, 1];
  const s = p.reduce((a, b) => a + b, 0) || 1;
  return p.map((x) => x / s) as [number, number, number];
}

function heat(odds?: number[]): number {
  if (!odds || !odds.some((o) => o > 0)) return -1;
  const n = [...implied(odds)].sort((a, b) => b - a);
  return 1 - (n[0] - n[1]);
}

/** Split `total` SOL across the 3 outcomes by consensus, with a per-outcome floor. */
function seedSplit(odds: number[] | undefined, total: number): [number, number, number] {
  let w = implied(odds).map((x) => Math.max(FLOOR, x));
  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => (x / s) * total) as [number, number, number];
}

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

  const pub = path.join(__dirname, "..", "app", "public");
  const yearOut = () => Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

  // Everything is a SHARED market (host = default pubkey), the classic one-pool-per-event model:
  //   sims  - close a year out (replayable until settled once),
  //   reals - close at KICKOFF; odds-less ones get a flat 1/3 split until TxLINE publishes prices.
  const REAL_TOTAL = Number(process.env.SEED_TOTAL_REAL ?? TOTAL);
  const sims = fs.readdirSync(pub)
    .filter((f) => /^feed-\d+\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(pub, f), "utf8")))
    .map((d) => ({ id: d.fixtureId as number, odds: d.frames?.[0]?.odds as number[] | undefined, closesAt: yearOut(), kind: "sim" }))
    .sort((a, b) => heat(b.odds) - heat(a.odds))
    .slice(0, N);
  const fixtures = JSON.parse(fs.readFileSync(path.join(pub, "fixtures.json"), "utf8")) as any[];
  const reals = fixtures
    .filter((f) => (f.category ?? (f.featured ? "simulation" : "real")) === "real")
    .filter((f) => (f.status === "UPCOMING" || f.status === "LIVE"))
    .filter((f) => !f.kickoff || f.kickoff / 1000 > Date.now() / 1000 + 120) // still open to bet
    .map((f) => ({ id: f.fixtureId as number, odds: (f.odds ?? undefined) as number[] | undefined, closesAt: f.kickoff ? Math.floor(f.kickoff / 1000) : yearOut(), kind: "real" }));
  const pick = [...sims, ...reals];

  console.log(`seeding ${pick.length} shared markets (${sims.length} sims @ ~${TOTAL}, ${reals.length} reals @ ~${REAL_TOTAL} SOL) from ${me.toBase58().slice(0, 6)}…`);
  const bal0 = await provider.connection.getBalance(me);
  console.log(`wallet balance: ${(bal0 / LAMPORTS_PER_SOL).toFixed(3)} SOL`);

  const SHARED_HOST = PublicKey.default; // shared/global market host key
  let seededCount = 0, spent = 0;
  for (const { id, odds, closesAt, kind } of pick) {
    const fixtureLe = new BN(id).toArrayLike(Buffer, "le", 8);
    const [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), fixtureLe, SHARED_HOST.toBuffer()], program.programId);
    const [position] = PublicKey.findProgramAddressSync([Buffer.from("position"), market.toBuffer(), me.toBuffer()], program.programId);
    const target = seedSplit(odds, kind === "real" ? REAL_TOTAL : TOTAL);

    // A transient RPC failure on one market must not abort the whole run — log it and move on
    // (re-running tops up whatever was missed, since it's idempotent).
    try {
      let m: any = null;
      try { m = await withRetry("fetchMarket", () => (program.account as any).market.fetch(market)); } catch {}
      if (m?.resolved) { console.log(`  ${id}: already resolved — skipping`); continue; }

      // Equalize on the MARKET's actual pools (everyone's stakes, not just ours) so every market
      // lands on the same total. Pools can only grow, so outcomes already above their target share
      // simply keep their excess.
      let have: [number, number, number] = [0, 0, 0];
      if (m) have = (m.pools as BN[]).map((x) => x.toNumber() / LAMPORTS_PER_SOL) as [number, number, number];

      if (!m) {
        await withRetry("init", () => program.methods
          .initMarket(new BN(id), new BN(closesAt), SHARED_HOST)
          .accounts({ market, creator: me, systemProgram: SystemProgram.programId }).rpc());
      }

      const add: [number, number, number] = [0, 0, 0];
      let added = 0;
      for (let o = 0; o < 3; o++) {
        const delta = target[o] - have[o];
        if (delta > 0.002) {
          await withRetry(`bet${o}`, () => program.methods.placeBet(o, lam(delta))
            .accounts({ market, position, bettor: me, systemProgram: SystemProgram.programId }).rpc());
          add[o] = delta; added += delta;
        }
      }
      if (added < 0.002) { console.log(`  ${id}: already at target — skipping`); continue; }
      spent += added; seededCount++;
      console.log(`  seeded ${id}: +H ${add[0].toFixed(3)} / +D ${add[1].toFixed(3)} / +A ${add[2].toFixed(3)} SOL (target pool ${target.reduce((a, b) => a + b, 0).toFixed(3)})`);
    } catch (e: any) {
      console.log(`  ${id}: skipped after errors (${e?.message ?? e})`);
    }
  }
  const bal1 = await provider.connection.getBalance(me);
  console.log(`done. seeded ${seededCount} markets, ~${spent.toFixed(3)} SOL into pools; wallet now ${(bal1 / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? e); process.exit(1); });
