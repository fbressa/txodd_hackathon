// Exporta as fixtures do TxLINE para app/src/fixtures.json (bundlado no
// frontend — o browser não chama a API TxLINE direto para não expor o token).
// Uso: npx tsx export-fixtures.ts
import * as fs from "fs";
import * as path from "path";

const API_ORIGIN = "https://txline-dev.txodds.com";
const AUTH_CACHE_PATH = path.join(__dirname, ".txline-auth.json");
const OUT_PATH = path.join(__dirname, "..", "app", "src", "fixtures.json");

interface Fixture {
  FixtureId: number;
  StartTime: number;
  Competition: string;
  Participant1: string;
  Participant2: string;
  Participant1IsHome: boolean;
}

async function main() {
  const { jwt, apiToken } = JSON.parse(fs.readFileSync(AUTH_CACHE_PATH, "utf-8"));
  const res = await fetch(`${API_ORIGIN}/api/fixtures/snapshot`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
  });
  if (!res.ok) throw new Error(`fixtures HTTP ${res.status}: ${await res.text()}`);
  const fixtures: Fixture[] = await res.json();

  // mapa por FixtureId, mandante primeiro; mescla com o arquivo existente
  // (fixtures passadas saem do snapshot, mas mercados on-chain persistem)
  const out: Record<string, { home: string; away: string; kickoff: number; competition: string }> =
    fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, "utf-8")) : {};
  for (const f of fixtures) {
    out[String(f.FixtureId)] = {
      home: f.Participant1IsHome ? f.Participant1 : f.Participant2,
      away: f.Participant1IsHome ? f.Participant2 : f.Participant1,
      kickoff: f.StartTime,
      competition: f.Competition,
    };
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`${Object.keys(out).length} fixtures → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
