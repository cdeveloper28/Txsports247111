import { useEffect, useState } from "react";

// Robust SOL/USD spot price. CoinGecko alone rate-limits browser IPs, which used to strand the UI
// on a hard-coded $180 fallback - so we try several public sources in order, cache the last good
// price in localStorage (a stale real price beats any made-up constant), dedupe in-flight fetches,
// and refresh every minute via useSolPrice().

const CACHE_KEY = "sol-usd-price";
const FRESH_MS = 2 * 60_000;

type Cached = { price: number; t: number };

function readCache(): Cached | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || "");
    return typeof v?.price === "number" && v.price > 0 ? v : null;
  } catch { return null; }
}
function writeCache(price: number) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ price, t: Date.now() })); } catch { /* private mode */ }
}

const get = (url: string, ms = 6000) =>
  fetch(url, { signal: AbortSignal.timeout(ms) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));

const WSOL = "So11111111111111111111111111111111111111112";
const SOURCES: Array<() => Promise<number>> = [
  () => get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd").then((d) => d.solana.usd),
  () => get(`https://lite-api.jup.ag/price/v3?ids=${WSOL}`).then((d) => d[WSOL].usdPrice),
  () => get("https://api.coinbase.com/v2/prices/SOL-USD/spot").then((d) => Number(d.data.amount)),
  () => get("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT").then((d) => Number(d.price)),
];

let inflight: Promise<number> | null = null;

/** Current SOL/USD. Cached (2 min), multi-source, falls back to the last known real price. */
export async function getSolPrice(): Promise<number> {
  const c = readCache();
  if (c && Date.now() - c.t < FRESH_MS) return c.price;
  if (!inflight) {
    inflight = (async () => {
      for (const src of SOURCES) {
        try {
          const p = await src();
          if (Number.isFinite(p) && p > 0) { writeCache(p); return p; }
        } catch { /* try the next source */ }
      }
      return c?.price ?? 180; // every source down: stale real price, then the old constant
    })().finally(() => { inflight = null; });
  }
  return inflight;
}

/** Live SOL/USD for components - instant from cache, then kept fresh every 60s. */
export function useSolPrice(): number {
  const [price, setPrice] = useState(() => readCache()?.price ?? 180);
  useEffect(() => {
    let alive = true;
    const run = () => getSolPrice().then((p) => { if (alive) setPrice(p); }).catch(() => {});
    run();
    const t = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return price;
}
