// E3.1 — Cliente TxLINE (dados): reusa as credenciais do E1 (.txline-auth.json,
// geradas por `npm run subscribe`). Formatos verificados em docs/txline-notas.md.
import * as fs from "fs";
import * as path from "path";

const API_ORIGIN = "https://txline-dev.txodds.com";
const AUTH_CACHE_PATH = path.join(__dirname, ".txline-auth.json");

export interface ScoreEvent {
  FixtureId: number;
  StartTime: number; // kickoff (ms)
  Action: string;
  StatusId?: number;
  Participant1IsHome: boolean;
  Ts: number;
  Score?: {
    Participant1?: { Total?: { Goals?: number } };
    Participant2?: { Total?: { Goals?: number } };
  };
}

function authHeaders(): Record<string, string> {
  if (!fs.existsSync(AUTH_CACHE_PATH)) {
    throw new Error(`credenciais TxLINE ausentes — rode \`npm run subscribe\` primeiro`);
  }
  const { jwt, apiToken } = JSON.parse(fs.readFileSync(AUTH_CACHE_PATH, "utf-8"));
  return { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken };
}

async function fetchJson<T>(pathname: string): Promise<T> {
  const res = await fetch(`${API_ORIGIN}${pathname}`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`GET ${pathname} HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** Último evento de cada Action (não é histórico completo). */
export function scoresSnapshot(fixtureId: number): Promise<ScoreEvent[]> {
  return fetchJson(`/api/scores/snapshot/${fixtureId}`);
}

/** Replay histórico: fatia de 5min começando em hourOfDay:00 UTC + slice*5min. */
export function scoresReplaySlice(
  epochDay: number,
  hourOfDay: number,
  slice: number
): Promise<ScoreEvent[]> {
  return fetchJson(`/api/scores/updates/${epochDay}/${hourOfDay}/${slice}`);
}

export interface FinalResult {
  homeGoals: number;
  awayGoals: number;
  /** true = mandante venceu (regra SIM do mercado; empate = NÃO) */
  homeWon: boolean;
}

/** Detecta fim de partida: evento `game_finalised` carrega o placar final. */
export function findFinalResult(events: ScoreEvent[], fixtureId: number): FinalResult | null {
  const fin = events.find(
    (e) => e.FixtureId === fixtureId && e.Action === "game_finalised"
  );
  if (!fin) return null;
  const p1 = fin.Score?.Participant1?.Total?.Goals ?? 0;
  const p2 = fin.Score?.Participant2?.Total?.Goals ?? 0;
  const homeGoals = fin.Participant1IsHome ? p1 : p2;
  const awayGoals = fin.Participant1IsHome ? p2 : p1;
  return { homeGoals, awayGoals, homeWon: homeGoals > awayGoals };
}
