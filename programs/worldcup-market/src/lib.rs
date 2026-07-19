//! World Cup parimutuel prediction market with trustless, oracle-free settlement.
//!
//! Bettors stake native SOL on the outcome of a fixture (Home / Draw / Away). When the match is
//! over, ANYONE can permissionlessly `resolve` the market by submitting a TxLINE (TxODDS) Merkle
//! proof of the final score. This program CPIs into the TxLINE oracle program's `validate_stat_v2`
//! instruction, which verifies that proof against the daily scores Merkle root TxODDS publishes
//! on-chain. There is no admin key, no trusted resolver, and no external oracle: the cryptographic
//! proof of the real match result is the only authority that can settle the market. Winners then
//! claim their pro-rata share of the whole pool.
//!
//! Escrow is the market PDA itself: `place_bet` moves lamports bettor -> market (a System
//! transfer), and `claim` moves lamports market -> winner (a direct debit, since the program owns
//! the market account). The market's own rent-exempt reserve is never touched — only the staked
//! lamports on top of it, which sum exactly to `total_pool`.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("4jVqmpAD67c1153GvJv82R9bghvtwegDQ76v4LvT8M8U");

// Generates a typed CPI client + argument types for the TxODDS TxLINE oracle program
// from `idls/txoracle.json`. Program id is taken from that IDL (devnet: 6pW6...P2J).
declare_program!(txoracle);
use txoracle::cpi::accounts::ValidateStatV2;
use txoracle::types::{
    BinaryExpression, Comparison, NDimensionalStrategy, StatPredicate, StatValidationInput,
    TraderPredicate,
};

/// TxLINE score-stat key for the home team's goals ("Participant1_Score").
const STAT_KEY_HOME: u32 = 1;
/// TxLINE score-stat key for the away team's goals ("Participant2_Score").
const STAT_KEY_AWAY: u32 = 2;
/// Milliseconds per day — TxLINE buckets its daily Merkle roots by `floor(ts_ms / MS_PER_DAY)`.
const MS_PER_DAY: i64 = 86_400_000;

/// Outcome encoding shared by clients and the resolution predicate.
pub const HOME: u8 = 0;
pub const DRAW: u8 = 1;
pub const AWAY: u8 = 2;

#[program]
pub mod worldcup_market {
    use super::*;

    /// Open a parimutuel market for a fixture. Permissionless — anyone can create one.
    /// `closes_at` is a unix timestamp (seconds) after which betting stops (e.g. kickoff).
    /// `host` scopes the market: `Pubkey::default()` is THE shared market for a fixture (real,
    /// live events — one global pool), while a wallet pubkey creates that wallet's private
    /// sandbox for a simulation replay, so every player can run the same fixture independently.
    pub fn init_market(
        ctx: Context<InitMarket>,
        fixture_id: i64,
        closes_at: i64,
        host: Pubkey,
    ) -> Result<()> {
        let m = &mut ctx.accounts.market;
        m.fixture_id = fixture_id;
        m.host = host;
        m.pools = [0u64; 3];
        m.total_pool = 0;
        m.closes_at = closes_at;
        m.creator = ctx.accounts.creator.key();
        m.resolved = false;
        m.winning_outcome = 0;
        m.bump = ctx.bumps.market;
        emit!(MarketOpened {
            market: m.key(),
            fixture_id,
            host,
            closes_at,
        });
        Ok(())
    }

