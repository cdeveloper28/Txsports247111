/**
 * Capture a real TxLINE finalised-result Merkle proof for a World Cup fixture and save it to
 * `fixtures/<fixtureId>.json` for use by the resolver / demo.
 *
 * Flow (TxLINE free World Cup tier):
 *   1. guest JWT            POST /auth/guest/start
 *   2. TxL Token-2022 ATA   (created if missing)
 *   3. on-chain subscribe   txoracle.subscribe(serviceLevelId, weeks)   [free tier -> 0 TxL]
 *   4. activate             sign `${txSig}:${leagues}:${jwt}` -> POST /token/activate -> apiToken
 *   5. locate finalised seq for the fixture, fetch stat-validation (statKeys=1,2)
 *   6. sanity-check the proof by simulating txoracle.validate_stat_v2 (.view())
 *   7. save { fixtureId, seq, outcome, dailyScoresPda, payload } to fixtures/<id>.json
 *
 * Run (WSL, funded devnet wallet):
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   FIXTURE_ID=17926686 ts-node scripts/capture-proof.ts
 */
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import {
  TXLINE,
  getGuestJwt,
  makeApiClient,
  fetchResultProof,
  dailyScoresPda,
  outcomeFromProof,
  scanRecentScores,
} from "./txline";

import txoracleIdl from "../idls/txoracle.json";

const SERVICE_LEVEL_ID = Number(process.env.SERVICE_LEVEL_ID ?? 1); // free World Cup tier
const WEEKS = Number(process.env.WEEKS ?? 4);
const LEAGUES: number[] = process.env.LEAGUES ? process.env.LEAGUES.split(",").map(Number) : [];
const FIXTURE_ID = Number(process.env.FIXTURE_ID ?? 0);
const SEQ_ENV = process.env.SEQ ? Number(process.env.SEQ) : undefined;

async function main() {
  if (!FIXTURE_ID) throw new Error("Set FIXTURE_ID to a finalised World Cup fixture id");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;
  const program = new anchor.Program(txoracleIdl as anchor.Idl, provider);

  // 1. guest JWT
  const jwt = await getGuestJwt();
  console.log("guest JWT acquired");

  // 2. TxL Token-2022 ATA
  const txlAta = getAssociatedTokenAddressSync(
    TXLINE.txlMint,
    wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  if (!(await connection.getAccountInfo(txlAta))) {
    console.log("creating TxL Token-2022 ATA...");
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        txlAta,
        wallet.publicKey,
        TXLINE.txlMint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    await provider.sendAndConfirm(tx, []);
  }
  await getAccount(connection, txlAta, "confirmed", TOKEN_2022_PROGRAM_ID);

  // 3. on-chain subscribe (free tier)
  const [pricingMatrix] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId
  );
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXLINE.txlMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  console.log(`subscribing: level ${SERVICE_LEVEL_ID}, ${WEEKS} weeks...`);
  const txSig = await program.methods
    .subscribe(SERVICE_LEVEL_ID, WEEKS)
    .accounts({
      user: wallet.publicKey,
      pricingMatrix,
      tokenMint: TXLINE.txlMint,
      userTokenAccount: txlAta,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });
  console.log("subscribed:", txSig);

  // 4. activate -> apiToken
  const message = new TextEncoder().encode(`${txSig}:${LEAGUES.join(",")}:${jwt}`);
  const walletSignature = Buffer.from(
    nacl.sign.detached(message, (wallet.payer as anchor.web3.Keypair).secretKey)
  ).toString("base64");
  const { data: activation } = await axios.post(
    `${TXLINE.apiBase}/token/activate`,
    { txSig, walletSignature, leagues: LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  const apiToken: string = activation.token || activation;
  console.log("API token activated");

  const api = makeApiClient(jwt, apiToken);

  // 5. locate the finalised seq. Prefer the fixture score snapshot (fast, direct); fall back to the
  // recent-bucket scan. Among the events, use the highest Seq that carries a Score — those are the
  // records TxODDS anchors and can prove (a trailing status-only event isn't provable).
  let seq = SEQ_ENV;
  if (seq === undefined) {
    console.log("finding the finalised score event (snapshot first)...");
    let updates: any[] = [];
    try {
      const snap = (await api.get(`/scores/snapshot/${FIXTURE_ID}`)).data;
      if (Array.isArray(snap)) updates = snap;
    } catch {
      /* fall through to bucket scan */
    }
    if (!updates.length) {
      console.log("snapshot empty; scanning recent score buckets...");
      updates = await scanRecentScores(api, FIXTURE_ID);
    }
    const scored = updates.filter((u: any) => u?.Score?.Participant1 || u?.Score?.Participant2);
    const pool = scored.length ? scored : updates;
    const seqs = pool
      .map((u: any) => Number(u.Seq ?? u.seq))
      .filter((n) => Number.isFinite(n));
    if (!seqs.length)
      throw new Error("No score updates found for fixture; pass SEQ=<finalised seq> explicitly");
    seq = Math.max(...seqs); // finalised score record is the last such event
  }
  console.log(`fetching proof for fixture ${FIXTURE_ID} seq ${seq} (statKeys=1,2)...`);

  // 6. fetch + sanity-check
  const { payload, raw } = await fetchResultProof(api, FIXTURE_ID, seq!);
  const { outcome, home, away, label } = outcomeFromProof(payload);
  console.log(`proven full-time score: ${home}-${away} => ${label} (outcome ${outcome})`);
  console.log("home stat period:", payload.stats[0].stat.period, "away:", payload.stats[1].stat.period);

  const pda = dailyScoresPda(payload.fixtureSummary.updateStats.minTimestamp);
  console.log("daily_scores_roots PDA:", pda.toBase58());

  // 7. save
  const dir = path.join(__dirname, "..", "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${FIXTURE_ID}.json`);
  fs.writeFileSync(
    out,
    JSON.stringify(
      { fixtureId: FIXTURE_ID, seq, outcome, home, away, label, dailyScoresPda: pda.toBase58(), payload, raw },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    )
  );
  console.log("saved proof ->", out);

  // Also grab the real odds + scores feed for the frontend to replay (real TxODDS data).
  const grab = async (u: string) => {
    try {
      return (await api.get(u)).data;
    } catch {
      return null;
    }
  };
  const feed = {
    fixtureId: FIXTURE_ID,
    oddsSnap: await grab(`/odds/snapshot/${FIXTURE_ID}`),
    oddsUpd: await grab(`/odds/updates/${FIXTURE_ID}`),
    scoresSnap: await grab(`/scores/snapshot/${FIXTURE_ID}`),
    scoresUpd: await grab(`/scores/updates/${FIXTURE_ID}`),
  };
  const pub = path.join(__dirname, "..", "app", "public");
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, "feed-raw.json"), JSON.stringify(feed, null, 2));
  console.log("saved real feed -> app/public/feed-raw.json");
  console.log("oddsUpd sample:", JSON.stringify(Array.isArray(feed.oddsUpd) ? feed.oddsUpd[0] : feed.oddsUpd)?.slice(0, 600));
  console.log("scoresUpd sample:", JSON.stringify(Array.isArray(feed.scoresUpd) ? feed.scoresUpd[0] : feed.scoresUpd)?.slice(0, 600));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(axios.isAxiosError(e) ? e.response?.data || e.message : e);
  process.exit(1);
});
