/**
 * Inspect a fixture's raw TxLINE scores feed to see which live stats are available
 * (possession, shots, corners, cards, events). Dumps samples to app/public/feed-sample.json.
 *
 * Run (WSL): FIXTURE_ID=18257865 npx ts-node scripts/inspect-feed.ts
 */
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { subscribeAndActivate } from "./txline";
import txoracleIdl from "../idls/txoracle.json";

const FIXTURE_ID = Number(process.env.FIXTURE_ID ?? 18257865);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(txoracleIdl as anchor.Idl, provider);
  const { api } = await subscribeAndActivate(provider, program);

  const grab = async (u: string) => { try { return (await api.get(u)).data; } catch { return null; } };
  const scoresUpd = await grab(`/scores/updates/${FIXTURE_ID}`);

  // parse SSE blocks
  const evs: any[] = [];
  const text = typeof scoresUpd === "string" ? scoresUpd : "";
  for (const block of text.split("\n\n")) {
    const m = block.match(/data:\s*(\{.*\})/);
    if (!m) continue;
    try { evs.push(JSON.parse(m[1])); } catch {}
  }
  console.log("events parsed:", evs.length);
  const keys = new Set<string>();
  const actions = new Set<string>();
  evs.forEach((e) => { Object.keys(e).forEach((k) => keys.add(k)); if (e.Action) actions.add(e.Action); });
  console.log("all keys:", [...keys].sort().join(", "));
  console.log("actions:", [...actions].sort().join(", "));

  const withPoss = evs.find((e) => e.Possession != null);
  const withStats = evs.find((e) => e.Stats && Object.keys(e.Stats).length);
  const scored = evs.filter((e) => e.Score?.Participant1 || e.Score?.Participant2);
  const last = scored[scored.length - 1];

  const sample = {
    Possession_sample: withPoss?.Possession ?? null,
    PossessionType_sample: withPoss?.PossessionType ?? null,
    Stats_sample: withStats?.Stats ?? null,
    Data_sample: evs.find((e) => e.Data && Object.keys(e.Data).length)?.Data ?? null,
    Score_last: last?.Score ?? null,
    goal_event: evs.find((e) => e.Action === "goal") ?? null,
  };
  const pub = path.join(__dirname, "..", "app", "public");
  fs.writeFileSync(path.join(pub, "feed-sample.json"), JSON.stringify(sample, null, 2));
  console.log("Possession sample:", JSON.stringify(sample.Possession_sample)?.slice(0, 200));
  console.log("Stats sample:", JSON.stringify(sample.Stats_sample)?.slice(0, 300));
  console.log("Score_last:", JSON.stringify(sample.Score_last)?.slice(0, 400));
  console.log("wrote app/public/feed-sample.json");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? e); process.exit(1); });
