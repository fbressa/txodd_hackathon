use {
    anchor_lang::{
        prelude::Pubkey, solana_program::instruction::Instruction, AccountDeserialize,
        InstructionData, ToAccountMetas,
    },
    litesvm::{types::FailedTransactionMetadata, LiteSVM},
    prediction_market::state::{Market, MarketStatus, Position},
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const MATCH_ID: u64 = 18187298; // Brazil x Norway (fixture real do devnet)
const SOL_TENTH: u64 = 100_000_000;

// ---------- helpers ----------

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/prediction_market.so");
    svm.add_program(prediction_market::id(), bytes).unwrap();
    let authority = Keypair::new();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();
    (svm, authority)
}

fn market_pda(match_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"market", &match_id.to_le_bytes()],
        &prediction_market::id(),
    )
    .0
}

fn vault_pda(market: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", market.as_ref()], &prediction_market::id()).0
}

fn position_pda(market: &Pubkey, bettor: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"position", market.as_ref(), bettor.as_ref()],
        &prediction_market::id(),
    )
    .0
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ix: Instruction,
) -> Result<(), FailedTransactionMetadata> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx).map(|_| ())
}

fn assert_fails_with(res: Result<(), FailedTransactionMetadata>, needle: &str) {
    let meta = res.expect_err("expected transaction to fail");
    assert!(
        meta.meta.logs.iter().any(|l| l.contains(needle)),
        "expected error `{needle}` in logs: {:#?}",
        meta.meta.logs
    );
}

fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<Clock>().unix_timestamp
}

fn warp_to(svm: &mut LiteSVM, ts: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = ts;
    svm.set_sysvar(&clock);
}

