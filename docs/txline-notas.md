# TxLINE: notas de integração (fatos verificados na doc)

> Regra: nunca inventar formato. Tudo aqui foi confirmado na doc oficial ou
> observado em resposta real da API. Atualizado: 04/07/2026.

## Rede devnet (a nossa)
- API origin: `https://txline-dev.txodds.com` (endpoints sob `/api/...`)
- RPC: `https://api.devnet.solana.com`
- Programa txoracle: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` ✅ confirmado
- TXLINE token mint (devnet): `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` (**Token-2022**)

## Free tier
- **Service Level 1** = Copa + amistosos, delay 60s. Sem pagamento em TxL
  (só fee de rede da tx subscribe). Duração em múltiplos de 4 semanas.
- Devnet documenta apenas SL 1 (conferir pricing matrix on-chain antes de usar outra linha).

## Instrução `subscribe` (txoracle)
- Args: `service_level_id: u16`, `weeks: u8` (múltiplo de 4)
- Discriminator: `[254, 28, 191, 138, 156, 179, 183, 53]`
- Contas (ordem do IDL em `service/idl/txoracle.json`):
  1. `user` (writable, signer)
  2. `pricing_matrix`: PDA `["pricing_matrix"]` do txoracle
  3. `token_mint`: TXLINE mint
  4. `user_token_account`: ATA(mint, user) via **Token-2022**
  5. `token_treasury_vault`: ATA(mint, token_treasury_pda, allowOwnerOffCurve=true) via Token-2022
  6. `token_treasury_pda`: PDA `["token_treasury_v2"]` do txoracle
  7. `token_program` = TOKEN_2022_PROGRAM_ID
  8. `system_program`
  9. `associated_token_program`
- IDL não está publicado on-chain (extraído da página de doc devnet).
- Instrução `request_devnet_faucet` existe no programa (faucet de TxL devnet,
  se algum dia precisarmos de tier pago em teste).

## Fluxo de auth (ordem verificada no quickstart)
1. `POST {apiOrigin}/auth/guest/start` (sem body) → `{ "token": "<jwt>" }`
2. Tx `subscribe(1, 4)` no txoracle devnet → `txSig`
3. Mensagem: `` `${txSig}:${leagues.join(",")}:${jwt}` `` (leagues `[]` no
   plano standard, então fica `txSig::jwt`)
4. Assinar com nacl.sign.detached(message, secretKey) → base64
5. `POST {apiOrigin}/api/token/activate` body `{ txSig, walletSignature, leagues: [] }`,
   header `Authorization: Bearer <jwt>` → `{ "token": "<apiToken>" }` (ou token direto no body)
6. Chamadas de dados: headers `Authorization: Bearer <jwt>` + `X-Api-Token: <apiToken>`

## Endpoints de dados (paths confirmados; formatos a observar)
- Fixtures: `GET /api/fixtures/snapshot[?competitionId=...]`
  → array com `FixtureId`, `StartTime`, `Participant1`, `Participant2`, `Participant1IsHome`
- Scores snapshot: `GET /api/scores/snapshot/{fixtureId}`
- Scores updates (live): `GET /api/scores/updates/{fixtureId}`
- Scores replay histórico: `GET /api/scores/updates/{epochDay}/{hourOfDay}/{interval}`
- Odds snapshot: `GET /api/odds/snapshot/{fixtureId}` (não usamos no MVP)
- API reference completa: `https://txline.txodds.com/docs/docs.yaml`

## Formatos REAIS observados (05/07/2026, devnet)

### `/api/token/activate`
Retorna o token em **texto puro** (`txoracle_ap...`), não JSON. Tratar os dois casos.

### Subscribe on-chain
O programa **não cria a ATA do usuário**: exige `user_token_account` já
inicializada (erro 3012 AccountNotInitialized). Solução: incluir
`createAssociatedTokenAccountIdempotentInstruction` (Token-2022) na mesma tx.

