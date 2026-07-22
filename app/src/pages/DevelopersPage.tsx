import { useState } from "react";
import {
  Copy, CheckCircle, DownloadSimple, Cube, UsersThree, Robot, ChartBar, GithubLogo, ArrowSquareOut, Code, Warning,
} from "@phosphor-icons/react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Card } from "../components/ui/card";
import { PROGRAM_ID, TXORACLE } from "../config";
import { toast } from "../lib/toast";

const REPO = "https://github.com/cdeveloper28/Txsports247111";

/** Mono code block with a copy button. */
function Snippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#0b0c0e]">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
        <span className="font-mono text-[11px] text-muted-foreground">{title}</span>
        <button
          onClick={async () => {
            try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); }
            catch { toast.error("Copy failed", "Select and copy manually"); }
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {copied ? <><CheckCircle weight="fill" size={12} className="text-success" /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-foreground/90">{code}</pre>
    </div>
  );
}

function Fact({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <button
      onClick={async () => {
        if (!copyValue) return;
        try { await navigator.clipboard.writeText(copyValue); toast.success("Copied", label); } catch { /* no-op */ }
      }}
      className={"bg-card px-5 py-4 text-left " + (copyValue ? "transition-colors hover:bg-secondary/60" : "cursor-default")}
      title={copyValue ? "Click to copy" : undefined}
    >
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="tnum mt-1.5 break-all font-mono text-[13px] font-semibold leading-snug">{value}</div>
    </button>
  );
}