fn create_market_ix(authority: &Pubkey, match_id: u64, deadline: i64) -> Instruction {
    let market = market_pda(match_id);
    Instruction::new_with_bytes(
        prediction_market::id(),
        &prediction_market::instruction::CreateMarket { match_id, deadline }.data(),
        prediction_market::accounts::CreateMarket {
            authority: *authority,
            market,
            vault: vault_pda(&market),
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn place_bet_ix(bettor: &Pubkey, match_id: u64, side: bool, amount: u64) -> Instruction {
    let market = market_pda(match_id);
    Instruction::new_with_bytes(
        prediction_market::id(),
        &prediction_market::instruction::PlaceBet { side, amount }.data(),
        prediction_market::accounts::PlaceBet {
            bettor: *bettor,
            market,
            vault: vault_pda(&market),
            position: position_pda(&market, bettor),
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn settle_ix(authority: &Pubkey, match_id: u64, outcome: bool) -> Instruction {
    Instruction::new_with_bytes(
        prediction_market::id(),
        &prediction_market::instruction::SettleMarket { outcome }.data(),
        prediction_market::accounts::SettleMarket {
            authority: *authority,
            market: market_pda(match_id),
        }
        .to_account_metas(None),
    )
}

fn claim_ix(bettor: &Pubkey, match_id: u64) -> Instruction {
    let market = market_pda(match_id);
    Instruction::new_with_bytes(
        prediction_market::id(),
        &prediction_market::instruction::Claim {}.data(),
        prediction_market::accounts::Claim {
            bettor: *bettor,
            market,
            vault: vault_pda(&market),
            position: position_pda(&market, bettor),
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn get_market(svm: &LiteSVM, match_id: u64) -> Market {
    let acc = svm.get_account(&market_pda(match_id)).unwrap();
    Market::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

fn get_position(svm: &LiteSVM, match_id: u64, bettor: &Pubkey) -> Position {
    let acc = svm
        .get_account(&position_pda(&market_pda(match_id), bettor))
        .unwrap();
    Position::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

fn vault_balance(svm: &LiteSVM, match_id: u64) -> u64 {
    svm.get_account(&vault_pda(&market_pda(match_id)))
        .unwrap()
        .lamports
}

fn new_bettor(svm: &mut LiteSVM) -> Keypair {
    let kp = Keypair::new();
    svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
    kp
}

/// Mercado criado com deadline now+1000; retorna a deadline.
fn create_open_market(svm: &mut LiteSVM, authority: &Keypair) -> i64 {
    let deadline = now(svm) + 1000;
    send(svm, authority, create_market_ix(&authority.pubkey(), MATCH_ID, deadline)).unwrap();
    deadline
}

// ---------- fluxo feliz ----------

#[test]
fn test_happy_path() {
    let (mut svm, authority) = setup();
    let deadline = create_open_market(&mut svm, &authority);

    let m = get_market(&svm, MATCH_ID);
    assert_eq!(m.match_id, MATCH_ID);
    assert_eq!(m.authority, authority.pubkey());
    assert_eq!(m.deadline, deadline);
    assert!(m.status == MarketStatus::Open);
    assert_eq!(m.outcome, None);

    // A: SIM 0.3 SOL · B: NÃO 0.2 SOL · C: SIM 0.1 SOL
    let (a, b, c) = (
        new_bettor(&mut svm),
        new_bettor(&mut svm),
        new_bettor(&mut svm),
    );
    send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, true, 3 * SOL_TENTH)).unwrap();
    send(&mut svm, &b, place_bet_ix(&b.pubkey(), MATCH_ID, false, 2 * SOL_TENTH)).unwrap();
    send(&mut svm, &c, place_bet_ix(&c.pubkey(), MATCH_ID, true, SOL_TENTH)).unwrap();

    let m = get_market(&svm, MATCH_ID);
    assert_eq!(m.pool_sim, 4 * SOL_TENTH);
    assert_eq!(m.pool_nao, 2 * SOL_TENTH);

    // Settle SIM após a deadline.
    warp_to(&mut svm, deadline + 10);
    send(&mut svm, &authority, settle_ix(&authority.pubkey(), MATCH_ID, true)).unwrap();
    let m = get_market(&svm, MATCH_ID);
    assert!(m.status == MarketStatus::Settled);
    assert_eq!(m.outcome, Some(true));

    // Payout parimutuel: stake * pool_total / pool_sim.
    // A: 0.3 * 0.6 / 0.4 = 0.45 SOL · C: 0.1 * 0.6 / 0.4 = 0.15 SOL
    let before = vault_balance(&svm, MATCH_ID);
    send(&mut svm, &a, claim_ix(&a.pubkey(), MATCH_ID)).unwrap();
    assert_eq!(before - vault_balance(&svm, MATCH_ID), 45 * SOL_TENTH / 10);
    assert!(get_position(&svm, MATCH_ID, &a.pubkey()).claimed);

    let before = vault_balance(&svm, MATCH_ID);
    send(&mut svm, &c, claim_ix(&c.pubkey(), MATCH_ID)).unwrap();
    assert_eq!(before - vault_balance(&svm, MATCH_ID), 15 * SOL_TENTH / 10);

    // Perdedor não recebe; claim duplo rejeitado.
    assert_fails_with(send(&mut svm, &b, claim_ix(&b.pubkey(), MATCH_ID)), "NotWinner");
    svm.expire_blockhash();
    assert_fails_with(send(&mut svm, &a, claim_ix(&a.pubkey(), MATCH_ID)), "AlreadyClaimed");
}

#[test]
fn test_bet_accumulates_same_side() {
    let (mut svm, authority) = setup();
    create_open_market(&mut svm, &authority);
    let a = new_bettor(&mut svm);
    send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, true, SOL_TENTH)).unwrap();
    send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, true, SOL_TENTH / 2)).unwrap();
    let p = get_position(&svm, MATCH_ID, &a.pubkey());
    assert_eq!(p.stake, SOL_TENTH + SOL_TENTH / 2);
    assert!(p.side);
    assert_eq!(get_market(&svm, MATCH_ID).pool_sim, SOL_TENTH + SOL_TENTH / 2);
}

// ---------- rejeições de segurança ----------

#[test]
fn test_create_market_past_deadline() {
    let (mut svm, authority) = setup();
    let past = now(&svm) - 1;
    let res = send(&mut svm, &authority, create_market_ix(&authority.pubkey(), MATCH_ID, past));
    assert_fails_with(res, "DeadlineInPast");
}

#[test]
fn test_create_market_duplicate() {
    let (mut svm, authority) = setup();
    create_open_market(&mut svm, &authority);
    let deadline = now(&svm) + 2000;
    let res = send(&mut svm, &authority, create_market_ix(&authority.pubkey(), MATCH_ID, deadline));
    assert!(res.is_err(), "duplicate market PDA must fail");
}

#[test]
fn test_bet_side_switch_rejected() {
    let (mut svm, authority) = setup();
    create_open_market(&mut svm, &authority);
    let a = new_bettor(&mut svm);
    send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, true, SOL_TENTH)).unwrap();
    let res = send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, false, SOL_TENTH));
    assert_fails_with(res, "SideMismatch");
}

#[test]
fn test_bet_zero_amount() {
    let (mut svm, authority) = setup();
    create_open_market(&mut svm, &authority);
    let a = new_bettor(&mut svm);
    let res = send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, true, 0));
    assert_fails_with(res, "InvalidAmount");
}

