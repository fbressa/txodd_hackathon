// Helpers on-chain do programa prediction_market (devnet).
// Discriminators extraídos de target/idl/prediction_market.json (anchor build).
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

export const RPC_URL = "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey("FwFokFQm1uFrnvrSXKvTATXf2VY8GKnSoUpBrU5WWA85");

const DISC = {
  createMarket: Buffer.from([103, 226, 97, 235, 200, 188, 251, 254]),
  placeBet: Buffer.from([222, 62, 67, 220, 63, 166, 126, 33]),
  settleMarket: Buffer.from([193, 153, 95, 216, 166, 6, 144, 217]),
  claim: Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]),
};

export function loadAuthorityKeypair(): Keypair {
  const p = path.join(__dirname, "..", "keypairs", "devnet.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8"))));
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

export function marketPda(matchId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), u64le(matchId)],
    PROGRAM_ID
  )[0];
}

export function vaultPda(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function positionPda(market: PublicKey, bettor: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), bettor.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function createMarketIx(
  authority: PublicKey,
  matchId: bigint,
  deadline: bigint
): TransactionInstruction {
  const market = marketPda(matchId);
  const data = Buffer.alloc(8);
  data.writeBigInt64LE(deadline);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: vaultPda(market), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC.createMarket, u64le(matchId), data]),
  });
}

export function placeBetIx(
  bettor: PublicKey,
  matchId: bigint,
  side: boolean,
  lamports: bigint
): TransactionInstruction {
  const market = marketPda(matchId);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: bettor, isSigner: true, isWritable: true },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: vaultPda(market), isSigner: false, isWritable: true },
      { pubkey: positionPda(market, bettor), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC.placeBet, Buffer.from([side ? 1 : 0]), u64le(lamports)]),
  });
}

export function settleMarketIx(
  authority: PublicKey,
  matchId: bigint,
  outcome: boolean
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: marketPda(matchId), isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([DISC.settleMarket, Buffer.from([outcome ? 1 : 0])]),
  });
}

export function claimIx(bettor: PublicKey, matchId: bigint): TransactionInstruction {
  const market = marketPda(matchId);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: bettor, isSigner: true, isWritable: true },
      { pubkey: market, isSigner: false, isWritable: false },
      { pubkey: vaultPda(market), isSigner: false, isWritable: true },
      { pubkey: positionPda(market, bettor), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DISC.claim,
  });
}

export async function sendIx(
  connection: Connection,
  payer: Keypair,
  ix: TransactionInstruction
): Promise<string> {
  return sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer]);
}
