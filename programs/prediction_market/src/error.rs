use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Betting deadline has passed")]
    DeadlinePassed,
    #[msg("Deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Bet amount must be greater than zero")]
    InvalidAmount,
    #[msg("Position is on the other side; cannot switch sides")]
    SideMismatch,
    #[msg("Market is not settled")]
    MarketNotSettled,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("Position is not on the winning side")]
    NotWinner,
}
