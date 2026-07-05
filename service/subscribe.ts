// E1 — Credenciais TxLINE (devnet):
// subscribe on-chain → JWT guest → activate token → GET fixtures.
// Fatos e formatos verificados em docs/txline-notas.md.
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = "https://api.devnet.solana.com";
const API_ORIGIN = "https://txline-dev.txodds.com";
const TXORACLE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_TOKEN_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");

const SERVICE_LEVEL_ID = 1; // Copa + amistosos, delay 60s (free)
const DURATION_WEEKS = 4;
const LEAGUES: number[] = []; // plano standard

const KEYPAIR_PATH = path.join(__dirname, "..", "keypairs", "devnet.json");
const AUTH_CACHE_PATH = path.join(__dirname, ".txline-auth.json");

// discriminator do IDL (service/idl/txoracle.json)
const SUBSCRIBE_DISCRIMINATOR = Buffer.from([254, 28, 191, 138, 156, 179, 183, 53]);

function loadKeypair(): Keypair {
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function getFixtures(jwt: string, apiToken: string): Promise<Response> {
  return fetch(`${API_ORIGIN}/api/fixtures/snapshot`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
  });
}

async function subscribeOnChain(connection: Connection, user: Keypair): Promise<string> {
  const [pricingMatrix] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    TXORACLE_PROGRAM_ID
  );
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    TXORACLE_PROGRAM_ID
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_TOKEN_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    TXL_TOKEN_MINT, user.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // args: service_level_id (u16 LE) + weeks (u8)
  const data = Buffer.alloc(SUBSCRIBE_DISCRIMINATOR.length + 3);
  SUBSCRIBE_DISCRIMINATOR.copy(data, 0);
  data.writeUInt16LE(SERVICE_LEVEL_ID, 8);
  data.writeUInt8(DURATION_WEEKS, 10);

  const ix = new TransactionInstruction({
    programId: TXORACLE_PROGRAM_ID,
    keys: [
      { pubkey: user.publicKey, isSigner: true, isWritable: true },
      { pubkey: pricingMatrix, isSigner: false, isWritable: false },
      { pubkey: TXL_TOKEN_MINT, isSigner: false, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryVault, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  // o programa exige a ATA do usuário já inicializada (AccountNotInitialized 3012)
  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    user.publicKey, userTokenAccount, user.publicKey, TXL_TOKEN_MINT,
    TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return sendAndConfirmTransaction(connection, new Transaction().add(createAtaIx, ix), [user]);
}

async function main() {
  const user = loadKeypair();
  console.log("wallet:", user.publicKey.toBase58());

  // Reusar credenciais se ainda válidas
  if (fs.existsSync(AUTH_CACHE_PATH)) {
    const cached = JSON.parse(fs.readFileSync(AUTH_CACHE_PATH, "utf-8"));
    const res = await getFixtures(cached.jwt, cached.apiToken);
    if (res.ok) {
      console.log("credenciais em cache válidas");
      console.log(JSON.stringify(await res.json(), null, 2));
      return;
    }
    console.log(`cache inválido (HTTP ${res.status}), refazendo fluxo completo`);
  }

  // 1. JWT guest
  const authRes = await fetch(`${API_ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!authRes.ok) throw new Error(`guest/start HTTP ${authRes.status}: ${await authRes.text()}`);
  const { token: jwt } = await authRes.json();
  console.log("jwt guest ok");

  // 2. subscribe on-chain
  const connection = new Connection(RPC_URL, "confirmed");
  const txSig = await subscribeOnChain(connection, user);
  console.log("subscribe tx:", txSig);

  // 3. ativar token: assinar `${txSig}:${leagues}:${jwt}`
  const message = `${txSig}:${LEAGUES.join(",")}:${jwt}`;
  const signature = nacl.sign.detached(Buffer.from(message), user.secretKey);
  const activateRes = await fetch(`${API_ORIGIN}/api/token/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      txSig,
      walletSignature: Buffer.from(signature).toString("base64"),
      leagues: LEAGUES,
    }),
  });
  if (!activateRes.ok) throw new Error(`activate HTTP ${activateRes.status}: ${await activateRes.text()}`);
  // resposta pode ser JSON {token} ou o token em texto puro (ex.: "txoracle_ap...")
  const activateText = await activateRes.text();
  let apiToken: string;
  try {
    apiToken = JSON.parse(activateText).token ?? activateText;
  } catch {
    apiToken = activateText;
  }
  console.log("api token ativado");

  fs.writeFileSync(AUTH_CACHE_PATH, JSON.stringify({ jwt, apiToken }, null, 2));

  // 4. fixtures
  const fixturesRes = await getFixtures(jwt, apiToken);
  if (!fixturesRes.ok) throw new Error(`fixtures HTTP ${fixturesRes.status}: ${await fixturesRes.text()}`);
  console.log(JSON.stringify(await fixturesRes.json(), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
