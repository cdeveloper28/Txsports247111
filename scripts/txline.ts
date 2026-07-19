/**
 * TxLINE (TxODDS) devnet client helpers.
 *
 * Covers the pieces this project needs from the TxLINE off-chain API:
 *   - guest JWT acquisition
 *   - an authed axios client (Bearer JWT + X-Api-Token)
 *   - fetching a scores "stat-validation" Merkle proof for a finalised fixture and shaping it
 *     into the exact `StatValidationInput` our on-chain program forwards to txoracle.validate_stat_v2
 *   - deriving the txoracle `daily_scores_roots` PDA for a proof
 *
 * The subscription/activation flow (guest JWT -> on-chain `subscribe` -> sign -> /token/activate)
 * lives in `subscribe.ts` because it needs a funded devnet wallet.
 */
import * as anchor from "@coral-xyz/anchor";
import axios, { AxiosInstance } from "axios";
import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import BN from "bn.js";

export const TXLINE = {
  apiBase: process.env.TXLINE_API_BASE ?? "https://txline-dev.txodds.com/api",
  jwtUrl: process.env.TXLINE_JWT_URL ?? "https://txline-dev.txodds.com/auth/guest/start",
  /** TxLINE oracle program (devnet). */
  oracleProgram: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
  /** TxL utility/credit token mint (devnet, Token-2022). Data-auth only; never used for value. */
  txlMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
};

const MS_PER_DAY = 86_400_000;

export interface ProofNode {
  hash: number[];
  isRightSibling: boolean;
}

/** The shape our program's `resolve(claimed_outcome, payload)` expects (anchor camelCase). */
export interface StatValidationInput {
  ts: BN;
  fixtureSummary: {
    fixtureId: BN;
    updateStats: { updateCount: number; minTimestamp: BN; maxTimestamp: BN };
    eventsSubTreeRoot: number[];
  };
  fixtureProof: ProofNode[];
  mainTreeProof: ProofNode[];
  eventStatRoot: number[];
  stats: { stat: { key: number; value: number; period: number }; statProof: ProofNode[] }[];
}

/** POST /auth/guest/start -> short-lived guest JWT. */
export async function getGuestJwt(): Promise<string> {
  const r = await axios.post(TXLINE.jwtUrl);
  return r.data.token as string;
}

/**
 * Full TxLINE data-authorization handshake for the free World Cup tier:
 *   guest JWT -> ensure TxL Token-2022 ATA -> on-chain `subscribe` -> sign -> POST /token/activate.
 * Returns an authed axios client (Bearer JWT + X-Api-Token). `program` is the txoracle Program.
 */
