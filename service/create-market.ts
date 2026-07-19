// Cria mercados para fixtures reais: deadline = kickoff do feed TxLINE.
// Uso:
//   npx tsx create-market.ts --fixture 18257865   # uma fixture
//   npx tsx create-market.ts --all                # toda fixture futura sem mercado
import { Connection } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { createMarketIx, loadAuthorityKeypair, marketPda, sendIx, RPC_URL } from "./program";

interface FixtureEntry { home: string; away: string; kickoff: number; competition: string }

function loadFixtures(): Record<string, FixtureEntry> {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "app", "src", "fixtures.json"), "utf-8")
  );
}

async function createOne(
  connection: Connection,
  fixtureId: number,
  fx: FixtureEntry
): Promise<void> {
  const matchId = BigInt(fixtureId);
  const market = marketPda(matchId);
  if (await connection.getAccountInfo(market)) {
    console.log(`- ${fx.home} x ${fx.away}: mercado já existe (${market.toBase58()})`);
    return;
  }
  const deadline = BigInt(Math.floor(fx.kickoff / 1000));
  const authority = loadAuthorityKeypair();
  const sig = await sendIx(connection, authority, createMarketIx(authority.publicKey, matchId, deadline));
  console.log(
    `+ ${fx.home} x ${fx.away} (${fx.competition}) | kickoff ${new Date(fx.kickoff).toISOString()}\n  market ${market.toBase58()} | tx ${sig}`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const connection = new Connection(RPC_URL, "confirmed");
  const fixtures = loadFixtures();
  const now = Date.now();

  if (args.includes("--all")) {
    const upcoming = Object.entries(fixtures).filter(([, fx]) => fx.kickoff > now);
    console.log(`${upcoming.length} fixtures futuras no feed`);
    for (const [id, fx] of upcoming) {
      await createOne(connection, Number(id), fx);
    }
    return;
  }

  const i = args.indexOf("--fixture");
  const fixtureId = i >= 0 ? Number(args[i + 1]) : NaN;
  if (!fixtureId) throw new Error("uso: tsx create-market.ts --fixture <id> | --all");
  const fx = fixtures[String(fixtureId)];
  if (!fx) throw new Error(`fixture ${fixtureId} não está em app/src/fixtures.json — rode export-fixtures.ts`);
  if (fx.kickoff <= now) {
    throw new Error(`kickoff de ${fx.home} x ${fx.away} já passou — mercado não faria sentido`);
  }
  await createOne(connection, fixtureId, fx);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
