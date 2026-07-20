# E5.3/E5.4: Submissão no Superteam Earn (ENVIADA em 19/07/2026)

> Registro do texto submetido no formulário da trilha
> "Prediction Markets and Settlement". Submissão feita dentro do prazo
> (deadline 19/07 23:59 UTC).

---

**Project name:** World Cup Predictions: trust-minimized settlement via TxLINE

**One-liner:** Parimutuel prediction markets for World Cup matches where no
human decides the outcome. Settlement is driven end-to-end by the TxLINE
feed, the same data TxODDS timestamps on-chain.

**Description:**

Prediction markets die or thrive on one question: *who do you have to trust
to settle?* We built a binary parimutuel market on Solana where the answer is
"the data feed itself".

Each market is a PDA seeded by a TxLINE `FixtureId`, so the market ↔ match
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
  deterministically through the historical replay API; the same code path
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
- Single-page frontend (wallet adapter, EN/PT): list markets, bet, claim
- Full E2E on devnet without human intervention:
  create → bet → lock → settle from TxLINE replay → exact-payout claim

**Links:**
- Repo: https://github.com/fbressa/txodd_hackathon
- Live app: https://fbressa.github.io/txodd_hackathon/
- Demo video: enviado no campo próprio do formulário (YouTube)
- Program (devnet explorer):
  https://explorer.solana.com/address/FwFokFQm1uFrnvrSXKvTATXf2VY8GKnSoUpBrU5WWA85?cluster=devnet

Note for judges: Phantom may flag the freshly-registered GitHub Pages domain
with a generic warning. This is a devnet-only demo (no real funds); choose
"proceed" to test the app.

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
  fully deterministic and testable without waiting for live matches. Our E2E
  test settles a real fixture (Brazil 1x2 Norway) the same way live polling would.
- The on-chain subscription flow (pay-per-use authorization as a Solana tx) is
  a genuinely web3-native auth model, and the free tier was enough for the
  entire build.
- Score events carry rich, consistent context (fixture, participants,
  `Participant1IsHome`, cumulative `Score.*.Total`), so settlement logic stays simple.

Where we hit friction (all worked around, details in `docs/txline-notas.md`):
- `POST /api/token/activate` returns the token as plain text while the docs
  suggest JSON; we handle both.
- The `subscribe` instruction requires the user's Token-2022 ATA to already
  exist (fails with 3012 otherwise); the docs don't mention it. We prepend a
  `createAssociatedTokenAccountIdempotentInstruction` in the same tx.
- `GameState` never leaves `"scheduled"`, even after full time. Match end is
  actually signaled by the `Action: "game_finalised"` event (`StatusId: 100`),
  which we only discovered by observing a finished match end-to-end. Documenting
  the event lifecycle (and `StatusId` values) would save teams a lot of time.
- The replay path parameter `interval` is undocumented; by experiment it is an
  index of 5-minute slices counted from `hourOfDay` (e.g. `.../20/25` = 22:05 to 22:10).
- `/api/scores/snapshot/{fixtureId}` returns the latest event per `Action`
  type, not full history: undocumented but actually convenient once known.

---

## Checklist da submissão (E5.4): CONCLUÍDA
- [x] Repo público no GitHub: fbressa/txodd_hackathon
- [x] Frontend hospedado (E4.5): GitHub Pages
- [x] Lista de endpoints TxLINE (requisito "brief technical documentation")
- [x] Feedback sobre a API (requisito do formulário)
- [x] Vídeo demo gravado e publicado (E5.2)
- [x] Submetido no Earn em 19/07, dentro do prazo

## Script de narração usado no vídeo (inglês, ~4 min)

> **[Tela: app publicado]**
> "Prediction markets live or die on one question: who do you have to trust?
> Who holds the money, and who decides the result? We built a World Cup
> prediction market on Solana where the answer is: nobody. Custody is an
> on-chain vault, and results come straight from the TxLINE data feed."
>
> **[Walkthrough: aposta real com a Phantom]**
> "Each market is one question about a real fixture from the TxLINE feed:
> will the home team win? Markets are created automatically for upcoming
> fixtures, and betting closes at kickoff. Let me place a real bet. I choose
> my amount, I see my projected payout before signing (this is a parimutuel
> market, winners split the whole pot) and I confirm in my wallet. Done: my
> SOL is now in a program-owned vault that no private key can touch."
>
> **[Tela: terminal, npm run e2e -- --match-id <novo>]**
> "Now, settlement. This is the part judges care about, so let me run our
> end-to-end pipeline live against a real match: Brazil versus Norway, played
> on July 5th, replayed deterministically through TxLINE's historical replay
> API. Watch: the script creates a market, places two bets, waits for the
> deadline... and now the settlement service scans the match in five-minute
> slices, exactly as it would poll a live game. There: the game-finalised
> event, final score one-two. Norway won, so the outcome is NO, written
> on-chain by settle_market. The winner claims the exact pot, and the loser's
> claim is rejected by the program. No human touched the result."
>
> **[Tela: explorer devnet, tx do settle e claim; card resolvido]**
> "Everything is verifiable: here's the settlement transaction on devnet, and
> the app links every resolved market to its on-chain settlement. And because
> TxODDS timestamps every data packet on Solana, the data that settled this
> market has a tamper-evident audit trail."
>
> **[Fechamento: card Spain x Argentina travado ao vivo]**
> "Today the settlement authority relays what the feed says. The next step is
> already designed: verifying TxLINE's validation proofs inside the program
> itself, the 'experimental verification layer' this track calls for. And the
> Spain-Argentina market being played right now? It will settle itself
> automatically, with no one at the keyboard. Thanks for watching."
