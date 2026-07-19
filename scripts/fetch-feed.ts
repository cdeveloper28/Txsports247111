/**
 * Fetch the REAL TxLINE odds + scores updates for a fixture and save them, so the frontend can
 * replay actual TxODDS data instead of hand-written frames. Reuses the existing on-chain
 * subscription (no re-subscribe) by re-activating with the prior subscribe tx signature.
 *
 * Run: FIXTURE_ID=17926686 SUB_TXSIG=<subscribe sig> npx ts-node scripts/fetch-feed.ts
 */
import * as anchor from "@coral-xyz/anchor";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import nacl from "tweetnacl";
import { TXLINE, getGuestJwt, makeApiClient } from "./txline";

const FIXTURE_ID = Number(process.env.FIXTURE_ID ?? 17926686);
// The subscribe tx from the capture run (reused so we don't pay to subscribe again).
const SUB_TXSIG =
  process.env.SUB_TXSIG ??
  "5Huuwuzs7HHb1Y1vpPAEXmD2dKTN8X9oepdeiPwnMHV3ZnxYnQTpCmvibFdUHc5BceJNyuJUoMMdUvdR4VnWJx6C";
const LEAGUES: number[] = process.env.LEAGUES ? process.env.LEAGUES.split(",").map(Number) : [];

async function main() {
  const provider = anchor.AnchorProvider.env();
  const wallet = provider.wallet as anchor.Wallet;

  const jwt = await getGuestJwt();
  // Re-activate against the existing subscription.
  const message = new TextEncoder().encode(`${SUB_TXSIG}:${LEAGUES.join(",")}:${jwt}`);
  const walletSignature = Buffer.from(
    nacl.sign.detached(message, (wallet.payer as anchor.web3.Keypair).secretKey)
  ).toString("base64");
  const { data: activation } = await axios.post(
    `${TXLINE.apiBase}/token/activate`,
    { txSig: SUB_TXSIG, walletSignature, leagues: LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  const apiToken: string = activation.token || activation;
  console.log("API token activated");

  const api = makeApiClient(jwt, apiToken);

  const safe = async (label: string, url: string) => {
    try {
      const { data } = await api.get(url);
      const n = Array.isArray(data) ? data.length : Object.keys(data ?? {}).length;
      console.log(`  ${label}: ${n} entries`);
      return data;
    } catch (e: any) {
      console.log(`  ${label}: FAILED ${e?.response?.status ?? e?.message}`);
      return null;
    }
  };

  console.log(`fetching real feed for fixture ${FIXTURE_ID}...`);
  const oddsSnap = await safe("odds/snapshot", `/odds/snapshot/${FIXTURE_ID}`);
  const oddsUpd = await safe("odds/updates", `/odds/updates/${FIXTURE_ID}`);
  const scoresSnap = await safe("scores/snapshot", `/scores/snapshot/${FIXTURE_ID}`);
  const scoresUpd = await safe("scores/updates", `/scores/updates/${FIXTURE_ID}`);

  const dir = path.join(__dirname, "..", "app", "public");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "feed-raw.json"),
    JSON.stringify({ fixtureId: FIXTURE_ID, oddsSnap, oddsUpd, scoresSnap, scoresUpd }, null, 2)
  );
  console.log("saved raw feed -> app/public/feed-raw.json");
  // print small samples so we can learn the shape
  console.log("oddsSnap sample:", JSON.stringify(oddsSnap)?.slice(0, 700));
  console.log("oddsUpd[0] sample:", JSON.stringify(Array.isArray(oddsUpd) ? oddsUpd[0] : oddsUpd)?.slice(0, 700));
  console.log("scoresUpd[0] sample:", JSON.stringify(Array.isArray(scoresUpd) ? scoresUpd[0] : scoresUpd)?.slice(0, 700));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(axios.isAxiosError(e) ? e.response?.data || e.message : e);
  process.exit(1);
});
