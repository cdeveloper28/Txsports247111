# How Txsports works

A plain walkthrough of every moving part: what each technology is used for, how data flows through the system, and exactly where the trustlessness comes from.

Made by cdev28. Portfolio: [cdev28.com](https://cdev28.com)

## The one sentence version

Bettors pool native SOL on a match outcome inside a Solana program that nobody controls, and the only thing in the universe that can pay that pool out is a Merkle proof of the real final score, verified on chain against a root that TxODDS anchored before anyone knew the result.

## The stack, and what each piece is for

1. Solana (devnet). The settlement layer. Every market, bet, cancel, resolution and claim is a real transaction. Chosen because settlement needs to be cheap enough that a 0.1 SOL bet is worth placing and fast enough that claiming feels instant.
2. Anchor (Rust). The framework for the settlement program in programs/worldcup-market/src/lib.rs. It owns the escrow, the parimutuel math and the proof verification call. About three hundred lines carry all of the trust.
3. TxLINE and TxODDS. The sports data layer. TxODDS is an institutional sports data provider; TxLINE is its Solana product. It supplies three things: fixture lists and consensus odds (display), live score and odds streams (the in-play experience), and the headline feature, a daily Merkle root of all finalised scores published into an on chain PDA, plus an on chain program (txoracle) that verifies proofs against that root.
4. React, Vite and TypeScript. The frontend in app/. A hash routed single page app: landing page, markets grid, market detail, history.
5. Tailwind CSS. All styling. The design system is a phantom black background, one blue accent, Clash Display for display type, Sora for body text, and a custom SVG pitch illustration language where implied probability is drawn as pitch territory.
6. Solana wallet adapter. Wallet connection (Phantom, Solflare, WalletConnect via Reown). The wallet is also the user's identity; there are no accounts or logins.
7. Helius. The RPC provider the frontend and scripts use to read and write Solana. Any RPC works; Helius is just faster and more reliable than the public endpoint.
8. Supabase (Postgres). A convenience mirror, never a source of truth. Four tables: predictions (per wallet history), trades (all bets, for the ticker), markets (pool snapshots, for the market pulse panel), live_matches (the live relay mirror for deployed sites). If Supabase disappears the product still works; reads fall back to the chain and localStorage.
9. Vercel. Static hosting for the built frontend. The site is a static bundle; there is no backend server in the product at all.
10. Node scripts (ts-node). Operational tooling that runs on the developer machine: fetching fixtures, capturing proofs, relaying live streams, seeding liquidity, promoting finished matches into simulations.

## Data flow, end to end

### Before a matchday

1. scripts/fetch-fixtures.ts pulls the real World Cup fixture list from TxLINE into app/public/fixtures.json. This drives the markets grid: teams, kickoff times, consensus odds.
2. capture-matchday.sh and build_feed.py take finished fixtures and downsample their real recorded score and odds history into app/public/feed-(id).json files. These are the simulation replays.
3. scripts/capture-proof.ts fetches each finished fixture's Merkle score proof from TxLINE into app/public/proof-(id).json. This is the settlement ammunition that ships with the site.
4. scripts/seed-markets.ts stakes counterparty liquidity from the deployer wallet into open markets, split proportional to the consensus odds, so early bettors have someone to win money from. This is ordinary betting through the public instruction, not a privileged house: the seeder can lose exactly like anyone else.

### While a real match runs

1. scripts/live-relay.ts holds authenticated SSE connections to the TxODDS scores and odds streams (the browser cannot, because the streams need auth headers that EventSource cannot send).
2. It mirrors every update into app/public/live-(id).json for local dev, and upserts the same blob into the Supabase live_matches table for the deployed site.
3. The frontend polls that state every six seconds: live score, game phase, minute, match stats and demargined 1X2 prices flow into the market cards, the scoreboard, the win probability chart and the bet panel.

### After full time

1. scripts/promote-finished.ts notices a real fixture has ended, captures its proof, builds its replay feed, and promotes it into the simulation tab so it stays playable forever.
2. Anyone presses the settle button (or runs the instruction themselves) with the fixture's proof. The market resolves. Winners claim.

## The on chain program

Five instructions, one account type each for market and position.

1. init_market(fixture_id, closes_at, host). Opens a parimutuel market. Permissionless; the frontend creates a market lazily on the first bet. The market account is a PDA derived from the fixture id, so there is exactly one canonical shared market per fixture.
2. place_bet(outcome, amount). Transfers lamports from the bettor into the market PDA and records them in the bettor's position. Rejected after closes_at, which is kickoff for real fixtures.
3. cancel_bet(outcome). Full refund of a stake before close or resolution. After kickoff there is no exit; you are in the pool.
4. resolve(claimed_outcome, payload). The heart of the system, described below.
5. claim(). Pays a winner stake times total_pool divided by winning_pool, straight from the market PDA. A position is marked claimed before the transfer (checks effects interactions), so double claims are impossible. If the winning side has no stakes the market is void and every stake is refunded.

The market PDA is the escrow. There is no vault, no token mint, no treasury. The sum of all payouts equals the total pool exactly; the house edge is zero because there is no house.

## How resolve() makes settlement trustless

This is the core of the whole platform. When anyone calls resolve with a claimed outcome and a proof payload, the program:

1. Rebuilds the outcome predicate itself. The caller says "Home won" but the program derives the predicate (home goals minus away goals compared with zero) from that claim. You cannot hand it a valid proof of the real score and lie about what that score means.
2. Binds the proof to this market's fixture id and requires the home and away goal counts to come from the same period snapshot, so a mixed in play snapshot cannot masquerade as full time.
3. Verifies the root account. The daily_scores_roots account passed in must derive to the genuine TxODDS PDA for the proof's UTC day and be owned by the TxLINE program. A lookalike account with a forged root fails this check before any hashing happens.
4. Makes a cross program invocation into txoracle.validate_stat_v2. That program hashes the score leaf up through the supplied sibling hashes and compares the result with the anchored root, then evaluates the predicate. It returns true only if both hold.
5. Settles only on true. On false or on any check failing, the whole transaction reverts and the market stays open. There is no partial state.

The result: settlement has no operator. Not the market creator, not the site, not TxODDS at settlement time, not us. A proof either recomputes the anchored root or it does not.

## Why this is trustless, piece by piece

A trustless system is defined by what it removes. Here is the checklist.

1. No bookmaker. Odds are not set by a house; the live implied odds are literally each pool's share of the total. There is no margin baked into prices and no balance held by an operator. Your counterparty is the other bettors.
2. No custodian. Stakes sit in a program derived account. The program has no instruction that moves funds anywhere except back to the bettor (cancel, void refund) or to winners (claim).
3. No admin key. The program has no authority field, no void instruction, no pause switch, no fee sweep. The upgrade authority is the only theoretical lever, and it is visible on chain; burn it and even that is gone.
4. No oracle committee. Where other prediction markets end with "and then the multisig or the optimistic oracle decides who won", this one ends with a hash computation. The resolver role does not exist; resolution is a permissionless function of public data.
5. No trusted frontend. The site is a convenience. Everything it does (bet, cancel, resolve, claim, read pools) is a public instruction or account read that anyone can perform with the IDL and an RPC. If the site vanished, funds and settlement would be unaffected.
6. No in play information asymmetry. Real markets close at kickoff on chain. In a parimutuel pool a late bettor who already knows the score would be printing free money from everyone else, so the pool locks when the whistle blows. The same logic hides cancel once a match is running.
7. Deterministic history. Every position, payout and settlement links to a transaction signature and the exact proof it was decided by. The receipt is the explorer link, not a database row we could edit.

## The one remaining trust assumption, stated honestly

You trust TxODDS to publish honest Merkle roots of real match results. That is the entire remaining trust surface, and it has three properties that make it a good trade:

1. It is anchored in advance and in public. The root for a day's scores is committed on chain; TxODDS cannot retroactively change a result without contradicting its own published root.
2. It is one commitment for everyone. A corrupt result would have to be baked into the root all consumers share, not whispered to one market.
3. It replaces a much worse assumption. Every alternative (bookmaker, multisig, optimistic oracle) concentrates the same trust in a party with a direct financial stake in the outcome. A data company committing hashes of scores it already sells to the betting industry has its whole business riding on those hashes being right.

## The two market modes

1. Simulation. Finished World Cup matches replayed from their real recorded TxLINE data. You stake, press kick off, and the real score and odds history streams frame by frame to full time; then the market settles with the fixture's real proof. The replay is simulated; the money and the settlement are not.
2. Real and live. Genuinely upcoming fixtures. Bets are open until kickoff, then the market locks and the live relay streams the match; at full time anyone settles with the fresh proof. Finished real fixtures are promoted into simulations so the catalogue grows after every matchday.

## What the frontend shows and where it comes from

1. Markets grid. fixtures.json for teams and consensus odds, on chain market accounts for pool sizes and bettor counts, the live relay for in play prices. The pitch illustration on every card draws implied probability as territory: blue from the home goal, red from the away goal, a ball at the expected result.
2. Market detail. The scoreboard and match tracker (replay frames or live relay), the pool split, a crowd versus consensus comparison, the bet panel with a payout estimate that mirrors the on chain claim math exactly, and the settlement card showing the proof that will decide the market.
3. History. The wallet's ledger (localStorage merged with Supabase), on chain positions with claim buttons, a cumulative profit and loss curve, and a pick split donut.

## Running it yourself

See the README for commands. The short version: deploy the program with Anchor, run fetch-fixtures and the matchday capture scripts, pnpm dev inside app/, and keep live-relay.ts running during real matches. The only secrets involved are an RPC url and optional Supabase keys; the product itself has no server.
