use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    /// Aceita apostas até a deadline; "Locked" é derivado (now >= deadline).
    Open,
    /// Outcome gravado; claims liberados.
    Settled,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// FixtureId do TxLINE (seed do PDA).
    pub match_id: u64,
    /// Única signer autorizada a settle.
    pub authority: Pubkey,
    /// Kickoff (unix ts, s). Apostas rejeitadas a partir daqui.
    pub deadline: i64,
    pub status: MarketStatus,
    /// Some(true) = SIM venceu. None até o settle.
    pub outcome: Option<bool>,
    pub pool_sim: u64,
    pub pool_nao: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub bettor: Pubkey,
    pub market: Pubkey,
    /// true = SIM. Um apostador não troca de lado; aposta repetida soma stake.
    pub side: bool,
    pub stake: u64,
    pub claimed: bool,
    pub bump: u8,
}
