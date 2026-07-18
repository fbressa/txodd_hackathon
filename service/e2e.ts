// E3.4 — Teste E2E em devnet, determinístico via historical replay:
// create_market → place_bet (SIM e NÃO) → deadline passa → settle via TxLINE
// replay → claim do vencedor → claim do perdedor rejeitado.
//
// Uso: npx tsx e2e.ts [--fixture 18187298] [--match-id <n>]
// (--match-id permite reexecutar: o Market PDA por fixture só pode existir uma vez)
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { detectViaReplay, settleOnChain } from "./settle";
import {
  claimIx,
  createMarketIx,
  loadAuthorityKeypair,
  marketPda,
  placeBetIx,
  sendIx,
  vaultPda,
  RPC_URL,
} from "./program";

const DEADLINE_SECS = 60; // janela de apostas do teste
const BET_SIM = 50_000_000n; // 0.05 SOL
const BET_NAO = 30_000_000n; // 0.03 SOL
const FUNDING_LAMPORTS = 100_000_000; // 0.1 SOL por apostador

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const fixtureId = Number(getArg("--fixture") ?? 18187298);
  const matchId = BigInt(getArg("--match-id") ?? fixtureId);

  const connection = new Connection(RPC_URL, "confirmed");
  const authority = loadAuthorityKeypair();
  const market = marketPda(matchId);
  console.log(`fixture ${fixtureId} | match_id ${matchId} | market ${market.toBase58()}`);

  // 1. create_market com deadline curta (kickoff simulado)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECS);
  let sig = await sendIx(connection, authority, createMarketIx(authority.publicKey, matchId, deadline));
  console.log(`1. create_market ok (deadline +${DEADLINE_SECS}s): ${sig}`);

  // 2. dois apostadores efêmeros, financiados pela carteira principal
  const [alice, bob] = [Keypair.generate(), Keypair.generate()];
  const fundTx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: alice.publicKey, lamports: FUNDING_LAMPORTS }),
    SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: bob.publicKey, lamports: FUNDING_LAMPORTS })
  );
  await sendAndConfirmTransaction(connection, fundTx, [authority]);
  console.log(`2. apostadores financiados: alice ${alice.publicKey.toBase58().slice(0, 8)}… bob ${bob.publicKey.toBase58().slice(0, 8)}…`);

  // 3. apostas: alice SIM (mandante vence), bob NÃO
  sig = await sendIx(connection, alice, placeBetIx(alice.publicKey, matchId, true, BET_SIM));
  console.log(`3a. alice apostou SIM 0.05 SOL: ${sig}`);
  sig = await sendIx(connection, bob, placeBetIx(bob.publicKey, matchId, false, BET_NAO));
  console.log(`3b. bob apostou NÃO 0.03 SOL: ${sig}`);

  // 4. espera a deadline passar (clock on-chain ≈ relógio de parede)
  console.log(`4. aguardando deadline (+${DEADLINE_SECS + 5}s)…`);
  await sleep((DEADLINE_SECS + 5) * 1000);

  // 5. settlement dirigido pelo feed TxLINE (historical replay, determinístico)
  const final = await detectViaReplay(fixtureId);
  const outcome = final.homeWon;
  console.log(`5. placar final ${final.homeGoals}x${final.awayGoals} → outcome ${outcome ? "SIM" : "NÃO"}`);
  sig = await settleOnChain(matchId, outcome);
  console.log(`   settle_market ok: ${sig}`);

  // 6. claims: vencedor recebe o pote; perdedor é rejeitado
  const winner = outcome ? alice : bob;
  const loser = outcome ? bob : alice;
  const vault = vaultPda(market);
  const vaultBefore = await connection.getBalance(vault);
  sig = await sendIx(connection, winner, claimIx(winner.publicKey, matchId));
  const vaultAfter = await connection.getBalance(vault);
  const paid = (vaultBefore - vaultAfter) / LAMPORTS_PER_SOL;
  const expected = Number(BET_SIM + BET_NAO) / LAMPORTS_PER_SOL;
  console.log(`6a. claim do vencedor ok: ${sig}`);
  console.log(`    payout ${paid} SOL (esperado ${expected} SOL) ${paid === expected ? "✓" : "✗ DIVERGIU"}`);
  if (paid !== expected) process.exit(1);

  try {
    await sendIx(connection, loser, claimIx(loser.publicKey, matchId));
    console.error("6b. ERRO: claim do perdedor deveria ter sido rejeitado");
    process.exit(1);
  } catch (err: any) {
    const msg = String(err.transactionLogs ?? err.message ?? err);
    console.log(`6b. claim do perdedor rejeitado ✓ (${msg.includes("NotWinner") ? "NotWinner" : "erro"})`);
  }

  console.log("E2E completo: create → bet → settle via TxLINE replay → claim ✓");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
