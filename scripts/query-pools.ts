/** Read-only: for each fixture (sim feeds + real fixtures), fetch its SHARED market PDA and print
 *  pools + this wallet's stake. Fetches one-by-one so old-layout orphans are skipped, not fatal. */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import idl from "../target/idl/worldcup_market.json";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const me = provider.wallet.publicKey;
  const SHARED = PublicKey.default;
  const sol = (b: BN) => b.toNumber() / LAMPORTS_PER_SOL;

  const pub = path.join(__dirname, "..", "app", "public");
  const simIds = fs.readdirSync(pub).filter((f) => /^feed-\d+\.json$/.test(f))
    .map((f) => Number(f.match(/\d+/)![0]));
  const fixtures = JSON.parse(fs.readFileSync(path.join(pub, "fixtures.json"), "utf8")) as any[];
  const realIds = fixtures
    .filter((f) => (f.category ?? (f.featured ? "simulation" : "real")) === "real")
    .filter((f) => f.status === "UPCOMING" || f.status === "LIVE")
    .map((f) => Number(f.fixtureId));
  const ids = [...new Set([...simIds, ...realIds])];

  let totalPool = 0, totalMine = 0, seeded = 0, unseeded = 0, resolved = 0, missing = 0;
  for (const id of ids) {
    const fx = new BN(id).toArrayLike(Buffer, "le", 8);
    const [market] = PublicKey.findProgramAddressSync([Buffer.from("market"), fx, SHARED.toBuffer()], program.programId);
    let m: any;
    try { m = await (program.account as any).market.fetch(market); }
    catch { missing++; continue; }
    const pools = (m.pools as BN[]).map(sol);
    const pool = pools.reduce((a, b) => a + b, 0);
    const kind = simIds.includes(id) ? "sim " : "real";
    // my stake
    const [pos] = PublicKey.findProgramAddressSync([Buffer.from("position"), market.toBuffer(), me.toBuffer()], program.programId);
    let mine = 0;
    try { const p = await (program.account as any).position.fetch(pos); mine = (p.amounts as BN[]).map(sol).reduce((a, b) => a + b, 0); } catch {}
    totalPool += pool; totalMine += mine;
    if (m.resolved) resolved++;
    if (pool < 0.01) unseeded++; else seeded++;
    console.log(`  ${kind} ${id}\tpool ${pool.toFixed(2)}\t(H ${pools[0].toFixed(2)}/D ${pools[1].toFixed(2)}/A ${pools[2].toFixed(2)})\tmine ${mine.toFixed(2)}${m.resolved ? "\tRESOLVED" : ""}`);
  }
  console.log(`\nfixtures checked: ${ids.length} (${simIds.length} sim, ${realIds.length} real)`);
  console.log(`markets: seeded ${seeded}, unseeded ${unseeded}, no-market-yet ${missing}, resolved ${resolved}`);
  console.log(`total in pools: ${totalPool.toFixed(2)} SOL | my seed locked: ${totalMine.toFixed(2)} SOL`);
  console.log(`wallet: ${((await provider.connection.getBalance(me)) / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? e); process.exit(1); });
