# E5.3 — Texto de submissão (rascunho para o Superteam Earn)

> Rascunho em inglês (público internacional do Earn). Colar no formulário,
> ajustando os links marcados com TODO.

---

**Project name:** World Cup Prediction Market — trust-minimized settlement via TxLINE

**One-liner:** Parimutuel prediction markets for World Cup matches where no
human decides the outcome — settlement is driven end-to-end by the TxLINE
feed, the same data TxODDS timestamps on-chain.

**Description:**

Prediction markets die or thrive on one question: *who do you have to trust
to settle?* We built a binary parimutuel market on Solana where the answer is
"the data feed itself".

Each market is a PDA seeded by a TxLINE `FixtureId` — the market ↔ match
binding is structural. Bettors take YES/NO on "home team wins" (draw = NO);
funds sit in a program-owned vault; betting locks at kickoff via the on-chain
clock. When the match ends, our settlement service detects TxLINE's
`game_finalised` event, extracts the final score and calls `settle_market`.
Winners claim `stake * pool_total / pool_winner`. No orderbook, no oracle
committee, no manual resolution.

**TxLINE as primary input (track requirement):**
- Fixtures snapshot → market creation (fixture id, kickoff = betting deadline)
- Scores (snapshot / historical replay) → end-of-match detection + final score
- The demo settles a real devnet fixture (18187298, Brazil 1x2 Norway)
  deterministically through the historical replay API — the same code path
  polls live fixtures in production.
- TxLINE timestamps every data packet on Solana, giving the settlement input
  a tamper-evident audit trail. Verifying TxLINE validation proofs inside
  `settle_market` is the designed next step to remove the last trusted party
  (the service authority).

**What's live:**
- Anchor program on devnet: `FwFokFQm1uFrnvrSXKvTATXf2VY8GKnSoUpBrU5WWA85`
  (4 instructions, 12 litesvm tests: happy path + signer/state/deadline/
  double-claim rejections)
- Settlement service (TypeScript): TxLINE auth (on-chain subscribe → JWT →
  token activation), replay + live polling detection, on-chain settle
- Single-page frontend (wallet adapter): list markets, bet, claim
- Full E2E on devnet without human intervention:
  create → bet → lock → settle from TxLINE replay → exact-payout claim

**Links:**
- Repo: https://github.com/fbressa/txodd_hackathon
- Live app: https://fbressa.github.io/txodd_hackathon/
- Demo video: TODO (E5.2)
- Program (devnet explorer):
  https://explorer.solana.com/address/FwFokFQm1uFrnvrSXKvTATXf2VY8GKnSoUpBrU5WWA85?cluster=devnet

**TxLINE endpoints used (technical documentation requirement):**

| Endpoint / interaction | Use in the product |
|---|---|
| `subscribe` instruction on the txoracle devnet program (on-chain tx) | Free-tier subscription (SL 1, 4 weeks) that authorizes API access |
| `POST /auth/guest/start` | Guest JWT to bootstrap authentication |
| `POST /api/token/activate` | API token activation (wallet-signed `txSig::jwt` message) |
| `GET /api/fixtures/snapshot` | Market creation: fixture id (market PDA seed), kickoff (betting deadline), team names shown in the UI |
| `GET /api/scores/snapshot/{fixtureId}` | Live settlement: 60s polling until the `game_finalised` event appears |
| `GET /api/scores/updates/{epochDay}/{hourOfDay}/{interval}` | Historical replay: deterministic settlement demo/tests (5-minute slices from kickoff) |

**Feedback (submission form requirement):**

What we liked most:
- The historical replay endpoint is a standout: it made our settlement pipeline
  fully deterministic and testable without waiting for live matches — our E2E
  test settles a real fixture (Brazil 1x2 Norway) the same way live polling would.
- The on-chain subscription flow (pay-per-use authorization as a Solana tx) is
  a genuinely web3-native auth model, and the free tier was enough for the
  entire build.
- Score events carry rich, consistent context (fixture, participants,
  `Participant1IsHome`, cumulative `Score.*.Total`), so settlement logic stays simple.

Where we hit friction (all worked around, details in `docs/txline-notas.md`):
- `POST /api/token/activate` returns the token as plain text while the docs
  suggest JSON — we handle both.
- The `subscribe` instruction requires the user's Token-2022 ATA to already
  exist (fails with 3012 otherwise); the docs don't mention it. We prepend a
  `createAssociatedTokenAccountIdempotentInstruction` in the same tx.
- `GameState` never leaves `"scheduled"` — even after full time. Match end is
  actually signaled by the `Action: "game_finalised"` event (`StatusId: 100`),
  which we only discovered by observing a finished match end-to-end. Documenting
  the event lifecycle (and `StatusId` values) would save teams a lot of time.
- The replay path parameter `interval` is undocumented; by experiment it is an
  index of 5-minute slices counted from `hourOfDay` (e.g. `.../20/25` = 22:05–22:10).
- `/api/scores/snapshot/{fixtureId}` returns the latest event per `Action`
  type, not full history — undocumented but actually convenient once known.

---

## Checklist antes de submeter (E5.4)
- [x] Repo público no GitHub: fbressa/txodd_hackathon
- [x] Link do frontend hospedado (E4.5): GitHub Pages (workflow em .github/workflows/pages.yml)
- [x] Lista de endpoints TxLINE (requisito "brief technical documentation") — acima
- [x] Feedback sobre a API (requisito do formulário) — acima
- [ ] Vídeo demo gravado (E5.2 — roteiro abaixo; **é o item de maior peso no julgamento**)
- [ ] Submeter até 19/07 23:59 UTC (20:59 BRT) — não deixar para a última hora

## Roteiro do vídeo (E5.2, até 5 min — requisito: problema → walkthrough → como o TxLINE alimenta o backend)
1. **O problema (30s):** "Mercados de previsão morrem numa pergunta: quem custodia
   o dinheiro e quem decide o resultado? Nós tiramos o humano das duas pontas:
   custódia é um cofre on-chain, e o resultado vem do feed TxLINE, que a TxODDS
   timestampa na Solana."
2. **Walkthrough do app (1min):** site publicado — mercados abertos (Spain x
   Argentina etc.), apostar com a Phantom mostrando a confirmação com payout
   projetado, mercado resolvido (Brazil x Norway) com posição paga.
3. **O pipeline TxLINE (2min):** terminal, `npm run e2e -- --match-id <novo>`:
   create → apostas → deadline → fatias do replay passando → `game_finalised`
   1x2 → settle tx → claim com payout exato → NotWinner do perdedor. Narrar:
   "o mesmo código que faz polling ao vivo, alimentado pelo historical replay
   do TxLINE — settlement determinístico, sem intervenção humana".
4. **Prova (30s):** explorer devnet — tx do settle e do claim; card resolvido
   com o link de verificação.
5. **Fechamento (30s):** dado timestampado on-chain pela TxODDS hoje; validation
   proofs verificadas dentro do programa como próximo passo (trilha cita
   exatamente isso como "Experimental Verification Layer").
