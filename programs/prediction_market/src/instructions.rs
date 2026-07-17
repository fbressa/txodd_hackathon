pub mod claim;
pub mod create_market;
pub mod place_bet;
pub mod settle_market;

// Globs são necessários: o macro #[program] consome os módulos ocultos
// __client_accounts_* de cada instrução. O warning ambiguous_glob_reexports
// (handler × 4) é benigno — lib.rs chama cada handler pelo caminho do módulo.
pub use claim::*;
pub use create_market::*;
pub use place_bet::*;
pub use settle_market::*;