export async function subscribeAndActivate(
  provider: anchor.AnchorProvider,
  program: anchor.Program,
  opts: { serviceLevelId?: number; weeks?: number; leagues?: number[] } = {}
): Promise<{ api: AxiosInstance; apiToken: string; jwt: string }> {
  const serviceLevelId = opts.serviceLevelId ?? 1; // free World Cup tier
  const weeks = opts.weeks ?? 4;
  const leagues = opts.leagues ?? [];
  const wallet = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  const jwt = await getGuestJwt();

  const txlAta = getAssociatedTokenAddressSync(TXLINE.txlMint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
  if (!(await connection.getAccountInfo(txlAta))) {
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey, txlAta, wallet.publicKey, TXLINE.txlMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    await provider.sendAndConfirm(tx, []);
  }

  const [pricingMatrix] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], program.programId);
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], program.programId);
  const tokenTreasuryVault = getAssociatedTokenAddressSync(TXLINE.txlMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID);

  const txSig = await program.methods
    .subscribe(serviceLevelId, weeks)
    .accounts({
      user: wallet.publicKey,
      pricingMatrix,
      tokenMint: TXLINE.txlMint,
      userTokenAccount: txlAta,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  const message = new TextEncoder().encode(`${txSig}:${leagues.join(",")}:${jwt}`);
  const walletSignature = Buffer.from(
    nacl.sign.detached(message, (wallet.payer as anchor.web3.Keypair).secretKey)
  ).toString("base64");
  const { data: activation } = await axios.post(
    `${TXLINE.apiBase}/token/activate`,
    { txSig, walletSignature, leagues },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  const apiToken: string = activation.token || activation;
  return { api: makeApiClient(jwt, apiToken), apiToken, jwt };
}

/** An axios client that attaches the JWT + API token on every request. */
export function makeApiClient(jwt: string, apiToken: string): AxiosInstance {
  const c = axios.create({ baseURL: TXLINE.apiBase });
  c.interceptors.request.use((cfg) => {
    cfg.headers.set?.("Authorization", `Bearer ${jwt}`);
    cfg.headers.set?.("X-Api-Token", apiToken);
    return cfg;
  });
  return c;
}

const toNodes = (arr: any[]): ProofNode[] =>
  (arr ?? []).map((n) => ({ hash: Array.from(n.hash), isRightSibling: n.isRightSibling }));

/**
 * GET /scores/stat-validation?fixtureId&seq&statKeys=1,2  (home=idx0, away=idx1)
 * and shape it into the on-chain `StatValidationInput`.
 */
export async function fetchResultProof(
  api: AxiosInstance,
  fixtureId: number,
  seq: number
): Promise<{ payload: StatValidationInput; raw: any }> {
  const url = `/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKeys=1,2`;
  const { data: val } = await api.get(url);

  const payload: StatValidationInput = {
    ts: new BN(val.summary.updateStats.minTimestamp),
    fixtureSummary: {
      fixtureId: new BN(val.summary.fixtureId),
      updateStats: {
        updateCount: val.summary.updateStats.updateCount,
        minTimestamp: new BN(val.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(val.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: Array.from(val.summary.eventStatsSubTreeRoot),
    },
    fixtureProof: toNodes(val.subTreeProof),
    mainTreeProof: toNodes(val.mainTreeProof),
    eventStatRoot: Array.from(val.eventStatRoot),
    stats: (val.statsToProve as any[]).map((s, i) => ({
      stat: s,
      statProof: toNodes(val.statProofs[i]),
    })),
  };
  return { payload, raw: val };
}

/** Derive the txoracle `daily_scores_roots` PDA that anchors this proof's day. */
export function dailyScoresPda(minTimestampMs: number | BN): PublicKey {
  const epochDay = Math.floor(Number(minTimestampMs.toString()) / MS_PER_DAY);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)],
    TXLINE.oracleProgram
  );
  return pda;
}

/** Read the human-readable outcome a proof implies from the two proven score stats. */
export function outcomeFromProof(payload: StatValidationInput): {
  outcome: 0 | 1 | 2;
  home: number;
  away: number;
  label: string;
} {
  const home = payload.stats[0].stat.value;
  const away = payload.stats[1].stat.value;
  const outcome = home > away ? 0 : home === away ? 1 : 2;
  const label = ["Home win", "Draw", "Away win"][outcome];
  return { outcome: outcome as 0 | 1 | 2, home, away, label };
}

/**
 * Scan recent 5-minute score-update buckets to find a fixture's latest event `seq`.
 * Useful to locate the finalised score record to prove.
 */
export async function scanRecentScores(
  api: AxiosInstance,
  fixtureId: number,
  lookbackBuckets = 288 // ~24h of 5-min buckets
): Promise<any[]> {
  const now = Date.now();
  const found: any[] = [];
  for (let i = 0; i < lookbackBuckets; i++) {
    const t = new Date(now - i * 5 * 60 * 1000);
    const epochDay = Math.floor(t.getTime() / MS_PER_DAY);
    const hourOfDay = t.getUTCHours();
    const interval = Math.floor(t.getUTCMinutes() / 5);
    try {
      const { data } = await api.get(
        `/scores/updates/${epochDay}/${hourOfDay}/${interval}?fixtureId=${fixtureId}`
      );
      if (Array.isArray(data) && data.length) found.push(...data);
    } catch {
      /* empty bucket / not authorised — skip */
    }
  }
  return found;
}
