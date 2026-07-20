/**
 * TxODDS live relay. Holds authenticated SSE connections to the TxLINE `/scores/stream` and
 * `/odds/stream` feeds and mirrors every update for the REAL fixtures into
 * app/public/live-<fixtureId>.json, which the frontend polls for near-realtime rendering
 * (score, game phase per the on-chain phase encoding, per-period stats, live 1X2 prices).
 *
 * The browser cannot subscribe directly: the SSE endpoints require Authorization + X-Api-Token
 * headers (native EventSource can't send headers) and activation needs the wallet's signature.
 *
 * Run during live matches (WSL, keep alive):
 *   ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=~/.config/solana/id.json ts-node scripts/live-relay.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { EventSource } from "eventsource";
import * as fs from "fs";
import * as path from "path";
import { TXLINE, subscribeAndActivate } from "./txline";
import txoracleIdl from "../idls/txoracle.json";

const PUB = path.join(__dirname, "..", "app", "public");
const WRITE_DEBOUNCE_MS = 1500;

// Phase ids that mean "the match is live in the broadcast sense" (in play or an interval).
const LIVE_PHASES = new Set([2, 3, 4, 6, 7, 8, 9, 11, 12, 14, 18]);
const ENDED_PHASES = new Set([5, 10, 13, 15, 16, 17]);

interface LiveState {
  fixtureId: number;
  home: string; away: string;
  startTime: number | null;
  phase: number;             // game-phase encoding (1..19)
  score: [number, number];   // Stats keys 1/2
  yellows: [number, number]; // 3/4
  reds: [number, number];    // 5/6
  corners: [number, number]; // 7/8
  periods: Record<string, [number, number]>; // per-period goals, e.g. {"H1":[1,0],"H2":[0,2]}
  odds: [number, number, number] | null;     // live demargined 1X2
  possession: [number, number];              // event-count based, like build_feed.py
  lastAction: { ts: number; action: string; participant?: number; text?: string } | null;
  updatedAt: number;
}

const state = new Map<number, LiveState>();
const dirty = new Set<number>();

const num = (v: any): number | null => (v == null || isNaN(Number(v)) ? null : Number(v));

// Supabase mirror: deployed frontends (Vercel) have no local live-<id>.json, so every flush is
// also upserted into the live_matches table via PostgREST. Credentials come from app/.env
// (service_role key - write access; the table has no anon write policy).
function loadSupabase(): { url: string; key: string } | null {
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", "app", ".env"), "utf8");
    const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
    const url = get("VITE_SUPABASE_URL");
    const key = get("SUPABASE_SERVICE_ROLE_KEY");
    return url && key ? { url, key } : null;
  } catch { return null; }
}
const SB = loadSupabase();

async function pushSupabase(rows: LiveState[]) {
  if (!SB || rows.length === 0) return;
  try {
    const res = await fetch(`${SB.url}/rest/v1/live_matches?on_conflict=fixture_id`, {
      method: "POST",
      headers: {
        apikey: SB.key,
        Authorization: `Bearer ${SB.key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(rows.map((s) => ({ fixture_id: s.fixtureId, data: s, updated_at: s.updatedAt }))),
    });
    if (!res.ok) console.warn(`[relay] supabase upsert failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (e: any) {
    console.warn("[relay] supabase upsert error:", e?.message ?? e);
  }
}

function applyStats(s: LiveState, stats: Record<string, any>) {
  for (const [k, v] of Object.entries(stats)) {
    const key = Number(k), val = num(v);
    if (val == null || isNaN(key)) continue;
    const prefix = Math.floor(key / 1000), base = key % 1000;
    const side = base % 2 === 1 ? 0 : 1;
    if (prefix === 0) {
      if (base === 1 || base === 2) s.score[side] = val;
      else if (base === 3 || base === 4) s.yellows[side] = val;
      else if (base === 5 || base === 6) s.reds[side] = val;
      else if (base === 7 || base === 8) s.corners[side] = val;
    } else if (base === 1 || base === 2) {
      // per-period goals (1000 H1 / 2000 HT / 3000 H2 / 4000 ET1 / 5000 ET2 / 6000 PE / 7000 ETTotal)
      const P: Record<number, string> = { 1: "H1", 2: "HT", 3: "H2", 4: "ET1", 5: "ET2", 6: "PE", 7: "ETTotal" };
      const label = P[prefix] ?? `P${prefix}`;
      const cur = s.periods[label] ?? [0, 0];
      cur[side] = val;
      s.periods[label] = cur;
    }
  }
}

function flush() {
  // Write to public/ (vite dev) AND dist/ (vite preview serves the built snapshot - without this
  // a previewed site polls a frozen copy and the staleness guard kills the live UI after 3 min).
  const outDirs = [PUB, path.join(PUB, "..", "dist")].filter((d) => fs.existsSync(d));
  const rows: LiveState[] = [];
  for (const id of dirty) {
    const s = state.get(id);
    if (!s) continue;
    for (const dir of outDirs) fs.writeFileSync(path.join(dir, `live-${id}.json`), JSON.stringify(s));
    rows.push(s);
  }
  if (dirty.size) console.log(`[relay] wrote ${[...dirty].map((i) => `live-${i}.json`).join(", ")}${SB ? " (+supabase)" : ""}`);
  dirty.clear();
  void pushSupabase(rows);
}
setInterval(flush, WRITE_DEBOUNCE_MS);

function openStream(name: string, url: string, jwt: string, apiToken: string, onData: (ev: any) => void) {
  let lastId: string | undefined;
  const connect = () => {
    const es = new EventSource(url, {
      fetch: (input: any, init: any) => fetch(input, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          "Accept-Encoding": "deflate",
          Authorization: `Bearer ${jwt}`,
          "X-Api-Token": apiToken,
          ...(lastId ? { "Last-Event-ID": lastId } : {}),
        },
      }),
    });
    es.onopen = () => console.log(`[relay] ${name} stream connected`);
    es.onmessage = (ev: any) => {
      if (ev.lastEventId) lastId = ev.lastEventId;
      try { onData(JSON.parse(ev.data)); } catch { /* non-JSON keepalive */ }
    };
    es.onerror = () => {
      if ((es as any).readyState === 2) {
        console.log(`[relay] ${name} stream dropped - reconnecting in 5s`);
        es.close();
        setTimeout(connect, 5000);
      }
    };
  };
  connect();
}