#[test]
fn test_bet_after_deadline() {
    let (mut svm, authority) = setup();
    let deadline = create_open_market(&mut svm, &authority);
    warp_to(&mut svm, deadline);
    let a = new_bettor(&mut svm);
    let res = send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, true, SOL_TENTH));
    assert_fails_with(res, "DeadlinePassed");
}

#[test]
fn test_settle_wrong_authority() {
    let (mut svm, authority) = setup();
    let deadline = create_open_market(&mut svm, &authority);
    warp_to(&mut svm, deadline + 10);
    let mallory = new_bettor(&mut svm);
    let res = send(&mut svm, &mallory, settle_ix(&mallory.pubkey(), MATCH_ID, true));
    assert_fails_with(res, "ConstraintHasOne");
}

#[test]
fn test_settle_before_deadline() {
    let (mut svm, authority) = setup();
    create_open_market(&mut svm, &authority);
    let res = send(&mut svm, &authority, settle_ix(&authority.pubkey(), MATCH_ID, true));
    assert_fails_with(res, "DeadlineNotReached");
}

#[test]
fn test_settle_twice() {
    let (mut svm, authority) = setup();
    let deadline = create_open_market(&mut svm, &authority);
    warp_to(&mut svm, deadline + 10);
    send(&mut svm, &authority, settle_ix(&authority.pubkey(), MATCH_ID, true)).unwrap();
    let res = send(&mut svm, &authority, settle_ix(&authority.pubkey(), MATCH_ID, false));
    assert_fails_with(res, "MarketNotOpen");
}

#[test]
fn test_bet_after_settle() {
    let (mut svm, authority) = setup();
    let deadline = create_open_market(&mut svm, &authority);
    let a = new_bettor(&mut svm);
    send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, true, SOL_TENTH)).unwrap();
    warp_to(&mut svm, deadline + 10);
    send(&mut svm, &authority, settle_ix(&authority.pubkey(), MATCH_ID, true)).unwrap();
    let res = send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, true, 2 * SOL_TENTH));
    assert_fails_with(res, "MarketNotOpen");
}

#[test]
fn test_claim_before_settle() {
    let (mut svm, authority) = setup();
    create_open_market(&mut svm, &authority);
    let a = new_bettor(&mut svm);
    send(&mut svm, &a, place_bet_ix(&a.pubkey(), MATCH_ID, true, SOL_TENTH)).unwrap();
    let res = send(&mut svm, &a, claim_ix(&a.pubkey(), MATCH_ID));
    assert_fails_with(res, "MarketNotSettled");
}
