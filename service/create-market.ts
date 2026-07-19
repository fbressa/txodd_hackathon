// Cria um mercado para uma fixture real: deadline = kickoff do feed TxLINE.
// Uso: npx tsx create-market.ts --fixture 18257865
import { Connection } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { createMarketIx, loadAuthorityKeypair, marketPda, sendIx, RPC_URL } from "./program";

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--fixture");
  const fixtureId = i >= 0 ? Number(args[i + 1]) : NaN;
  if (!fixtureId) throw new Error("uso: tsx create-market.ts --fixture <id>");

  const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "app", "src", "fixtures.json"), "utf-8")
  );
  const fx = fixtures[String(fixtureId)];
  if (!fx) throw new Error(`fixture ${fixtureId} não está em app/src/fixtures.json — rode export-fixtures.ts`);

  const deadline = BigInt(Math.floor(fx.kickoff / 1000));
  if (deadline <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error(`kickoff de ${fx.home} x ${fx.away} já passou — mercado não faria sentido`);
  }

  const authority = loadAuthorityKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const matchId = BigInt(fixtureId);
  console.log(`${fx.home} x ${fx.away} (${fx.competition}) | kickoff ${new Date(fx.kickoff).toISOString()}`);
  console.log(`market ${marketPda(matchId).toBase58()}`);
  const sig = await sendIx(connection, authority, createMarketIx(authority.publicKey, matchId, deadline));
  console.log(`create_market ok: ${sig}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