    /// Stake `amount` lamports of SOL on `outcome` (0=Home, 1=Draw, 2=Away). Before close only.
    pub fn place_bet(ctx: Context<PlaceBet>, outcome: u8, amount: u64) -> Result<()> {
        require!(outcome < 3, MarketError::InvalidOutcome);
        require!(amount > 0, MarketError::ZeroAmount);

        let now = Clock::get()?.unix_timestamp;
        {
            let m = &ctx.accounts.market;
            require!(!m.resolved, MarketError::MarketResolved);
            require!(now < m.closes_at, MarketError::BettingClosed);
        }

        // Pull the stake into the market PDA (bettor signs a plain System transfer). The staked
        // lamports sit on top of the market's rent reserve and are paid back out in `claim`.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.bettor.to_account_info(),
                    to: ctx.accounts.market.to_account_info(),
                },
            ),
            amount,
        )?;

        let idx = outcome as usize;
        let m = &mut ctx.accounts.market;
        m.pools[idx] = m.pools[idx]
            .checked_add(amount)
            .ok_or(MarketError::Overflow)?;
        m.total_pool = m
            .total_pool
            .checked_add(amount)
            .ok_or(MarketError::Overflow)?;

        let p = &mut ctx.accounts.position;
        p.market = m.key();
        p.owner = ctx.accounts.bettor.key();
        p.amounts[idx] = p.amounts[idx]
            .checked_add(amount)
            .ok_or(MarketError::Overflow)?;

        emit!(BetPlaced {
            market: m.key(),
            bettor: p.owner,
            outcome,
            amount,
        });
        Ok(())
    }

    /// Cancel a stake on `outcome` and get the SOL refunded — allowed only while the market is
    /// still open (before close) and unresolved. Removes the stake from the pools and the caller's
    /// position, then returns the lamports from the market PDA to the bettor.
    pub fn cancel_bet(ctx: Context<CancelBet>, outcome: u8) -> Result<()> {
        require!(outcome < 3, MarketError::InvalidOutcome);
        let now = Clock::get()?.unix_timestamp;
        require!(!ctx.accounts.market.resolved, MarketError::MarketResolved);
        require!(now < ctx.accounts.market.closes_at, MarketError::BettingClosed);

        let idx = outcome as usize;
        let amount = ctx.accounts.position.amounts[idx];
        require!(amount > 0, MarketError::NothingToCancel);
        let owner = ctx.accounts.position.owner;

        // Effects: remove the stake from the position and the pools.
        ctx.accounts.position.amounts[idx] = 0;
        ctx.accounts.market.pools[idx] = ctx.accounts.market.pools[idx]
            .checked_sub(amount)
            .ok_or(MarketError::Overflow)?;
        ctx.accounts.market.total_pool = ctx.accounts.market.total_pool
            .checked_sub(amount)
            .ok_or(MarketError::Overflow)?;

        // Interaction: refund the staked lamports from the market PDA back to the bettor.
        **ctx.accounts.market.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(BetCancelled {
            market: ctx.accounts.market.key(),
            bettor: owner,
            outcome,
            amount,
        });
        Ok(())
    }

    /// Permissionlessly settle the market by PROVING the final result on-chain.
    ///
    /// The caller supplies the TxLINE score-validation `payload` (Merkle proofs for the home and
    /// away goals of the finalised match) and the outcome they claim. This program:
    ///   1. binds the proof to this market's fixture and to a full-time (finalised) score record;
    ///   2. checks the supplied `daily_scores_merkle_roots` account is the genuine TxODDS PDA;
    ///   3. builds the canonical `home - away {>,=,<} 0` predicate for the claimed outcome itself
    ///      (so a caller cannot claim an outcome different from what they prove); and
    ///   4. CPIs `txoracle::validate_stat_v2`, which returns true only if the proof verifies
    ///      against the on-chain root AND the predicate holds.
    /// No admin, no oracle: a valid proof is the sole authority.
    pub fn resolve(
        ctx: Context<Resolve>,
        claimed_outcome: u8,
        payload: StatValidationInput,
    ) -> Result<()> {
        require!(claimed_outcome < 3, MarketError::InvalidOutcome);

        {
            let m = &ctx.accounts.market;
            require!(!m.resolved, MarketError::MarketResolved);
            // Bind proof -> this market's fixture.
            require!(
                payload.fixture_summary.fixture_id == m.fixture_id,
                MarketError::FixtureMismatch
            );
        }

        // The proof must carry the home (key 1) and away (key 2) TOTAL-goals stats, both from the
        // SAME match-period snapshot — so an in-play home score can't be mixed with a different-phase
        // away score. Resolvers submit the finalised (full-time) score-update event; the score values
        // are Merkle-verified against the on-chain root by the CPI below.
        require!(payload.stats.len() >= 2, MarketError::MalformedProof);
        require!(
            payload.stats[0].stat.key == STAT_KEY_HOME
                && payload.stats[1].stat.key == STAT_KEY_AWAY,
            MarketError::MalformedProof
        );
        require!(
            payload.stats[0].stat.period == payload.stats[1].stat.period,
            MarketError::NotFinalised
        );

        // The daily-roots account must be the genuine TxODDS PDA for this proof's UTC day,
        // and must be owned by the TxLINE program (not a look-alike an attacker controls).
        let epoch_day = payload
            .ts
            .checked_div(MS_PER_DAY)
            .ok_or(MarketError::MalformedProof)?;
        require!(
            (0..=u16::MAX as i64).contains(&epoch_day),
            MarketError::MalformedProof
        );
        let seed = (epoch_day as u16).to_le_bytes();
        let (expected_root, _) =
            Pubkey::find_program_address(&[b"daily_scores_roots", &seed], &txoracle::ID);
        let root_ai = ctx.accounts.daily_scores_merkle_roots.to_account_info();
        require_keys_eq!(root_ai.key(), expected_root, MarketError::WrongRootAccount);
        require_keys_eq!(*root_ai.owner, txoracle::ID, MarketError::WrongRootAccount);

        // Canonical predicate for the claimed outcome, built by us (not trusted from the caller).
        let strategy = strategy_for(claimed_outcome)?;

        // CPI: TxLINE verifies the Merkle proof against its on-chain root and evaluates the predicate.
        let cpi = CpiContext::new(
            ctx.accounts.txoracle_program.to_account_info(),
            ValidateStatV2 {
                daily_scores_merkle_roots: root_ai,
            },
        );
        let verified = txoracle::cpi::validate_stat_v2(cpi, payload, strategy)?;
        require!(verified.get(), MarketError::ProofRejected);

        let m = &mut ctx.accounts.market;
        m.resolved = true;
        m.winning_outcome = claimed_outcome;
        emit!(MarketResolved {
            market: m.key(),
            fixture_id: m.fixture_id,
            outcome: claimed_outcome,
        });
        Ok(())
    }

    /// Claim winnings after resolution. A winner receives their pro-rata share of the ENTIRE pool
    /// (their stake back plus a slice of the losing pools). If nobody backed the winning outcome,
    /// the market is void and every stake is refunded.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        require!(ctx.accounts.market.resolved, MarketError::NotResolved);

        let p = &mut ctx.accounts.position;
        require!(!p.claimed, MarketError::AlreadyClaimed);

        let win = ctx.accounts.market.winning_outcome as usize;
        let winning_pool = ctx.accounts.market.pools[win];
        let total_pool = ctx.accounts.market.total_pool;
        let staked_on_winner = p.amounts[win];
        let owner_key = p.owner;

        let payout: u64 = if winning_pool == 0 {
            // Void: no correct predictions — refund all of this position's stakes.
            p.amounts[0]
                .checked_add(p.amounts[1])
                .and_then(|x| x.checked_add(p.amounts[2]))
                .ok_or(MarketError::Overflow)?
        } else {
            // payout = stake_on_winner * total_pool / winning_pool  (whole pool split pro-rata).
            (((staked_on_winner as u128) * (total_pool as u128)) / (winning_pool as u128)) as u64
        };

        // Effects before interaction.
        p.claimed = true;

        if payout > 0 {
            // The program owns the market account, so it may debit its lamports directly. Only the
            // staked lamports are ever moved; the rent-exempt reserve backing the account remains.
            **ctx
                .accounts
                .market
                .to_account_info()
                .try_borrow_mut_lamports()? -= payout;
            **ctx
                .accounts
                .owner
                .to_account_info()
                .try_borrow_mut_lamports()? += payout;
        }

        emit!(Claimed {
            market: ctx.accounts.market.key(),
            owner: owner_key,
            amount: payout,
        });
        Ok(())
    }
}

