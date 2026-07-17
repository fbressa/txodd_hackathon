pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("FwFokFQm1uFrnvrSXKvTATXf2VY8GKnSoUpBrU5WWA85");

#[program]
pub mod prediction_market {
    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, match_id: u64, deadline: i64) -> Result<()> {
        create_market::handler(ctx, match_id, deadline)
    }

    pub fn place_bet(ctx: Context<PlaceBet>, side: bool, amount: u64) -> Result<()> {
        place_bet::handler(ctx, side, amount)
    }

    pub fn settle_market(ctx: Context<SettleMarket>, outcome: bool) -> Result<()> {
        settle_market::handler(ctx, outcome)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        claim::handler(ctx)
    }
}
