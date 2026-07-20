# Txsports

Trustless World Cup prediction markets on Solana. Parimutuel pools settled by cryptographic proof of the real match result: no bookmaker, no oracle, no admin key. Stake native SOL, win the pool.

Powered by TxLINE and TxODDS verifiable sports data anchored on Solana.

Made by cdev28. Portfolio: [cdev28.com](https://cdev28.com)

## The problem

Two trust problems sit on top of sports betting.

1. Bookmaker trust. Punters (very acutely in markets like Nigeria) do not fully trust that a bookmaker will pay out fairly, or at all. The house sets the odds, takes a margin, and controls settlement.
2. Oracle trust. Every on chain prediction market still depends on a trusted resolver (a multisig or an optimistic oracle) to decide who won. That resolver is the recurring attack surface and dispute source.

Txsports removes both. Bettors pool native SOL on an outcome. The pool is settled only by a TxLINE Merkle proof of the finalised score, verified on chain by the TxODDS oracle program itself. There is no house edge (parimutuel winners split the whole pool), no trusted resolver, and the settlement contract has no admin key and no void or cancel instruction.

## What it does

Real World Cup fixtures and teams across two tabs.

1. Simulation. Past World Cup matches replayed as live from real recorded TxLINE data. Bet, kick off, watch it play to full time, settle on chain with the real score proof.
2. Real and live. Genuinely upcoming and live fixtures from the feed, with live demargined odds and win probability streamed from the TxODDS relay. Bets are taken only before kickoff; the pool locks when the match starts so nobody can bet with the score already known.

The flow of a bet:

1. Browse a market. Live implied odds are simply each pool's share of the total; there is no order book and no matching engine.
2. Stake SOL (up to 50 USD worth) on Home, Draw or Away. A live payout estimate shows before you commit. Opening a market is permissionless and happens lazily on the first bet.
3. Cancel any bet for a full refund before kickoff.
4. Watch the match. Simulations stream the recorded feed to full time; real fixtures stream live scores, stats and prices.
5. Resolve. Anyone submits the TxLINE score proof; the contract CPIs txoracle.validate_stat_v2, verifies the Merkle proof against the on chain daily scores root, and settles to the proven outcome. If the proof does not verify, nothing settles.
6. Claim. Winners take their pro rata share of the whole SOL pool. Payout equals stake times total divided by the winning pool. A void market refunds every stake.
7. History. Every action is keyed to your wallet, stored locally and mirrored to Supabase when configured, so it follows you across devices.

The killer property: an unprivileged wallet resolves the market, and no instruction anywhere lets the creator (or anyone) void a result, redirect funds, or settle to the wrong side. The proof is the only authority.

## How TxLINE powers it

TxODDS publishes a daily Merkle root of all canonicalised score data into an on chain PDA on its Solana program. A three level Merkle hierarchy (batch, fixture score event, individual stat) lets anyone prove a single fact, such as the home team's finalised goal count, against that root with no external oracle.

The resolve instruction:

1. Rebuilds the canonical outcome predicate itself (home score minus away score compared to zero) so a caller cannot claim an outcome different from what they prove.
2. Binds the proof to this market's fixture and requires the home and away goal stats to come from the same period snapshot, so an in play mix cannot settle it.
3. Verifies the supplied daily scores roots account is the genuine TxODDS PDA for the proof's UTC day (correct seeds, owned by the TxLINE program).
4. CPIs txoracle.validate_stat_v2, which returns true only if the Merkle proof verifies against the on chain root and the predicate holds.

TxLINE devnet oracle program: 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J

## Architecture

```
programs/worldcup-market/src/lib.rs   # Anchor settlement program (native SOL escrow)
  init_market(fixture_id, closes_at, host)  # open a parimutuel market (permissionless)
  place_bet(outcome, amount)                # stake SOL into the market PDA
  cancel_bet(outcome)                       # refund a stake before close or resolve
  resolve(claimed_outcome, payload)         # CPI to txoracle.validate_stat_v2, settle by proof
  claim()                                   # winner withdraws pro rata SOL; void refunds

scripts/txline.ts            # TxLINE auth (subscribe and activate), proof fetch, PDA derivation
scripts/fetch-fixtures.ts    # pull real fixtures into app/public/fixtures.json
scripts/capture-proof.ts     # fetch a finalised proof for a fixture
scripts/live-relay.ts        # mirror the authenticated TxODDS score and odds streams for the UI
scripts/promote-finished.ts  # promote finished real fixtures into playable simulations
scripts/seed-markets.ts      # seed counterparty liquidity proportional to consensus odds
scripts/demo.ts              # end to end: two bettors stake, resolve via real proof, claim
build_feed.py                # downsample a fixture's real odds and scores into a replay feed
app/                         # frontend (landing, markets, market detail, history)
```

## Escrow model

The market PDA is the escrow. place_bet moves lamports from bettor to market with a plain System transfer; claim moves lamports from the program owned market account to the winner. Only staked lamports ever move, the rent exempt reserve is untouched, and the sum of all payouts equals the total pool exactly. No SPL token, no mint, no vault.

## Design and security notes

1. No admin key. No instruction can void, cancel or force a result. Resolution is permissionless and gated solely by a valid proof.
2. Deterministic settlement. The winning predicate is derived on chain from the claimed outcome; the CPI is pure verification against the anchored root.
3. Same period binding on the goal stats prevents settling on a mixed in play snapshot.
4. Root account binding: the daily scores roots account is checked against the derived TxODDS PDA and program ownership, so a look alike root cannot pass.
5. Real markets close at kickoff on chain. In play parimutuel bets would be free money once the score is known, so the pool locks when the match starts.
6. Checks effects interactions on claim (the position is marked claimed before the transfer); checked arithmetic throughout; the parimutuel payout uses u128 intermediates.
7. The TxL credit token is used only for TxLINE data auth; all wagering value is native SOL.

## Environment

Copy app/.env.example to app/.env and fill in:

```
VITE_REOWN_PROJECT_ID    # Reown or WalletConnect project id
VITE_RPC_URL             # Solana devnet RPC (a Helius devnet URL is recommended)
VITE_SUPABASE_URL        # optional, enables cross device history
VITE_SUPABASE_ANON_KEY   # optional, public anon key guarded by RLS
```

History works with zero setup (stored per wallet in localStorage). Supabase is optional and layers cross device persistence on top.

## Run it

```bash
# program: built with platform-tools v1.52; the IDL is assembled by scripts/merge_idl.py
cargo-build-sbf --tools-version v1.52
solana program deploy target/deploy/worldcup_market.so \
  --program-id target/deploy/worldcup_market-keypair.json

# populate fixtures from real World Cup data
npx ts-node scripts/fetch-fixtures.ts

# capture real proofs and build per fixture replay feeds
bash capture-matchday.sh
python3 rebuild_matchday.py

# frontend
cd app && pnpm install && pnpm dev

# optional full end to end on chain demo for one fixture
FIXTURE_ID=18257865 npx ts-node scripts/demo.ts
```

## Deployed (devnet)

Settlement program: 4jVqmpAD67c1153GvJv82R9bghvtwegDQ76v4LvT8M8U

TxLINE oracle (CPI settlement target): 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J

Verified on devnet: settle by proof (real TxLINE Merkle proof, validate_stat_v2 CPI, market resolves to the proven outcome, winner takes a pro rata share of the pool) and cancel_bet (stake cancelled and refunded in full, position zeroed) both confirmed on the deployed program.

## Feedback on the TxLINE API

Loved the single normalised JSON schema, and the headline feature: the on chain daily Merkle root plus the validate_stat_v2 CPI. It is a genuinely trustless settlement primitive; this program settles real SOL with no external oracle in the loop.

Friction points. First, the free tier subscribe and token activate sequence took a bit to piece together from the examples. Second, the finalised score seq to prove was not obvious: the highest Seq in the score updates can be a non score status event that stat validation rejects, so you want the highest score event. Third, the stat validation proof's numeric fields serialise to hex via BN.toJSON, which is easy to trip over when rebuilding the payload for the on chain call.

Built for the TxODDS and Superteam World Cup hackathon by cdev28 ([cdev28.com](https://cdev28.com)).