/// Build the canonical N-dimensional strategy that TxLINE evaluates: `home(idx0) - away(idx1)`
/// compared against 0. GreaterThan => Home win, EqualTo => Draw, LessThan => Away win.
fn strategy_for(outcome: u8) -> Result<NDimensionalStrategy> {
    let comparison = match outcome {
        HOME => Comparison::GreaterThan,
        DRAW => Comparison::EqualTo,
        AWAY => Comparison::LessThan,
        _ => return err!(MarketError::InvalidOutcome),
    };
    Ok(NDimensionalStrategy {
        geometric_targets: vec![],
        distance_predicate: None,
        discrete_predicates: vec![StatPredicate::Binary {
            index_a: 0,
            index_b: 1,
            op: BinaryExpression::Subtract,
            predicate: TraderPredicate {
                threshold: 0,
                comparison,
            },
        }],
    })
}

#[derive(Accounts)]
#[instruction(fixture_id: i64, closes_at: i64, host: Pubkey)]
pub struct InitMarket<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", fixture_id.to_le_bytes().as_ref(), host.as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(
        mut,
        seeds = [b"market", market.fixture_id.to_le_bytes().as_ref(), market.host.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), bettor.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub bettor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelBet<'info> {
    #[account(
        mut,
        seeds = [b"market", market.fixture_id.to_le_bytes().as_ref(), market.host.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()],
        bump,
        has_one = owner @ MarketError::Unauthorized,
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Resolve<'info> {
    #[account(
        mut,
        seeds = [b"market", market.fixture_id.to_le_bytes().as_ref(), market.host.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// CHECK: verified in the handler to be the genuine TxODDS `daily_scores_roots` PDA for the
    /// proof's epoch day and owned by the TxLINE program; then passed straight into the CPI.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,

    /// CHECK: must be the TxLINE oracle program; enforced by the address constraint.
    #[account(address = txoracle::ID)]
    pub txoracle_program: UncheckedAccount<'info>,

    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        mut,
        seeds = [b"market", market.fixture_id.to_le_bytes().as_ref(), market.host.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()],
        bump,
        has_one = owner @ MarketError::Unauthorized,
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// TxLINE fixture id this market settles on.
    pub fixture_id: i64,
    /// Market scope: `Pubkey::default()` = the shared global market for this fixture (real events);
    /// any wallet pubkey = that wallet's private simulation sandbox.
    pub host: Pubkey,
    /// Staked totals (lamports) per outcome [Home, Draw, Away].
    pub pools: [u64; 3],
    /// Sum of all pools (lamports).
    pub total_pool: u64,
    /// Unix seconds after which betting is closed.
    pub closes_at: i64,
    /// Creator (informational; holds no special powers).
    pub creator: Pubkey,
    pub resolved: bool,
    /// Winning outcome once resolved (0/1/2).
    pub winning_outcome: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    pub owner: Pubkey,
    /// This position's stake (lamports) per outcome [Home, Draw, Away].
    pub amounts: [u64; 3],
    pub claimed: bool,
}

