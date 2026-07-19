import {
  recordRemote,
  fetchRemote,
  supabaseEnabled,
  type Prediction,
} from "./supabase";

export type { Prediction };
// Kept named `remoteEnabled` so UI code stays backend-agnostic.
export const remoteEnabled = supabaseEnabled;

// A wallet's prediction history is stored in two places:
//   - localStorage (always available, so the History tab works with zero setup), and
//   - Supabase (when VITE_SUPABASE_URL/ANON_KEY are set), so it follows the wallet across devices.
// getHistory() merges both, deduped by (sig, kind), newest first.

const key = (wallet: string) => `txsports:history:${wallet}`;

function readLocal(wallet: string): Prediction[] {
  try {
    return JSON.parse(localStorage.getItem(key(wallet)) || "[]");
  } catch {
    return [];
  }
}

function writeLocal(wallet: string, list: Prediction[]) {
  try {
    localStorage.setItem(key(wallet), JSON.stringify(list.slice(-200)));
  } catch {
    /* storage full / disabled - non-fatal */
  }
}

export async function recordPrediction(p: Prediction): Promise<void> {
  const entry: Prediction = { ...p, ts: p.ts ?? Date.now() };
  const list = readLocal(entry.wallet);
  list.push(entry);
  writeLocal(entry.wallet, list);
  await recordRemote(entry); // best-effort; no-op if Supabase isn't configured
}

export async function getHistory(wallet: string): Promise<Prediction[]> {
  const local = readLocal(wallet);
  const remote = remoteEnabled ? await fetchRemote(wallet) : [];
  const merged = new Map<string, Prediction>();
  for (const p of [...local, ...remote]) merged.set(`${p.sig}:${p.kind}`, p);
  return [...merged.values()].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}
