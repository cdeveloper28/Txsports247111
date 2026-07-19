/**
 * Build the multi-fixture markets list from REAL TxLINE data.
 *
 * Auth (free WC tier) -> GET /fixtures/snapshot for the tournament window -> for each fixture pull
 * the StablePrice (demargined) 1X2 odds snapshot + the scores snapshot (goals + status) -> write
 * app/public/fixtures.json (the grid the frontend renders). Also dumps the first fixture's raw
 * odds/scores snapshots so the field mapping can be verified.
 *
 * Run (WSL):
 *   ANCHOR_PROVIDER_URL=<devnet rpc> ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   ts-node scripts/fetch-fixtures.ts
 */
import * as anchor from "@coral-xyz/anchor";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { subscribeAndActivate } from "./txline";
import txoracleIdl from "../idls/txoracle.json";

const MAX_FIXTURES = Number(process.env.MAX_FIXTURES ?? 60);
const FEATURED_ODDS = Number(process.env.FEATURED_ODDS ?? 18); // fetch closing odds for the top-N recent
const START_EPOCH_DAY = process.env.START_EPOCH_DAY
  ? Number(process.env.START_EPOCH_DAY)
  : Math.floor(Date.UTC(2026, 5, 1) / 86_400_000); // 2026-06-01, covers the whole World Cup

const FT_MS = 2.5 * 3600 * 1000; // a match is done ~2.5h after kickoff

function extractOdds(oddsSnap: any): [number, number, number] | null {
  const arr = Array.isArray(oddsSnap) ? oddsSnap : oddsSnap?.odds ?? oddsSnap?.Odds ?? [];
  const sp = (arr as any[]).find(
    (o) =>
      o?.Bookmaker === "TXLineStablePriceDemargined" &&
      o?.SuperOddsType === "1X2_PARTICIPANT_RESULT" &&
      Array.isArray(o?.Prices) &&
      o.Prices.length === 3
  );
  if (!sp) return null;
  return sp.Prices.map((p: number) => Number((p / 1000).toFixed(2))) as [number, number, number];
}

