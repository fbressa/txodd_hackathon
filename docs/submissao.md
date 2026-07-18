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
- Repo: TODO
- Live app: TODO (hosting pendente — E4.5)
- Demo video: TODO (E5.2)
- Program (devnet explorer):
  https://explorer.solana.com/address/FwFokFQm1uFrnvrSXKvTATXf2VY8GKnSoUpBrU5WWA85?cluster=devnet

---

## Checklist antes de submeter (E5.4)
- [ ] Repo público no GitHub (hoje o repo é só local no WSL!)
- [ ] Link do frontend hospedado (E4.5)
- [ ] Vídeo demo gravado (E5.2 — roteiro abaixo)
- [ ] Conferir requisitos do formulário na página da trilha

## Roteiro sugerido do vídeo (E5.2, ~3 min)
1. Página no browser: mercado resolvido (Brazil x Norway) — mostrar pools e outcome.
2. Terminal: `npm run e2e -- --match-id <novo>` rodando ao vivo:
   create → apostas → deadline → fatias do replay passando → `game_finalised`
   1x2 → settle tx → claim com payout exato → NotWinner do perdedor.
3. Explorer devnet: tx do settle e do claim.
4. Fechar com o ângulo: dado timestampado on-chain pela TxODDS + validation
   proofs como próximo passo.