#[event]
pub struct MarketOpened {
    pub market: Pubkey,
    pub fixture_id: i64,
    /// Default pubkey = shared market; otherwise the sandbox owner's wallet.
    pub host: Pubkey,
    pub closes_at: i64,
}

#[event]
pub struct BetPlaced {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub outcome: u8,
    pub amount: u64,
}

#[event]
pub struct BetCancelled {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub outcome: u8,
    pub amount: u64,
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub fixture_id: i64,
    pub outcome: u8,
}

#[event]
pub struct Claimed {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum MarketError {
    #[msg("Outcome must be 0 (Home), 1 (Draw) or 2 (Away)")]
    InvalidOutcome,
    #[msg("Stake amount must be greater than zero")]
    ZeroAmount,
    #[msg("No stake on that outcome to cancel")]
    NothingToCancel,
    #[msg("Market already resolved")]
    MarketResolved,
    #[msg("Betting is closed for this market")]
    BettingClosed,
    #[msg("Market is not resolved yet")]
    NotResolved,
    #[msg("Winnings already claimed")]
    AlreadyClaimed,
    #[msg("Proof is for a different fixture than this market")]
    FixtureMismatch,
    #[msg("Proof is missing the required home/away score stats")]
    MalformedProof,
    #[msg("Score record is not a finalised (full-time) result")]
    NotFinalised,
    #[msg("Supplied scores-root account is not the genuine TxODDS PDA")]
    WrongRootAccount,
    #[msg("TxLINE proof did not verify for the claimed outcome")]
    ProofRejected,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Signer is not the position owner")]
    Unauthorized,
}
