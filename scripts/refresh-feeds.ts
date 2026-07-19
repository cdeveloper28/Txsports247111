/**
 * Re-fetch the odds + scores feeds for every simulation fixture (one auth session) and rebuild
 * app/public/feed-<id>.json with the enhanced build_feed.py (adds live stats + event timeline).
 *
 * Run (WSL): npx ts-node scripts/refresh-feeds.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { subscribeAndActivate } from "./txline";
import txoracleIdl from "../idls/txoracle.json";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(txoracleIdl as anchor.Idl, provider);
  const { api } = await subscribeAndActivate(provider, program);

  const grab = async (u: string) => { try { return (await api.get(u)).data; } catch { return null; } };
  const root = path.join(__dirname, "..");
  const pub = path.join(root, "app", "public");
  const fixtures = JSON.parse(fs.readFileSync(path.join(pub, "fixtures.json"), "utf8"));
  const ids: number[] = fixtures.filter((f: any) => f.category === "simulation").map((f: any) => f.fixtureId);
  console.log(`refreshing ${ids.length} simulation feeds…`);

  let ok = 0;
  for (const id of ids) {
    const feed = { fixtureId: id, oddsUpd: await grab(`/odds/updates/${id}`), scoresUpd: await grab(`/scores/updates/${id}`) };
    fs.writeFileSync(path.join(pub, "feed-raw.json"), JSON.stringify(feed));
    try {
      execSync("python3 build_feed.py", { cwd: root, stdio: "pipe" });
      ok++; console.log(`  ✓ ${id}`);
    } catch (e: any) {
      console.log(`  ✗ ${id}: ${String(e?.message ?? e).slice(0, 90)}`);
    }
  }
  console.log(`done: ${ok}/${ids.length} feeds rebuilt with stats + events`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? e); process.exit(1); });
