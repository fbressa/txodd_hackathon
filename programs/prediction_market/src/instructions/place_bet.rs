use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
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

    #[account(
        init_if_needed,
        payer = bettor,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, market.key().as_ref(), bettor.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PlaceBet>, side: bool, amount: u64) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let position = &mut ctx.accounts.position;

    require!(market.status == MarketStatus::Open, ErrorCode::MarketNotOpen);
    let now = Clock::get()?.unix_timestamp;
    require!(now < market.deadline, ErrorCode::DeadlinePassed);
    require!(amount > 0, ErrorCode::InvalidAmount);

    if position.stake == 0 {
        // Position recém-criada (stake nunca fica 0 depois de uma aposta).
        position.bettor = ctx.accounts.bettor.key();
        position.market = market.key();
        position.side = side;
        position.claimed = false;
        position.bump = ctx.bumps.position;
    } else {
        require!(position.side == side, ErrorCode::SideMismatch);
    }

    position.stake += amount;
    if side {
        market.pool_sim += amount;
    } else {
        market.pool_nao += amount;
    }

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.bettor.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    Ok(())
}