function extractScore(scSnap: any): { home: number | null; away: number | null; statusId: any } {
  const arr = Array.isArray(scSnap) ? scSnap : [];
  if (!arr.length) return { home: null, away: null, statusId: null };
  // The snapshot is a list of score events; the latest (highest Seq) carries the running score.
  const latest = arr.reduce((a, b) => (Number(b?.Seq ?? 0) > Number(a?.Seq ?? 0) ? b : a));
  const goals = (p: string) => Number(latest?.Score?.[p]?.Total?.Goals ?? 0);
  const hasScore = !!(latest?.Score?.Participant1 || latest?.Score?.Participant2);
  return {
    home: hasScore ? goals("Participant1") : null,
    away: hasScore ? goals("Participant2") : null,
    statusId: latest?.StatusId ?? null,
  };
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(txoracleIdl as anchor.Idl, provider);

  console.log("authorizing (guest JWT -> subscribe -> activate)...");
  const { api } = await subscribeAndActivate(provider, program);
  console.log("authorized.");

  const grab = async (u: string) => {
    try {
      return (await api.get(u)).data;
    } catch (e: any) {
      return null;
    }
  };

  // Finished matches have no live odds snapshot, so take the closing StablePrice 1X2 tick from the
  // odds-updates history. Guarded by a size cap so a very large feed is skipped rather than OOMing.
  const closingOdds = async (id: number): Promise<[number, number, number] | null> => {
    try {
      const { data } = await api.get(`/odds/updates/${id}`, {
        maxContentLength: 9_000_000, maxBodyLength: 9_000_000, timeout: 30_000,
      });
      const arr = Array.isArray(data) ? data : data?.oddsUpd ?? [];
      const sp = (arr as any[]).filter(
        (o) => o?.Bookmaker === "TXLineStablePriceDemargined" &&
          o?.SuperOddsType === "1X2_PARTICIPANT_RESULT" &&
          Array.isArray(o?.Prices) && o.Prices.length === 3
      );
      const last = sp[sp.length - 1];
      return last ? (last.Prices.map((p: number) => Number((p / 1000).toFixed(2))) as [number, number, number]) : null;
    } catch {
      return null;
    }
  };

  console.log(`GET /fixtures/snapshot?startEpochDay=${START_EPOCH_DAY} ...`);
  let fixtures = await grab(`/fixtures/snapshot?startEpochDay=${START_EPOCH_DAY}`);
  if (!Array.isArray(fixtures)) fixtures = fixtures?.fixtures ?? fixtures?.Fixtures ?? [];
  console.log(`fixtures returned: ${fixtures.length}`);
  if (fixtures[0]) console.log("fixture sample:", JSON.stringify(fixtures[0]).slice(0, 500));

  const pub = path.join(__dirname, "..", "app", "public");
  fs.mkdirSync(pub, { recursive: true });

  // most-recent matches first, deduped by fixture id
  const seen = new Set<number>();
  const list = (fixtures as any[])
    .filter((fx) => { const id = Number(fx.FixtureId ?? fx.fixtureId); if (!id || seen.has(id)) return false; seen.add(id); return true; })
    .sort((a, b) => Number(b.StartTime ?? 0) - Number(a.StartTime ?? 0))
    .slice(0, MAX_FIXTURES);

  const now = Date.now();
  const out: any[] = [];
  let dumped = false;
  let idx = 0;

  for (const fx of list) {
    const id = Number(fx.FixtureId ?? fx.fixtureId);
    if (!id) continue;
    const p1 = fx.Participant1 ?? fx.participant1 ?? "Home";
    const p2 = fx.Participant2 ?? fx.participant2 ?? "Away";
    const startTime = Number(fx.StartTime ?? fx.startTime ?? 0);
    const competition = fx.Competition ?? fx.competition ?? "";
    const competitionId = Number(fx.CompetitionId ?? fx.competitionId ?? 0);

    const oddsSnap = await grab(`/odds/snapshot/${id}`);
    const scSnap = await grab(`/scores/snapshot/${id}`);
    if (!dumped) {
      fs.writeFileSync(
        path.join(pub, "snap-raw.json"),
        JSON.stringify({ fixture: fx, oddsSnap, scSnap }, null, 2)
      );
      console.log("dumped first fixture raw snapshots -> app/public/snap-raw.json");
      dumped = true;
    }

    let odds = extractOdds(oddsSnap);
    if (!odds && idx < FEATURED_ODDS) odds = await closingOdds(id);
    idx++;
    const { home, away, statusId } = extractScore(scSnap);
    const started = startTime > 0 && startTime <= now;
    const finished = startTime > 0 && startTime + FT_MS < now;
    const status = finished ? "FT" : started ? "LIVE" : "UPCOMING";
    const finalOutcome =
      finished && home != null && away != null ? (home > away ? 0 : home === away ? 1 : 2) : null;

    // Our on-chain predicate uses stat key 1 = Participant1, key 2 = Participant2, so we label
    // "Home" = Participant1 and "Away" = Participant2 to match how the market settles.
    out.push({
      fixtureId: id,
      home: p1,
      away: p2,
      competition,
      competitionId,
      kickoff: startTime,
      status,
      score: home != null && away != null ? { home, away } : null,
      odds, // [Home, Draw, Away] decimal, or null
      finalOutcome,
    });
  }

  out.sort((a, b) => (b.kickoff || 0) - (a.kickoff || 0)); // most recent first
  fs.writeFileSync(path.join(pub, "fixtures.json"), JSON.stringify(out, null, 2));

  const finishedIds = out.filter((f) => f.status === "FT").map((f) => f.fixtureId);
  console.log(`wrote app/public/fixtures.json: ${out.length} fixtures`);
  console.log(`  with odds: ${out.filter((f) => f.odds).length}, finished (FT): ${finishedIds.length}`);
  console.log("  competitions:", [...new Set(out.map((f) => `${f.competitionId}:${f.competition}`))].join(" | "));
  console.log("  FT fixture ids (proof-capable):", finishedIds.slice(0, 12).join(", "));
  console.log("  sample:", JSON.stringify(out[0]));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(axios.isAxiosError(e) ? e.response?.data || e.message : e);
  process.exit(1);
});
