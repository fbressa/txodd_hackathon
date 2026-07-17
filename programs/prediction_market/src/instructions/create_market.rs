use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, match_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateMarket>, match_id: u64, deadline: i64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(deadline > now, ErrorCode::DeadlineInPast);

    let market = &mut ctx.accounts.market;
    market.match_id = match_id;
    market.authority = ctx.accounts.authority.key();
    market.deadline = deadline;
    market.status = MarketStatus::Open;
    market.outcome = None;
    market.pool_sim = 0;
    market.pool_nao = 0;
    market.bump = ctx.bumps.market;
    market.vault_bump = ctx.bumps.vault;

    // Rent-exemption do vault (conta system de 0 bytes): sem esse depósito,
    // o último claim deixaria dust abaixo do mínimo e a tx falharia no rent check.
    let rent_min = Rent::get()?.minimum_balance(0);
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        rent_min,
    )?;

    Ok(())
}
