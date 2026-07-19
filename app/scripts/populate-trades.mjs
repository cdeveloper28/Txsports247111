// One-off: decode recent on-chain BetPlaced events and upsert them into the Supabase `trades`
// table (via the REST API, so it works on Node 20 without the realtime WebSocket the SDK needs)
// so the marquee reads from Supabase. Reads the service-role key from an env var — NEVER hard-code
// it. Run:  SUPABASE_SERVICE_ROLE_KEY=... node scripts/populate-trades.mjs
import { Connection, PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import { readFileSync } from "fs";

const IDL = JSON.parse(readFileSync(new URL("../../target/idl/worldcup_market.json", import.meta.url)));
const PROGRAM_ID = new PublicKey(IDL.address);
const RPC = "https://devnet.helius-rpc.com/?api-key=982e039b-c27c-4c26-a55a-5f5216990a05";
const SB_URL = "https://zarmojzfqktzvzjdptka.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY in the environment."); process.exit(1); }

const conn = new Connection(RPC, "confirmed");
const parser = new EventParser(PROGRAM_ID, new BorshCoder(IDL));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { last = e; await sleep(1500 * (i + 1)); } }
  throw last;
}

const sigs = await withRetry(() => conn.getSignaturesForAddress(PROGRAM_ID, { limit: 60 }));
console.log("scanning", sigs.length, "signatures…");

const trades = [];
let idx = 0;
const worker = async () => {
  while (idx < sigs.length) {
    const s = sigs[idx++];
    let tx;
    try { tx = await withRetry(() => conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }), 3); }
    catch { continue; }
    const logs = tx?.meta?.logMessages;
    if (!logs || tx?.meta?.err) continue;
    const ts = (s.blockTime ?? tx?.blockTime ?? 0) * 1000;
    try {
      for (const ev of parser.parseLogs(logs)) {
        if (ev.name.toLowerCase() !== "betplaced") continue;
        const d = ev.data;
        trades.push({
          sig: s.signature, ts, market: d.market.toBase58(), bettor: d.bettor.toBase58(),
          outcome: Number(d.outcome), amount: Number(d.amount) / 1e9,
        });
      }
    } catch { /* skip undecodable */ }
  }
};
await Promise.all(Array.from({ length: 3 }, worker));

// de-dupe by sig (upsert can't touch the same conflict row twice in one batch)
const rows = [...new Map(trades.map((t) => [t.sig, t])).values()];
console.log("decoded", rows.length, "unique BetPlaced trades");

if (rows.length) {
  const res = await fetch(`${SB_URL}/rest/v1/trades`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) { console.error("upsert failed:", res.status, (await res.text()).slice(0, 300)); process.exit(1); }
  console.log("✓ upserted", rows.length, "rows into Supabase trades");
}