### Fixture (array de `/api/fixtures/snapshot`)
```json
{
  "Ts": 1783162800000,            // timestamp do registro (ms)
  "StartTime": 1783281600000,     // kickoff (ms) ← deadline do mercado
  "Competition": "World Cup",
  "CompetitionId": 72,            // ← Copa 2026 = 72 (Friendlies = 430)
  "FixtureGroupId": 10115574,
  "Participant1Id": 1634, "Participant1": "Brazil",
  "Participant2Id": 2661, "Participant2": "Norway",
  "FixtureId": 18187298,          // ← match_id / seed do market PDA
  "Participant1IsHome": true
}
```
Devnet em 05/07: 10 fixtures (8 da Copa, 2 amistosos), todas futuras.

### Score event (`/api/scores/snapshot/{fixtureId}`, HTTP 200 = array de eventos)
```json
{
  "FixtureId": 18187298,
  "GameState": "scheduled",       // ← campo-chave p/ settlement (valores finais a observar)
  "StartTime": 1783281600000,
  "IsTeam": true, "FixtureGroupId": 10115574, "CompetitionId": 72,
  "CountryId": 466, "SportId": 1, "Participant1IsHome": true,
  "Participant1Id": 1634, "Participant2Id": 2661,
  "Action": "comment",            // visto: "comment", "coverage_update"
  "Id": 1, "Ts": 1782847947773, "ConnectionId": 815, "Seq": 1,
  "Data": {}, "Stats": {}         // vazios em jogo "scheduled"; placar deve vir aqui
}
```

### `/api/scores/updates/{fixtureId}`
É um **stream SSE** (`event: scores`, `data: {...json...}`, `id: <seq>`);
mesmo shape de evento do snapshot. Consumir com EventSource/parser SSE, não JSON puro.

### Replay histórico `/api/scores/updates/{epochDay}/{hourOfDay}/{interval}`
- `epochDay` = floor(epochSeconds/86400). Testado 20614/20638 → `[]` HTTP 200
  (nenhum jogo coberto ainda no devnet; 1º jogo: 05/07 20:00 UTC).

## A OBSERVAR (após o 1º jogo, Brazil x Norway 05/07 20:00 UTC, fixture 18187298)
- [ ] Valores de `GameState` durante e após o jogo (como detectar "encerrada")
- [ ] Formato de `Data`/`Stats` com placar real
- [ ] Replay histórico com conteúdo (granularidade do `interval`)

## Formatos observados pós-jogo (17/07/2026, Brazil x Norway fixture 18187298)

### Fim de partida (resolvida a pendência do E1)
- **`GameState` NÃO muda**: ficou `"scheduled"` em todos os eventos, inclusive
  durante e após o jogo. Não usar para settlement.
- O marcador de fim é o evento **`Action: "game_finalised"`** (`StatusId: 100`),
  que carrega o **placar final** em `Score`.
- `StatusId` observados: 1, 2, 3, 4, 5 (in-play) e 100 (finalizado). Evento
  `Action: "status"` traz `Data.StatusId` nas transições.

### Placar
- `Score.Participant1.Total.Goals` / `Score.Participant2.Total.Goals`
  (campo **ausente = 0**; ex.: Brazil 1 x 2 Norway → P1 `{Goals:1}`, P2 `{Goals:2}`).
- Mandante: `Participant1IsHome ? Participant1 : Participant2`.
- Subdivisões `H1`/`HT`/`H2` existem; usar sempre `Total`.

### `/api/scores/snapshot/{fixtureId}` (pós-jogo)
Retorna o **último evento de cada `Action`** (41 eventos, 1 por tipo); não é
o histórico completo. O `game_finalised` está lá → detecção via snapshot polling
funciona para jogo ao vivo.

### Replay histórico `/api/scores/updates/{epochDay}/{hourOfDay}/{interval}`
- **`interval` = índice de fatia de 5 minutos** a partir de `hourOfDay:00 UTC`:
  janela = `[hourOfDay:00 + interval*5min, +5min)`. Verificado:
  `20639/20/0` → 20:00–20:05 (kickoff), `20639/20/15` → 21:15–21:20,
  `20639/20/25` → 22:05–22:10 (contém exatamente o `game_finalised`, placar 1–2).
- Fatia sem eventos → `[]` HTTP 200.
- Eventos têm o mesmo shape do snapshot (JSON array, não SSE).
