// E3.2/E3.3 — Settlement: detecta fim de partida no feed TxLINE e chama
// settle_market. SIM (outcome=true) = mandante venceu; empate = NÃO.
//
// Uso:
//   npx tsx settle.ts --fixture 18187298            # live: poll snapshot 60s
//   npx tsx settle.ts --fixture 18187298 --replay   # historical replay (fatias 5min)
//   [--market <matchId>]  seed do Market PDA, default = fixture id
import { Connection } from "@solana/web3.js";
import {
  findFinalResult,
  scoresReplaySlice,
  scoresSnapshot,
  FinalResult,
} from "./txline";
import { loadAuthorityKeypair, marketPda, sendIx, settleMarketIx, RPC_URL } from "./program";

const POLL_MS = 60_000; // SL 1 tem delay de 60s — poll mais rápido não ajuda
const MAX_SLICES = 48; // replay: 4h de jogo no máximo

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replay determinístico: varre fatias de 5min a partir do kickoff. */
export async function detectViaReplay(fixtureId: number): Promise<FinalResult> {
  const snapshot = await scoresSnapshot(fixtureId);
  if (snapshot.length === 0) throw new Error(`fixture ${fixtureId}: sem eventos no feed`);
  const startSec = Math.floor(snapshot[0].StartTime / 1000);
  const epochDay = Math.floor(startSec / 86400);
  const hourOfDay = Math.floor((startSec % 86400) / 3600);

  for (let slice = 0; slice < MAX_SLICES; slice++) {
    const events = await scoresReplaySlice(epochDay, hourOfDay, slice);
    const minute = slice * 5;
    console.log(`[replay] fatia ${slice} (+${minute}min): ${events.length} eventos`);
    const final = findFinalResult(events, fixtureId);
    if (final) return final;
  }
  throw new Error(`fixture ${fixtureId}: game_finalised não encontrado em ${MAX_SLICES} fatias`);
}

/** Live: poll do snapshot até aparecer game_finalised. */
export async function detectViaPolling(fixtureId: number): Promise<FinalResult> {
  for (;;) {
    const events = await scoresSnapshot(fixtureId);
    const final = findFinalResult(events, fixtureId);
    if (final) return final;
    console.log(`[poll] fixture ${fixtureId}: partida ainda não finalizada, aguardando ${POLL_MS / 1000}s`);
    await sleep(POLL_MS);
  }
}

export async function settleOnChain(matchId: bigint, outcome: boolean): Promise<string> {
  const authority = loadAuthorityKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const sig = await sendIx(connection, authority, settleMarketIx(authority.publicKey, matchId, outcome));
  return sig;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const fixtureId = Number(getArg("--fixture"));
  if (!fixtureId) throw new Error("uso: tsx settle.ts --fixture <id> [--market <matchId>] [--replay]");
  const matchId = BigInt(getArg("--market") ?? fixtureId);
  const replay = args.includes("--replay");

  console.log(`fixture ${fixtureId} → market ${marketPda(matchId).toBase58()} (match_id ${matchId})`);
  const final = replay ? await detectViaReplay(fixtureId) : await detectViaPolling(fixtureId);
  const outcome = final.homeWon;
  console.log(
    `placar final ${final.homeGoals}x${final.awayGoals} → outcome ${outcome ? "SIM" : "NÃO"} (mandante ${final.homeWon ? "venceu" : "não venceu"})`
  );

  const sig = await settleOnChain(matchId, outcome);
  console.log(`settle_market ok: ${sig}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
