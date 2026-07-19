# Txsports — 5-minute demo video script

Goal: make the judge lean in at the moment an unprivileged wallet settles a real market from a
cryptographic proof, with no oracle and no admin key.

Keep it to ~4:30. Screen-record the app + a terminal. Have `fixtures/<id>.json` (a real captured
proof) and the program already deployed to devnet before recording.

---

### 0:00–0:35 — The problem (talking head or slide)
- "On-chain prediction markets have one weak point: settlement. Polymarket and every other market
  still trust a resolver — a multisig or an optimistic oracle — to say who won. That's the attack
  surface and the dispute source."
- "And for millions of everyday bettors, the bookmaker itself is the thing they don't trust to pay."
- "Txsports removes both. World Cup prediction pools that settle themselves from a cryptographic
  proof of the real result — anchored on Solana by TxODDS. No bookmaker. No oracle. No admin key."

### 0:35–1:15 — The product (app walkthrough)
- Show the market for a fixture: teams, **live consensus odds + score streaming from TxLINE**.
- "Odds and scores here are the real TxLINE feed" (or "a replay of the TxLINE feed — matches are
  over by judging, so this is captured data"). Point at the pool sizes: Home / Draw / Away.
- Connect wallet. Place a bet: stake USDC on an outcome. Show the pool update + your position.
- Optional: switch wallets, place an opposing bet, so there are winners and losers.

### 1:15–2:15 — The moat: how it settles (this is the core)
- "Here's what's different. When the match is final, settlement isn't a button only we can press."
- Open the **Proof receipt** panel: show the TxLINE `stat-validation` Merkle proof — the home/away
  goals, the proof nodes, the daily-scores root PDA on-chain.
- "TxODDS publishes a daily Merkle root of all score data into a PDA on their Solana program.
  Anyone can prove a single fact — the final score — against that root, with no oracle."

### 2:15–3:30 — The killer moment (permissionless settle)
- In a terminal (or a second 'stranger' wallet in the app), run the resolve as an **unprivileged
  wallet that never created the market**:
  `FIXTURE_ID=<id> ts-node scripts/demo.ts`  (or the app's "Settle" button from a fresh wallet).
- Narrate as it runs: "This wallet calls `resolve`. Our program CPIs into TxLINE's
  `validate_stat_v2`, which verifies the Merkle proof against the on-chain root and checks
  home − away > 0. It returns true — the market settles to the proven outcome."
- Then the punchline: "Watch what I *can't* do." Try to resolve to the wrong outcome → it reverts
  (`ProofRejected`). Show there is **no void/cancel/admin instruction in the program at all**
  (scroll the IDL / instruction list). "The creator cannot rug this. I cannot rug this. Only a
  valid proof of the real result moves the money."

### 3:30–4:15 — Payout
- Winner clicks **Claim** (or the script claims): balance jumps by their pro-rata share of the
  whole pool. Loser claims → gets nothing. "Winners split the entire pool. No house edge."
- Show the settle + claim transactions on Solana Explorer (devnet), and the CPI into the TxLINE
  program inside the resolve tx.

### 4:15–4:45 — Close
- "Txsports: trustless World Cup prediction markets, settled by TxLINE proofs on Solana. No
  bookmaker, no oracle, no admin key. Public repo, deployed on devnet, powered end-to-end by
  TxLINE — the SSE feed for the live experience, and the on-chain Merkle proofs for settlement."

---

## Shot list / must-capture
1. Live odds/score updating in the UI (TxLINE feed).
2. Placing a bet (wallet signature + pool update).
3. The Merkle proof receipt panel.
4. A **stranger wallet** calling resolve successfully.
5. A wrong-outcome resolve **reverting**.
6. The winner's balance increasing on claim.
7. Solana Explorer: the resolve tx showing the CPI into `6pW64…P2J` (TxLINE).
