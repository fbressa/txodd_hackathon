# ARQUITETURA — Prediction Market · World Cup Hackathon

> Visão técnica do sistema. Escopo e cronograma em @BACKLOG.md; contexto em @BRIEFING.md.
> Rede: **devnet em tudo** (programa próprio, RPC, stack TxLINE).

## Visão geral

```
                    ┌─────────────────────────────────────────────┐
                    │                TxLINE (devnet)              │
                    │  API: txline-dev.txodds.com                 │
                    │  ├─ fixtures  (agenda da Copa)              │
                    │  ├─ scores    (snapshot/stream/replay)      │
                    │  └─ validation proofs (stretch)             │
                    │  Programa txoracle: 6pW64gN1... (confirmar) │
                    └───────────────┬─────────────────────────────┘
                          scores    │    ▲ subscribe (tx Anchor)
                          (HTTP)    ▼    │
┌──────────────┐      ┌─────────────────────────┐
│   Frontend   │      │  Settlement service     │
│ (página única│      │  (TypeScript)           │
│  + wallet    │      │  1. auth TxLINE         │
│  adapter)    │      │  2. detecta fim de jogo │
│              │      │  3. determina outcome   │
└──────┬───────┘      └───────────┬─────────────┘
       │ create_market*,          │ settle_market
       │ place_bet, claim         │ (authority assina)
       ▼                          ▼
┌─────────────────────────────────────────────────┐
│        Programa Anchor (Solana devnet)          │
│  prediction_market                              │
│  ├─ Market PDA   (seed: match_id TxLINE)        │
│  ├─ Vault PDA    (escrow dos fundos)            │
│  └─ Position PDA (por apostador × mercado)      │
│  Estados: Open → Locked → Settled               │
└─────────────────────────────────────────────────┘

* create_market pode ser chamado por script/authority; não precisa de UI.
```

## Componente 1 — Programa Anchor (`prediction_market`)

### Contas

| Conta | Seeds (PDA) | Campos principais |
|---|---|---|
| `Market` | `["market", match_id]` | match_id (TxLINE), authority, deadline (kickoff), estado, outcome, pool_sim, pool_nao |
| `Vault` | `["vault", market]` | escrow em SOL (system account PDA) |
| `Position` | `["position", market, bettor]` | apostador, lado (SIM/NÃO), stake, claimed |

### Instruções

| Instrução | Quem assina | Efeito | Checagens de segurança |
|---|---|---|---|
| `create_market` | authority | Cria Market + Vault; estado Open | match_id único (PDA), deadline futura |
| `place_bet` | apostador | Transfere SOL → vault; cria/atualiza Position; incrementa pool do lado | estado Open, `now < deadline`, valor > 0 |
| `settle_market` | authority | Grava outcome; estado → Settled | signer == authority do market, estado != Settled, `now >= deadline` |
| `claim` | apostador | Paga `stake * pool_total / pool_vencedor` do vault | estado Settled, Position do lado vencedor, `!claimed` (marca após pagar), owner da Position == signer |

### Estados
```
Open ──(kickoff/deadline atingida)──► Locked ──(settle_market)──► Settled
```
`Locked` é derivado (deadline passou) — `place_bet` rejeita por timestamp,
sem precisar de transição on-chain explícita.

### Modelo econômico
Parimutuel puro: vencedores dividem o pote total proporcionalmente ao stake.
Sem odds dinâmicas, sem taxa (MVP). Edge case: pool vencedor vazio → ninguém
a pagar (fundos ficam; tratamento de refund só se sobrar tempo).

## Componente 2 — Settlement service (TypeScript, `service/`)

Processo off-chain (Node) que fecha o ciclo TxLINE → on-chain:

1. **Auth TxLINE** (uma vez por assinatura de 4 semanas):
   - Tx `subscribe(SL 1, 4 semanas)` no programa txoracle (devnet)
   - `POST /auth/guest/start` → JWT guest
   - Assinar `${txSig}::${jwt}` com a wallet → `POST /api/token/activate`
   - Chamadas seguintes: headers `Authorization: Bearer <jwt>` + `X-Api-Token: <token>`
2. **Polling/stream de scores** dos mercados abertos (SL 1, delay 60s —
   irrelevante para settlement pós-jogo).
3. **Detecção de fim de partida** → outcome (SIM/NÃO conforme o mercado).
4. **`settle_market`** assinado pela keypair authority.

Em dev/teste: **historical replay** do free tier no lugar do stream ao vivo
(testes determinísticos). O formato real das respostas vai documentado em
`docs/txline-notas.md` conforme descoberto (nunca inventado).

## Componente 3 — Frontend (página única)

- Wallet adapter padrão Solana.
- Lê Markets via RPC devnet (getProgramAccounts / Anchor client).
- Ações: `place_bet` (SIM/NÃO) e `claim`. `create_market` fica em script CLI.
- Funcional > bonito. Sem estado próprio de backend — tudo on-chain.

## Fluxo E2E (verificação canônica)

```
1. create_market(match_id, kickoff)          [script/authority]
2. place_bet(SIM) + place_bet(NÃO)           [apostadores via frontend]
3. kickoff passa → mercado Locked            [derivado do clock]
4. Partida termina no feed TxLINE (replay)   [settlement service detecta]
5. settle_market(outcome)                    [service, authority assina]
6. claim                                     [vencedores via frontend]
```

## Confiança e limites (ângulo da submissão)

- **Fase 1 (MVP):** authority assina o settle — a confiança está no service,
  mas o outcome vem do feed TxLINE, que timestampa todo pacote na Solana
  (trilha de auditoria à prova de adulteração).
- **Stretch (E6.1):** verificar a validation proof do TxLINE dentro do
  `settle_market` → settlement trust-minimized de fato.

## Decisões e razões

| Decisão | Razão |
|---|---|
| Parimutuel (não orderbook/AMM) | Escopo travado; 1 vault + aritmética simples cabe no prazo |
| Locked derivado por timestamp | Evita instrução/cron extra para transição de estado |
| SL 1 (delay 60s) | Free, documentado em devnet; delay irrelevante pós-jogo |
| create_market via script | Corta uma tela do frontend sem perder a demo E2E |
| Replay histórico nos testes | Determinístico; não depende de jogo ao vivo |
