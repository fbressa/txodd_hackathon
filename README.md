# World Cup Prediction Market: trust-minimized settlement via TxLINE

Binary parimutuel prediction market on Solana (devnet) for World Cup 2026
matches, with **fully automated settlement driven by the TxLINE data feed**.
No human decides the outcome: the settlement service watches TxLINE score
events (data that TxODDS timestamps on-chain), detects the final whistle and
settles the market on-chain.

Built for the World Cup Hackathon, *Prediction Markets & Settlement* track.

## How it works

```
TxLINE devnet feed ──► Settlement service ──► settle_market
 (scores, replay)         (TypeScript)            │
                                                  ▼
Frontend (React + wallet adapter) ──► Anchor program (devnet)
  list · bet YES/NO · claim            create_market · place_bet
                                       settle_market · claim
```

Each market asks one question about a fixture: **will the home team win?**
(draw counts as NO). Winners split the whole pool pro-rata to their stake:
pure parimutuel, no orderbook, no oracle operator to trust for pricing.

- **Market PDA**: seed = TxLINE `FixtureId`, so market ↔ fixture binding is
  structural, not a config entry.
- **States**: `Open` → locked at kickoff (derived from the on-chain clock, no
  cron) → `Settled` by the settlement authority with the TxLINE result.
- **Payout**: `stake * pool_total / pool_winner`, u128 math, claim once,
  winners only. All security checks (signer, authority, state, deadline,
  double-claim) covered by 12 litesvm tests.

## Why TxLINE makes this trust-minimized

The result written on-chain comes from the TxLINE feed, which TxODDS
timestamps packet-by-packet on Solana: a tamper-evident audit trail for the
exact data that settled the market. The MVP has the service authority sign
`settle_market`; verifying TxLINE **validation proofs inside the program** is
the designed next step (the account layout and settlement path don't change).

## TxLINE endpoints used

| Endpoint / interaction | Use |
|---|---|
| `subscribe` ix on the txoracle program (on-chain tx) | Free-tier subscription that authorizes API access |
| `POST /auth/guest/start` → `POST /api/token/activate` | Auth: guest JWT, then wallet-signed token activation |
| `GET /api/fixtures/snapshot` | Market creation (fixture id = PDA seed, kickoff = deadline) and team names in the UI |
| `GET /api/scores/snapshot/{fixtureId}` | Live settlement: 60s polling for the `game_finalised` event |
| `GET /api/scores/updates/{epochDay}/{hourOfDay}/{interval}` | Historical replay: deterministic settlement (5-min slices) |

Observed formats and quirks are documented in
[docs/txline-notas.md](docs/txline-notas.md); nothing about the feed is invented.

## Devnet addresses

| What | Address |
|---|---|
| Program `prediction_market` | `FwFokFQm1uFrnvrSXKvTATXf2VY8GKnSoUpBrU5WWA85` |
| TxLINE txoracle program | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxLINE devnet API | `https://txline-dev.txodds.com` |

Everything runs on **devnet** (program, RPC, TxLINE stack).

## Repository layout

```
programs/prediction_market/   Anchor program (4 instructions) + litesvm tests
service/                      TxLINE auth + settlement service + devnet E2E
app/                          single-page frontend (Vite + React + wallet adapter)
docs/txline-notas.md          observed TxLINE formats (nothing invented)
```

## Running it

Prereqs: Rust + Anchor 1.0.1, Node 20+, a funded devnet keypair at
`keypairs/devnet.json`.

```bash
# 1. Program: build + tests (12 tests, happy path + security rejections)
anchor build
anchor test

# 2. TxLINE credentials (once per 4 weeks): on-chain subscribe → JWT → token
cd service && npm install
npm run subscribe

# 3. Full E2E on devnet (deterministic, uses TxLINE historical replay):
#    create market → two bets → deadline → settle from replay → claim
npm run e2e -- --match-id 42               # any fresh id; market PDA is unique

# 4. Settlement against a live fixture (60s polling)
npm run settle -- --fixture <fixtureId>

# 5. Frontend against devnet
cd ../app && npm install && npm run dev
```

The E2E run settles from the real devnet fixture **18187298
(Brazil 1x2 Norway, 2026-07-05)** replayed through TxLINE's historical replay
API: the service scans 5-minute slices from kickoff, finds the
`game_finalised` event, extracts the final score and settles. The winning
side claims the exact pool; the losing side is rejected with `NotWinner`.
