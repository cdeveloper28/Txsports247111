import { useEffect, useState } from "react";
import { phaseOf, type GamePhase } from "./gamePhase";

// Live match data relayed from the TxODDS SSE streams by scripts/live-relay.ts into
// /live-<fixtureId>.json. The browser polls that file (SSE auth headers can't be sent from a
// native EventSource, so the relay holds the authenticated stream server-side).

export interface LiveMatch {
  fixtureId: number;
  home: string; away: string;
  startTime: number | null;
  phase: number;
  score: [number, number];
  yellows: [number, number];
  reds: [number, number];
  corners: [number, number];
  periods: Record<string, [number, number]>;
  odds: [number, number, number] | null;
  possession: [number, number];
  lastAction: { ts: number; action: string; participant?: number; text?: string } | null;
  updatedAt: number;
}

const POLL_MS = 6_000;
/** Relay data older than this is treated as gone-stale (relay stopped), not live. */
const STALE_MS = 3 * 60_000;

export function isFresh(m: LiveMatch | null): boolean {
  if (!m) return false;
  // An ended match emits no further events - its final state is final, never "stale".
  if (phaseOf(m.phase).ended) return true;
  return Date.now() - m.updatedAt < STALE_MS;
}

/** Estimate the match minute from kickoff time + phase (frozen during intervals). */
export function liveMinute(m: LiveMatch): number | null {
  if (!m.startTime) return null;
  const mins = Math.floor((Date.now() - m.startTime) / 60_000);
  const p = phaseOf(m.phase);
  if (!p.inPlay) return null;
  return Math.max(1, Math.min(mins, 130));
}

/** Poll /live-<id>.json while enabled; null when absent, unreadable, or the relay went stale. */
export function useLiveMatch(fixtureId: number, enabled: boolean): { live: LiveMatch | null; phase: GamePhase } {
  const [live, setLive] = useState<LiveMatch | null>(null);
  useEffect(() => {
    if (!enabled) { setLive(null); return; }
    let alive = true;
    const load = () =>
      fetch(`/live-${fixtureId}.json`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setLive(d && isFresh(d) ? d : null); })
        .catch(() => { if (alive) setLive(null); });
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [fixtureId, enabled]);
  return { live, phase: phaseOf(live?.phase) };
}
