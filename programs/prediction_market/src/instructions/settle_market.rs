use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
        has_one = authority,
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<SettleMarket>, outcome: bool) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(market.status == MarketStatus::Open, ErrorCode::MarketNotOpen);
    let now = Clock::get()?.unix_timestamp;
    require!(now >= market.deadline, ErrorCode::DeadlineNotReached);

    market.outcome = Some(outcome);
    market.status = MarketStatus::Settled;

    Ok(())
}
