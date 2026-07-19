/**
 * Promote finished REAL fixtures into playable SIMULATIONS.
 *
 * For every category:"real" fixture in app/public/fixtures.json, ask TxLINE whether the match has
 * ended (scores snapshot StatusId). Once finished:
 *   1. capture its Merkle result proof  -> fixtures/<id>.json + app/public/proof-<id>.json
 *   2. rebuild its replay feed from the REAL odds/scores stream -> app/public/feed-<id>.json
 *   3. stamp status/score/finalOutcome and re-run rebuild_matchday.py — which classifies any
 *      fixture that has feed+proof as a simulation, so it moves tabs automatically.
 * Idempotent: fixtures that already have both artifacts are skipped. Safe to re-run on a timer.
 *
 * Run (WSL):
 *   ANCHOR_PROVIDER_URL=<devnet rpc> ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   ./node_modules/.bin/ts-node scripts/promote-finished.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { subscribeAndActivate, fetchResultProof, dailyScoresPda, outcomeFromProof } from "./txline";
import txoracleIdl from "../idls/txoracle.json";

const ENDED = new Set([5, 10, 13]); // TxLINE StatusId phases meaning the match is over

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(txoracleIdl as anchor.Idl, provider);
  const { api } = await subscribeAndActivate(provider, program);

  const root = path.join(__dirname, "..");
  const pub = path.join(root, "app", "public");
  const fixturesPath = path.join(pub, "fixtures.json");
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

  const reals = fixtures.filter((f: any) => f.category === "real");
  console.log(`checking ${reals.length} real fixtures for finished matches…`);

  let promoted = 0;
  for (const f of reals) {
    const id = f.fixtureId;
    if (fs.existsSync(path.join(pub, `proof-${id}.json`)) && fs.existsSync(path.join(pub, `feed-${id}.json`))) {
      console.log(`  ${id} ${f.home} v ${f.away}: artifacts already exist — skipping`);
      continue;
    }

    let snap: any[] = [];
    try {
      const d = (await api.get(`/scores/snapshot/${id}`)).data;
      if (Array.isArray(d)) snap = d;
    } catch { /* not started / no scores yet */ }
    const statuses = snap.map((u: any) => Number(u.StatusId)).filter(Number.isFinite);
    if (!statuses.some((s) => ENDED.has(s))) {
      console.log(`  ${id} ${f.home} v ${f.away}: not finished (last status ${statuses.at(-1) ?? "none"})`);
      continue;
    }

    console.log(`  ${id} ${f.home} v ${f.away}: FINISHED — capturing proof + replay feed`);
    try {
      // Proof: use the highest Seq that carries a Score — those are the records TxODDS anchors
      // (a trailing status-only event isn't provable).
      const scored = snap.filter((u: any) => u?.Score?.Participant1 || u?.Score?.Participant2);
      const pool = scored.length ? scored : snap;
      const seq = Math.max(...pool.map((u: any) => Number(u.Seq ?? u.seq)).filter(Number.isFinite));
      const { payload, raw } = await fetchResultProof(api, id, seq);
      const { outcome, home, away, label } = outcomeFromProof(payload);
      const pda = dailyScoresPda(payload.fixtureSummary.updateStats.minTimestamp);
      const proof = JSON.stringify(
        { fixtureId: id, seq, outcome, home, away, label, dailyScoresPda: pda.toBase58(), payload, raw },
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
        2
      );
      fs.mkdirSync(path.join(root, "fixtures"), { recursive: true });
      fs.writeFileSync(path.join(root, "fixtures", `${id}.json`), proof);
      fs.writeFileSync(path.join(pub, `proof-${id}.json`), proof);
      console.log(`    proof: ${home}-${away} → ${label} (seq ${seq})`);

      // Replay feed from the real streams (build_feed clamps to the proven score above).
      const grab = async (u: string) => { try { return (await api.get(u)).data; } catch { return null; } };
      const feedRaw = {
        fixtureId: id,
        oddsUpd: await grab(`/odds/updates/${id}`),
        scoresUpd: await grab(`/scores/updates/${id}`),
      };
      fs.writeFileSync(path.join(pub, "feed-raw.json"), JSON.stringify(feedRaw));
      execSync("python3 build_feed.py", { cwd: root, stdio: "inherit" });

      f.status = "FT";
      f.score = { home, away };
      f.finalOutcome = outcome;
      promoted++;
    } catch (e: any) {
      console.log(`    ✗ failed: ${String(e?.message ?? e).slice(0, 140)}`);
    }
  }

  if (promoted) {
    fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2));
    // Reclassifies: any fixture with feed+proof becomes a simulation, finished reals drop out.
    execSync("python3 rebuild_matchday.py", { cwd: root, stdio: "inherit" });
    console.log(`done: promoted ${promoted} finished fixture(s) to simulations.`);
  } else {
    console.log("done: nothing to promote.");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? e); process.exit(1); });
