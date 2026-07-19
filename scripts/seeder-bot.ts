/**
 * Sandbox seeder bot. Simulations are per-wallet markets (host = the player's pubkey), so they
 * can't be pre-seeded — this daemon watches for MarketOpened events and instantly drops
 * counterparty liquidity into every NEW sandbox, split across outcomes by the fixture's consensus
 * odds. That way a lone judge's winning pick pays real profit (parimutuel needs opposing pools).
 *
 * On startup it also sweeps existing open sandboxes it hasn't seeded (catches downtime).
 *
 * Run (WSL, keep alive during judging):
 *   ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=~/.config/solana/id.json \
 *   ts-node scripts/seeder-bot.ts     (env: SEED_SANDBOX=1.5, SEED_FLOOR=0.16, BUDGET=60)
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import idl from "../target/idl/worldcup_market.json";

const SANDBOX_TOTAL = Number(process.env.SEED_SANDBOX ?? 1.5); // SOL per sandbox
const FLOOR = Number(process.env.SEED_FLOOR ?? 0.16);
const BUDGET = Number(process.env.BUDGET ?? 60); // hard cap on total SOL this bot may spend
const SHARED_HOST = PublicKey.default;
const lam = (s: number) => new BN(Math.round(s * LAMPORTS_PER_SOL));

// Consensus odds per fixture from the bundled feeds (frames[0] = pre-match odds).
const pub = path.join(__dirname, "..", "app", "public");
const consensus = new Map<number, number[]>();
for (const f of fs.readdirSync(pub).filter((x) => /^feed-\d+\.json$/.test(x))) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(pub, f), "utf8"));
    if (d.fixtureId && d.frames?.[0]?.odds) consensus.set(d.fixtureId, d.frames[0].odds);
  } catch { /* skip bad feed */ }
}

function split(odds?: number[]): [number, number, number] {
  const p = odds && odds.some((o) => o > 0) ? odds.map((o) => (o > 0 ? 1 / o : 0)) : [1, 1, 1];
  const s0 = p.reduce((a, b) => a + b, 0) || 1;
  const w = p.map((x) => Math.max(FLOOR, x / s0));
  const s1 = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => (x / s1) * SANDBOX_TOTAL) as [number, number, number];
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const conn = provider.connection;
  const me = provider.wallet.publicKey;
  const parser = new anchor.EventParser(program.programId, new anchor.BorshCoder(idl as anchor.Idl));

  let spent = 0;
  const seeding = new Set<string>(); // in-flight guard

  const seedSandbox = async (marketPk: PublicKey) => {
    const key = marketPk.toBase58();
    if (seeding.has(key)) return;
    seeding.add(key);
    try {
      const m: any = await (program.account as any).market.fetch(marketPk);
      const host: PublicKey = m.host;
      const fixtureId = Number(m.fixtureId.toString());
      if (host.equals(SHARED_HOST)) return;            // shared market - handled by seed-markets.ts
      if (host.equals(me)) return;                     // our own sandbox (shouldn't happen)
      if (m.resolved) return;
      if (Number(m.closesAt.toString()) <= Date.now() / 1000) return;

      // Idempotent: skip if we already seeded this sandbox.
      const [position] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), marketPk.toBuffer(), me.toBuffer()], program.programId);
      try {
        const p: any = await (program.account as any).position.fetch(position);
        if ((p.amounts as BN[]).some((x: BN) => x.toNumber() > 0)) return;
      } catch { /* no position yet - good */ }

      if (spent + SANDBOX_TOTAL > BUDGET) {
        console.log(`[bot] BUDGET EXHAUSTED (${spent.toFixed(1)}/${BUDGET} SOL) - not seeding ${fixtureId}`);
        return;
      }

      const amt = split(consensus.get(fixtureId));
      for (let o = 0; o < 3; o++) {
        await program.methods.placeBet(o, lam(amt[o]))
          .accounts({ market: marketPk, position, bettor: me, systemProgram: SystemProgram.programId })
          .rpc();
      }
      spent += SANDBOX_TOTAL;
      console.log(`[bot] seeded sandbox ${key.slice(0, 8)}… fixture ${fixtureId} for host ${host.toBase58().slice(0, 6)}… ` +
        `(H ${amt[0].toFixed(3)} / D ${amt[1].toFixed(3)} / A ${amt[2].toFixed(3)} SOL, total spent ${spent.toFixed(1)})`);
    } catch (e: any) {
      console.log(`[bot] seed ${key.slice(0, 8)}… failed: ${e?.message ?? e}`);
      seeding.delete(key); // allow retry on next sighting
    }
  };

  // 1) Startup sweep: catch sandboxes opened while the bot was down.
  console.log(`[bot] wallet ${me.toBase58().slice(0, 6)}… | ${SANDBOX_TOTAL} SOL per sandbox | budget ${BUDGET} SOL`);
  const discriminator = (idl as any).accounts.find((a: any) => a.name === "Market").discriminator;
  const existing = await conn.getProgramAccounts(program.programId, {
    filters: [{ memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(Uint8Array.from(discriminator)) } }],
  });
  console.log(`[bot] startup sweep over ${existing.length} markets…`);
  for (const { pubkey } of existing) await seedSandbox(pubkey);

  // 2) Live: seed each new sandbox the moment MarketOpened lands.
  conn.onLogs(program.programId, (logs) => {
    if (logs.err) return;
    try {
      for (const ev of parser.parseLogs(logs.logs)) {
        if (ev.name.toLowerCase() !== "marketopened") continue;
        const d: any = ev.data;
        console.log(`[bot] MarketOpened fixture ${d.fixtureId?.toString?.()} host ${d.host?.toBase58?.().slice(0, 6)}…`);
        void seedSandbox(d.market as PublicKey);
      }
    } catch { /* non-event logs */ }
  }, "confirmed");
  console.log("[bot] live - watching MarketOpened…");
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