async function main() {
  // Track the REAL fixtures (the shared live markets); sims are replays and never stream.
  const fixtures = JSON.parse(fs.readFileSync(path.join(PUB, "fixtures.json"), "utf8")) as any[];
  const reals = fixtures.filter((f) => (f.category ?? (f.featured ? "simulation" : "real")) === "real");
  for (const f of reals) {
    state.set(f.fixtureId, {
      fixtureId: f.fixtureId, home: f.home, away: f.away,
      startTime: f.kickoff ?? null, phase: 1,
      score: [f.score?.home ?? 0, f.score?.away ?? 0],
      yellows: [0, 0], reds: [0, 0], corners: [0, 0], periods: {},
      odds: f.odds ?? null, possession: [0, 0], lastAction: null, updatedAt: Date.now(),
    });
  }
  console.log(`[relay] tracking ${reals.length} real fixtures: ${reals.map((f) => f.fixtureId).join(", ")}`);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const oracle = new anchor.Program(txoracleIdl as anchor.Idl, provider);
  const { jwt, apiToken } = await subscribeAndActivate(provider, oracle);
  console.log("[relay] TxLINE data authorization active");

  openStream("scores", `${TXLINE.apiBase}/scores/stream`, jwt, apiToken, (ev) => {
    const id = num(ev.FixtureId);
    if (id == null) return;
    const s = state.get(id);
    if (!s) return; // not one of our real fixtures
    s.updatedAt = Date.now();
    if (ev.StartTime) s.startTime = ev.StartTime;
    if (ev.StatusId != null) s.phase = Number(ev.StatusId);
    if (ev.Possession === 1) s.possession[0]++;
    else if (ev.Possession === 2) s.possession[1]++;
    if (ev.Stats) applyStats(s, ev.Stats);
    if (ev.Action) s.lastAction = { ts: ev.Ts ?? Date.now(), action: ev.Action, participant: ev.Participant, text: ev.Data?.Text };
    dirty.add(id);
    if (LIVE_PHASES.has(s.phase) || ENDED_PHASES.has(s.phase))
      console.log(`[relay] ${id} ${s.home} ${s.score[0]}:${s.score[1]} ${s.away} · phase ${s.phase} · ${ev.Action ?? "update"}`);
  });

  openStream("odds", `${TXLINE.apiBase}/odds/stream`, jwt, apiToken, (ev) => {
    const id = num(ev.FixtureId);
    if (id == null) return;
    const s = state.get(id);
    if (!s) return;
    if (ev.Bookmaker === "TXLineStablePriceDemargined" && ev.SuperOddsType === "1X2_PARTICIPANT_RESULT"
        && Array.isArray(ev.Prices) && ev.Prices.length === 3) {
      // The SSE stream carries integer milli-prices (2555 = 2.555x); the REST feed uses decimals.
      // Normalise so the frontend always gets decimal odds.
      const scaled = ev.Prices.every((p: number) => p > 100);
      s.odds = ev.Prices.map((p: number) => (scaled ? p / 1000 : p)) as [number, number, number];
      s.updatedAt = Date.now();
      dirty.add(id);
    }
  });

  console.log("[relay] live - relaying TxODDS streams to app/public/live-<id>.json");
}

main().catch((e) => { console.error("[relay] fatal:", e?.message ?? e); process.exit(1); });
