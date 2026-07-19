// Acesso on-chain (browser): PDAs, decoders e instruções do prediction_market.
// Discriminators do target/idl/prediction_market.json (anchor build).
import { Buffer } from "buffer";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

export const RPC_URL = "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey("FwFokFQm1uFrnvrSXKvTATXf2VY8GKnSoUpBrU5WWA85");

export const MARKET_DISC = [219, 190, 213, 55, 0, 227, 198, 154];
export const POSITION_DISC = [170, 188, 143, 228, 122, 64, 247, 208];
const DISC_PLACE_BET = Buffer.from([222, 62, 67, 220, 63, 166, 126, 33]);
const DISC_CLAIM = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]);

export interface Market {
  address: PublicKey;
  matchId: bigint;
  authority: PublicKey;
  deadline: number; // unix s
  settled: boolean;
  outcome: boolean | null; // true = SIM (mandante venceu)
  poolSim: bigint;
  poolNao: bigint;
}

export interface Position {
  address: PublicKey;
  bettor: PublicKey;
  market: PublicKey;
  side: boolean;
  stake: bigint;
  claimed: boolean;
}

function hasDisc(data: Uint8Array, disc: number[]): boolean {
  return disc.every((b, i) => data[i] === b);
}

export function decodeMarket(address: PublicKey, data: Uint8Array): Market | null {
  if (!hasDisc(data, MARKET_DISC)) return null;
  const v = new DataView(data.buffer, data.byteOffset);
  let o = 8;
  const matchId = v.getBigUint64(o, true); o += 8;
  const authority = new PublicKey(data.slice(o, o + 32)); o += 32;
  const deadline = Number(v.getBigInt64(o, true)); o += 8;
  const settled = data[o] === 1; o += 1;
  // borsh Option<bool>: 1 byte de tag (None) ou 2 bytes (Some) — tamanho variável
  let outcome: boolean | null = null;
  if (data[o] === 1) { outcome = data[o + 1] === 1; o += 2; } else { o += 1; }
  const poolSim = v.getBigUint64(o, true); o += 8;
  const poolNao = v.getBigUint64(o, true); o += 8;
  return { address, matchId, authority, deadline, settled, outcome, poolSim, poolNao };
}

export function decodePosition(address: PublicKey, data: Uint8Array): Position | null {
  if (!hasDisc(data, POSITION_DISC)) return null;
  const v = new DataView(data.buffer, data.byteOffset);
  let o = 8;
  const bettor = new PublicKey(data.slice(o, o + 32)); o += 32;
  const market = new PublicKey(data.slice(o, o + 32)); o += 32;
  const side = data[o] === 1; o += 1;
  const stake = v.getBigUint64(o, true); o += 8;
  const claimed = data[o] === 1;
  return { address, bettor, market, side, stake, claimed };
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

export function vaultPda(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], PROGRAM_ID)[0];
}

export function positionPda(market: PublicKey, bettor: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), bettor.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function placeBetIx(
  bettor: PublicKey,
  market: PublicKey,
  side: boolean,
  lamports: bigint
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: bettor, isSigner: true, isWritable: true },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: vaultPda(market), isSigner: false, isWritable: true },
      { pubkey: positionPda(market, bettor), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC_PLACE_BET, Buffer.from([side ? 1 : 0]), u64le(lamports)]),
  });
}

export function claimIx(bettor: PublicKey, market: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: bettor, isSigner: true, isWritable: true },
      { pubkey: market, isSigner: false, isWritable: false },
      { pubkey: vaultPda(market), isSigner: false, isWritable: true },
      { pubkey: positionPda(market, bettor), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DISC_CLAIM,
  });
}
