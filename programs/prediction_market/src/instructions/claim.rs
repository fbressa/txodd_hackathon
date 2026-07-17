use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump = market.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    // Seeds amarram a Position a este market e a este bettor (signer).
    #[account(
        mut,
        seeds = [POSITION_SEED, market.key().as_ref(), bettor.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    let market = &ctx.accounts.market;
    let position = &mut ctx.accounts.position;

    require!(
        market.status == MarketStatus::Settled,
        ErrorCode::MarketNotSettled
    );
    require!(!position.claimed, ErrorCode::AlreadyClaimed);
    let outcome = market.outcome.ok_or(ErrorCode::MarketNotSettled)?;
    require!(position.side == outcome, ErrorCode::NotWinner);

    let pool_total = market.pool_sim + market.pool_nao;
    let pool_winner = if outcome { market.pool_sim } else { market.pool_nao };
    // pool_winner >= position.stake > 0, então sem divisão por zero.
    let payout = (position.stake as u128 * pool_total as u128 / pool_winner as u128) as u64;

    position.claimed = true;

    let market_key = market.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, market_key.as_ref(), &[market.vault_bump]];
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.bettor.to_account_info(),
            },
            &[vault_seeds],
        ),
        payout,
    )?;

    Ok(())
}