function RefTable({ head, rows }: { head: string[]; rows: (string | JSX.Element)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className={"px-4 py-3 " + (j === 0 ? "whitespace-nowrap font-mono text-[12px] font-semibold" : "text-muted-foreground")}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const paths = [
  {
    icon: Cube,
    title: "Run your own pools on our program",
    body: "Market accounts are keyed by fixture and a host pubkey. Pass your app's key as host and you get a private universe of pools per fixture on the already deployed program: your users, your UI, our trustless settlement. Nothing to deploy, nothing to audit twice.",
  },
  {
    icon: UsersThree,
    title: "Join the shared markets",
    body: "Use the default host and your users bet into the same canonical pools as txsports.app. You inherit the existing liquidity and your stakes deepen it for everyone. Best for wallets, aggregators and betting front ends.",
  },
  {
    icon: Robot,
    title: "Run a keeper",
    body: "resolve() is permissionless. A bot that fetches the TxLINE score proof at full time and submits it settles every open market for all users at once. No role to apply for, no key to be granted: if your proof verifies, you settled it.",
  },
  {
    icon: ChartBar,
    title: "Read everything",
    body: "Markets and positions are plain program accounts, and every action emits an Anchor event. Pull accounts with one getProgramAccounts call, or subscribe to logs for a live feed. No API key, no rate contract with us, just Solana RPC.",
  },
];

export function DevelopersPage() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-deployment";

  const setupSnippet = `// pnpm add @solana/web3.js @coral-xyz/anchor
import { Connection, PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey("${PROGRAM_ID.toBase58()}");
const TXORACLE   = new PublicKey("${TXORACLE.toBase58()}"); // TxLINE oracle (CPI target)
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// the full Anchor IDL is served by this site (also in the repo at app/src/idl/)
const idl = await (await fetch("${origin}/idl.json")).json();
const program = new Program(idl, new AnchorProvider(connection, wallet, {}));

// PDA derivations - these three cover every account you will ever pass:

// market: one per (fixture, host)
//   host = PublicKey.default -> the shared pool everyone on txsports.app bets into
//   host = your app's pubkey -> your own white-label pool universe on the same program
const marketPda = (fixtureId: number, host: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("market"), new BN(fixtureId).toArrayLike(Buffer, "le", 8), host.toBuffer()],
    PROGRAM_ID,
  )[0];

// position: one per (market, wallet) - created automatically by the first place_bet
const positionPda = (market: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), owner.toBuffer()],
    PROGRAM_ID,
  )[0];

// daily scores root: the TxODDS account resolve() verifies proofs against,
// keyed by the proof's UTC epoch day (u16, little endian) on the ORACLE program
const dailyScoresPda = (minTimestampMs: number) => {
  const seed = Buffer.alloc(2);
  seed.writeUInt16LE(Math.floor(minTimestampMs / 86_400_000) & 0xffff, 0);
  return PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), seed], TXORACLE)[0];
};`;

  const betSnippet = `const host = PublicKey.default;              // or your app's key for white-label pools
const fixtureId = 18257739;                  // fixture ids come from TxLINE (see the data section)
const market = marketPda(fixtureId, host);
const position = positionPda(market, wallet.publicKey);

// first bet on a fixture? create the market in the same transaction.
// closes_at is a unix timestamp in SECONDS: place_bet and cancel_bet are
// rejected after it (error 6004 BettingClosed). Use kickoff for real
// fixtures so nobody can bet with the score already known.
const pre = (await connection.getAccountInfo(market)) ? [] : [
  await program.methods
    .initMarket(new BN(fixtureId), new BN(kickoffUnixSeconds), host)
    .accounts({ market, creator: wallet.publicKey, systemProgram: SystemProgram.programId })
    .instruction(),
  // NOTE: initMarket takes all three args. Passing only two makes anchor-ts fail
  // account resolution with "Account market not provided" - it needs host for the PDA.
];

// outcome: 0 Home, 1 Draw, 2 Away. amount is LAMPORTS (u64).
// the program enforces no maximum stake - the $50 cap on txsports.app is frontend policy.
await program.methods
  .placeBet(0, new BN(0.1 * 1e9))
  .accounts({ market, position, bettor: wallet.publicKey, systemProgram: SystemProgram.programId })
  .preInstructions(pre)
  .rpc();`;

  const cancelClaimSnippet = `// cancel: full refund of one outcome's stake, any time BEFORE closes_at / resolution
await program.methods
  .cancelBet(0 /* the outcome you staked */)
  .accounts({ market, position, owner: wallet.publicKey })
  .rpc(); // errors: 6002 NothingToCancel, 6004 BettingClosed, 6003 MarketResolved

// claim: after resolution, winners take stake x total_pool / winning_pool.
// if the winning side has NO stakes the market is void and claim refunds everyone.
// a position can be claimed exactly once (6006 AlreadyClaimed guards the double spend).
await program.methods
  .claim()
  .accounts({ market, position, owner: wallet.publicKey })
  .rpc(); // errors: 6005 NotResolved, 6006 AlreadyClaimed`;

  const settleSnippet = `// 1. fetch the fixture's finalised score proof from TxLINE:
//      GET /api/scores/stat-validation?fixtureId=...&seq=...&statKeys=1,2
//    statKeys 1,2 = home and away goals. Use the seq of the highest SCORE event
//    (the highest raw seq can be a status event that stat-validation rejects).
//    Auth: free guest tier - POST /auth/guest/start, then subscribe + activate.
//    The whole flow is implemented in scripts/txline.ts in the repo.
//    For the simulation fixtures, this site already serves ready payloads at /proof-<fixtureId>.json.

// 2. GOTCHA: the proof's u64/i64 fields (ts, fixtureId, timestamps) serialise to HEX
//    strings via BN.toJSON. Revive them before submitting or Borsh encoding fails:
const p = proof.payload;
const payload = {
  ...p,
  ts: new BN(p.ts, 16),
  fixtureSummary: {
    ...p.fixtureSummary,
    fixtureId: new BN(p.fixtureSummary.fixtureId, 16),
    updateStats: {
      updateCount: p.fixtureSummary.updateStats.updateCount,
      minTimestamp: new BN(p.fixtureSummary.updateStats.minTimestamp, 16),
      maxTimestamp: new BN(p.fixtureSummary.updateStats.maxTimestamp, 16),
    },
  },
};

// 3. submit - anyone can, there is no resolver role. The Merkle verification is heavy:
//    request ~1.4M compute units or the transaction runs out of budget.
const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
await program.methods
  .resolve(outcome /* 0|1|2, must match what the proof proves */, payload)
  .accounts({
    market,
    dailyScoresMerkleRoots: dailyScoresPda(payload.fixtureSummary.updateStats.minTimestamp.toNumber()),
    txoracleProgram: TXORACLE,
    payer: wallet.publicKey,
  })
  .preInstructions([cu])
  .rpc();
// on-chain the program rebuilds the outcome predicate from claimed_outcome, checks the
// root account derivation + owner, then CPIs txoracle.validate_stat_v2. Any mismatch
// reverts: 6007 FixtureMismatch, 6009 NotFinalised, 6010 WrongRootAccount, 6011 ProofRejected.`;

  const readSnippet = `import bs58 from "bs58"; // or utils.bytes.bs58 from @coral-xyz/anchor

// account discriminators come straight from the IDL - nothing hardcoded:
const disc = (name: string) =>
  bs58.encode(Uint8Array.from(idl.accounts.find((a) => a.name === name).discriminator));
// Market = [219,190,213,55,0,227,198,154], Position = [170,188,143,228,122,64,247,208]

// every market on the platform, one call
const markets = await connection.getProgramAccounts(PROGRAM_ID, {
  filters: [{ memcmp: { offset: 0, bytes: disc("Market") } }],
});
for (const { pubkey, account } of markets) {
  const m = program.coder.accounts.decode("Market", account.data);
  // fields: fixtureId i64 · host pubkey · pools [u64;3] · totalPool u64
  //         closesAt i64 (unix s) · creator pubkey · resolved bool · winningOutcome u8
}

// every position (all bets) - filter by market or owner with extra memcmps:
//   market sits at offset 8, owner at offset 40
const positions = await connection.getProgramAccounts(PROGRAM_ID, {
  filters: [
    { memcmp: { offset: 0, bytes: disc("Position") } },
    { memcmp: { offset: 40, bytes: wallet.publicKey.toBase58() } }, // just this wallet's
  ],
});

// live feed without polling: every instruction emits an Anchor event
// (MarketOpened, BetPlaced, BetCancelled, MarketResolved, Claimed)
connection.onLogs(PROGRAM_ID, ({ logs }) => {
  for (const log of logs) {
    if (!log.startsWith("Program data: ")) continue;
    const ev = program.coder.events.decode(log.slice("Program data: ".length));
    if (ev?.name === "BetPlaced") console.log(ev.data); // { market, bettor, outcome, amount }
  }
}, "confirmed");`;

  const embedSnippet = `<iframe
  src="${origin}/#/app/18257739"
  width="100%" height="760"
  style="border:0;border-radius:12px;background:#0b0c0e"
  title="Txsports market"
></iframe>`;

  return (
    <div className="min-h-screen">
      <Nav page="developers" wide />
      <section className="mx-auto w-full max-w-[1100px] px-4 py-12 sm:px-6">
        <div className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">Developers</div>
        <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">
          The settlement layer is public.
          <br />
          Build whatever you want on it.
        </h1>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          Txsports is a deployed Solana program, not a service. Markets are permissionless to create, bets are
          plain instructions, and settlement is a Merkle proof of the real score verified on chain against the
          root TxODDS anchors daily. There is no API key and no partnership form: if your transaction is valid,
          you are integrated.
        </p>

        {/* the facts */}
        <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Settlement program" value={PROGRAM_ID.toBase58()} copyValue={PROGRAM_ID.toBase58()} />
          <Fact label="TxLINE oracle (CPI target)" value={TXORACLE.toBase58()} copyValue={TXORACLE.toBase58()} />
          <Fact label="Cluster" value="Solana devnet" />
          <div className="grid place-items-center bg-card px-5 py-4">
            <a href="/idl.json" download="txsports-idl.json"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-secondary">
              <DownloadSimple weight="bold" size={16} /> Download the IDL
            </a>
          </div>
        </div>

        {/* four ways in */}
        <h2 className="mt-14 font-display text-2xl font-bold sm:text-3xl">Four ways to build with it</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {paths.map((p) => (
            <Card key={p.title} className="p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <p.icon weight="fill" size={18} />
                </span>
                <h3 className="font-display text-lg font-bold">{p.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </Card>
          ))}
        </div>

        {/* full program reference */}
        <h2 className="mt-14 font-display text-2xl font-bold sm:text-3xl">The program, completely</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Five instructions and two account types. This is the entire surface: there is no admin instruction,
          no pause switch and no fee sweep anywhere in the program.
        </p>
        <div className="mt-6 space-y-6">
          <RefTable
            head={["Instruction", "Arguments", "Accounts", "What the program enforces"]}
            rows={[
              ["init_market", "fixture_id: i64 · closes_at: i64 (unix s) · host: pubkey",
                "market (pda, w) · creator (w, signer) · system_program",
                "Permissionless. The market PDA must derive from (fixture_id, host). closes_at gates all betting."],
              ["place_bet", "outcome: u8 (0 Home · 1 Draw · 2 Away) · amount: u64 lamports",
                "market (w) · position (pda, w) · bettor (w, signer) · system_program",
                "Rejects after closes_at (6004) or resolution (6003); zero amounts (6001); outcome > 2 (6000). Lamports move bettor → market PDA. No max stake on chain."],
              ["cancel_bet", "outcome: u8",
                "market (w) · position (w) · owner (w, signer)",
                "Full refund of that outcome's stake before close/resolution. Nothing staked → 6002."],
              ["resolve", "claimed_outcome: u8 · payload: StatValidationInput",
                "market (w) · daily_scores_merkle_roots · txoracle_program · payer (signer)",
                "Permissionless. Rebuilds the predicate from claimed_outcome, binds the proof to this fixture and one period snapshot, verifies the root account derivation + owner, CPIs validate_stat_v2. Any failure reverts (6007-6011). Needs ~1.4M CU."],
              ["claim", "none",
                "market (w) · position (w) · owner (w, signer)",
                "Pays stake × total_pool ÷ winning_pool from the market PDA. Void market (empty winning pool) refunds every stake. Position marked claimed before transfer; second claim → 6006."],
            ]}
          />
          <RefTable
            head={["Account", "Fields (Borsh order after the 8-byte discriminator)", "Discriminator"]}
            rows={[
              ["Market", "fixture_id i64 · host pubkey · pools [u64; 3] · total_pool u64 · closes_at i64 · creator pubkey · resolved bool · winning_outcome u8 · bump u8",
                <span key="d1" className="font-mono text-[11px]">[219, 190, 213, 55, 0, 227, 198, 154]</span>],
              ["Position", "market pubkey (offset 8) · owner pubkey (offset 40) · amounts [u64; 3] · claimed bool",
                <span key="d2" className="font-mono text-[11px]">[170, 188, 143, 228, 122, 64, 247, 208]</span>],
            ]}
          />
          <RefTable
            head={["Event", "Payload", "Emitted by"]}
            rows={[
              ["MarketOpened", "market · fixture_id · host · closes_at", "init_market"],
              ["BetPlaced", "market · bettor · outcome · amount", "place_bet"],
              ["BetCancelled", "market · bettor · outcome · amount", "cancel_bet"],
              ["MarketResolved", "market · fixture_id · outcome", "resolve"],
              ["Claimed", "market · owner · amount", "claim"],
            ]}
          />
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Error codes</div>
            <p className="mt-2 font-mono text-[12px] leading-relaxed text-muted-foreground">
              6000 InvalidOutcome · 6001 ZeroAmount · 6002 NothingToCancel · 6003 MarketResolved ·
              6004 BettingClosed · 6005 NotResolved · 6006 AlreadyClaimed · 6007 FixtureMismatch ·
              6008 MalformedProof · 6009 NotFinalised · 6010 WrongRootAccount · 6011 ProofRejected ·
              6012 Overflow · 6013 Unauthorized
            </p>
          </div>
        </div>

        {/* snippets */}
        <h2 className="mt-14 font-display text-2xl font-bold sm:text-3xl">Copy, paste, bet</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Everything below runs against the deployed devnet program with nothing but a wallet and an RPC url.
          The snippets are complete: every constant, PDA and gotcha they use is defined in snippet 1 or noted inline.
        </p>
        <div className="mt-6 space-y-5">
          <Snippet title="1 · connect + every PDA you will ever need" code={setupSnippet} />
          <Snippet title="2 · open a market and place a bet" code={betSnippet} />
          <Snippet title="3 · cancel before kickoff, claim after settlement" code={cancelClaimSnippet} />
          <Snippet title="4 · settle any market with a score proof (permissionless keeper)" code={settleSnippet} />
          <Snippet title="5 · read the whole platform + live event feed" code={readSnippet} />
          <Snippet title="bonus · embed a live market in your page" code={embedSnippet} />
        </div>

        {/* data endpoints */}
        <h2 className="mt-14 font-display text-2xl font-bold sm:text-3xl">Data this site serves you</h2>
        <div className="mt-6">
          <RefTable
            head={["Endpoint", "What it is"]}
            rows={[
              [<span key="a" className="font-mono">/idl.json</span>, "The full Anchor IDL of the settlement program: instructions, accounts, events, errors, types."],
              [<span key="b" className="font-mono">/fixtures.json</span>, "The fixture catalogue: fixtureId, home, away, kickoff (ms), status, category (simulation | real), consensus odds [home, draw, away], finalOutcome for finished matches."],
              [<span key="c" className="font-mono">/proof-{"<fixtureId>"}.json</span>, "A captured, ready-to-submit TxLINE score proof for every simulation fixture: outcome, label, dailyScoresPda and the full payload (revive the hex BN fields as in snippet 4)."],
              [<span key="d" className="font-mono">/feed-{"<fixtureId>"}.json</span>, "The recorded replay feed of a simulation: minute-by-minute score, stats and 1X2 odds frames from real TxLINE data."],
            ]}
          />
        </div>

        {/* data note + links */}
        <Card className="mt-10 p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Code weight="fill" size={18} /></span>
            <h3 className="font-display text-lg font-bold">The data side: TxLINE and TxODDS</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Fixtures, live scores, odds and the settlement proofs all come from TxLINE, the Solana product of
            sports data provider TxODDS. Reading our program needs no TxLINE account at all, and the bundled
            simulation proofs above are ready to use. Fetching fresh proofs or live streams for your own fixtures
            needs TxLINE auth (a free guest tier exists): POST /auth/guest/start, an on-chain txoracle.subscribe,
            then POST /api/token/activate. The repo's scripts/txline.ts implements the whole flow end to end.
          </p>
          <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <Warning weight="fill" size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <span>
              Two gotchas that cost integrators the most time: proof payload u64/i64 fields arrive as hex strings
              (revive with <span className="font-mono text-[12px]">new BN(x, 16)</span>, snippet 4), and resolve
              needs a ~1.4M compute unit budget or it fails with an exceeded-budget error, not a program error.
            </span>
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href={REPO} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-secondary">
              <GithubLogo weight="fill" size={16} /> Source + program code
            </a>
            <a href={`${REPO}/blob/main/docs/HOW-IT-WORKS.md`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-secondary">
              How it works <ArrowSquareOut size={14} />
            </a>
            <a href="https://txline.txodds.com" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-secondary">
              TxLINE docs <ArrowSquareOut size={14} />
            </a>
          </div>
        </Card>
      </section>
      <Footer wide />
    </div>
  );
}
