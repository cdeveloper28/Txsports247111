// TxODDS/TxLINE on-chain specification encodings (soccer).
// Game phases arrive as `StatusId`/`GameState` on scores records; stats arrive keyed as
// `period_prefix + base_key`. These same encodings back the on-chain validation proofs, so the
// UI renders exactly what settlement will later prove.

export interface GamePhase {
  code: string;
  label: string;
  /** Match is being played right now (clock conceptually running). */
  inPlay: boolean;
  /** Match is live in the broadcast sense (in play OR an interval like HT). */
  live: boolean;
  /** Terminal states - the fixture is over (or won't be played). */
  ended: boolean;
}

export const GAME_PHASES: Record<number, GamePhase> = {
  1:  { code: "NS",   label: "Not started",            inPlay: false, live: false, ended: false },
  2:  { code: "H1",   label: "First half",             inPlay: true,  live: true,  ended: false },
  3:  { code: "HT",   label: "Halftime",               inPlay: false, live: true,  ended: false },
  4:  { code: "H2",   label: "Second half",            inPlay: true,  live: true,  ended: false },
  5:  { code: "FT",   label: "Full time",              inPlay: false, live: false, ended: true },
  6:  { code: "WET",  label: "Waiting for extra time", inPlay: false, live: true,  ended: false },
  7:  { code: "ET1",  label: "Extra time 1st half",    inPlay: true,  live: true,  ended: false },
  8:  { code: "HTET", label: "Extra time halftime",    inPlay: false, live: true,  ended: false },
  9:  { code: "ET2",  label: "Extra time 2nd half",    inPlay: true,  live: true,  ended: false },
  10: { code: "FET",  label: "Ended after extra time", inPlay: false, live: false, ended: true },
  11: { code: "WPE",  label: "Waiting for penalties",  inPlay: false, live: true,  ended: false },
  12: { code: "PE",   label: "Penalty shootout",       inPlay: true,  live: true,  ended: false },
  13: { code: "FPE",  label: "Ended after penalties",  inPlay: false, live: false, ended: true },
  14: { code: "I",    label: "Interrupted",            inPlay: false, live: true,  ended: false },
  15: { code: "A",    label: "Abandoned",              inPlay: false, live: false, ended: true },
  16: { code: "C",    label: "Cancelled",              inPlay: false, live: false, ended: true },
  17: { code: "TXCC", label: "Coverage cancelled",     inPlay: false, live: false, ended: true },
  18: { code: "TXCS", label: "Coverage suspended",     inPlay: false, live: true,  ended: false },
  19: { code: "P",    label: "Postponed",              inPlay: false, live: false, ended: false },
  // TxLINE marks the game_finalised record with 100 (same marker the on-chain program requires
  // on a provable full-time score). Treat it as a terminal full-time state.
  100: { code: "FT",  label: "Full time",              inPlay: false, live: false, ended: true },
};

export const phaseOf = (id?: number | null): GamePhase =>
  (id != null && GAME_PHASES[id]) || GAME_PHASES[1];

/** Full-game stat base keys (period prefix 0). Odd keys = Participant 1, even = Participant 2. */
export const BASE_STATS: Record<number, string> = {
  1: "Goals", 2: "Goals",
  3: "Yellow cards", 4: "Yellow cards",
  5: "Red cards", 6: "Red cards",
  7: "Corners", 8: "Corners",
};

export const STAT_PERIODS: Record<number, string> = {
  0: "Total", 1: "H1", 2: "HT", 3: "H2", 4: "ET1", 5: "ET2", 6: "PE", 7: "ET Total",
};

/** Decode a period-prefixed stat key: 3001 -> { period: "H2", base: 1, participant: 1 }. */
export function decodeStatKey(key: number): { period: string; base: number; participant: 1 | 2; name: string } {
  const prefix = Math.floor(key / 1000);
  const base = key % 1000;
  return {
    period: STAT_PERIODS[prefix] ?? `P${prefix}`,
    base,
    participant: (base % 2 === 1 ? 1 : 2) as 1 | 2,
    name: BASE_STATS[base] ?? `Stat ${base}`,
  };
}
