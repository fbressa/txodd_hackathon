# TxLINE — notas de integração (fatos verificados na doc)

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
- Contas (ordem do IDL — `service/idl/txoracle.json`):
  1. `user` (writable, signer)
  2. `pricing_matrix` — PDA `["pricing_matrix"]` do txoracle
  3. `token_mint` — TXLINE mint
  4. `user_token_account` — ATA(mint, user) via **Token-2022**
  5. `token_treasury_vault` — ATA(mint, token_treasury_pda, allowOwnerOffCurve=true) via Token-2022
  6. `token_treasury_pda` — PDA `["token_treasury_v2"]` do txoracle
  7. `token_program` = TOKEN_2022_PROGRAM_ID
  8. `system_program`
  9. `associated_token_program`
- IDL não está publicado on-chain (extraído da página de doc devnet).
- Instrução `request_devnet_faucet` existe no programa (faucet de TxL devnet,
  se algum dia precisarmos de tier pago em teste).

## Fluxo de auth (ordem verificada no quickstart)
1. `POST {apiOrigin}/auth/guest/start` (sem body) → `{ "token": "<jwt>" }`
2. Tx `subscribe(1, 4)` no txoracle devnet → `txSig`
3. Mensagem: `` `${txSig}:${leagues.join(",")}:${jwt}` `` — leagues `[]` no
   plano standard, então fica `txSig::jwt`
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

## A OBSERVAR (preencher com respostas reais)
- [ ] Formato completo de um fixture (campos além dos 5 listados; competitionId da Copa)
- [ ] Formato de score update (como detectar partida encerrada — campo de status/período?)
- [ ] Comportamento do replay histórico (granularidade do interval)
