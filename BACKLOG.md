# BACKLOG — Prediction Market · World Cup Hackathon

> Fonte de verdade da execução. Ordem dos épicos = ordem de trabalho.
> Regra: só iniciar um épico quando o anterior tiver o critério de saída verde
> (exceção: tarefas independentes marcadas com ⫽ podem paralelizar).
> Status: `[ ]` pendente · `[~]` em andamento · `[x]` feito · `[!]` bloqueado.

## E0 — Setup do repositório
**Critério de saída:** `anchor build` e `anchor test` rodam (mesmo vazios); repo git inicializado.

- [x] E0.1 `git init` + `.gitignore` (target/, node_modules/, .anchor/, keypairs)
- [x] E0.2 `anchor init` do workspace (programa `prediction_market`)
- [x] E0.3 Configurar `Anchor.toml` para localnet (default) e devnet (cluster nomeado)
- [~] E0.4 Keypair devnet dedicada (`BHpiHXaARUP1hzYbxsA8cTewTjE23D1YRg94hbuJD7mo`) — airdrop pendente (rate limit; usar faucet.solana.com)

> **Nota (04/07):** repo vive em `~/txodd` no **WSL Ubuntu** (builds rápidos,
> fora do OneDrive). Anchor 1.0.1: template usa testes em **Rust**
> (`cargo test`, `programs/prediction_market/tests/`), não ts-mocha.

## E1 — Credenciais TxLINE (risco desconhecido — fazer primeiro)
**Critério de saída:** `npx ts-node service/subscribe.ts` imprime fixtures da Copa no terminal usando a API devnet.

- [ ] E1.1 Confirmar na doc o program ID completo do txoracle devnet (`6pW64gN1...`)
- [ ] E1.2 Script `subscribe.ts`: tx `subscribe(SL 1, 4 semanas)` no txoracle devnet
- [ ] E1.3 Auth: `POST /auth/guest/start` → assinar `${txSig}::${jwt}` → `POST /api/token/activate`
- [ ] E1.4 GET fixtures com headers `Authorization: Bearer` + `X-Api-Token`; imprimir no terminal
- [ ] E1.5 Anotar em `docs/txline-notas.md` o formato real das respostas (fixtures, scores) — nunca inventar formato
- [!] Bloqueio possível: doc não responder algo da API → perguntar no Telegram TxLINEChat

## E2 — Programa Anchor (4 instruções)
**Critério de saída:** `anchor test` verde cobrindo fluxo feliz + rejeições de segurança, com resultado mockado.

- [ ] E2.1 Contas/PDAs: `Market` (seed: match_id TxLINE), `Vault`, `Position` (por apostador); enum de estado Open → Locked → Settled
- [ ] E2.2 `create_market`: cria PDA, define deadline (kickoff), estado Open
- [ ] E2.3 `place_bet`: aposta SIM/NÃO → vault; cria/atualiza Position; rejeita após deadline
- [ ] E2.4 `settle_market`: autoridade assina; grava outcome; estado Settled
- [ ] E2.5 `claim`: payout `stake * pool_total / pool_vencedor`; só vencedor, só uma vez
- [ ] E2.6 Testes de segurança: signer errado, mercado no estado errado, aposta após deadline, claim duplo, claim de perdedor
- [ ] E2.7 Deploy em devnet (`anchor deploy --provider.cluster devnet`)

## E3 — Settlement service (TypeScript)
**Critério de saída:** partida do historical replay é resolvida E2E em devnet sem intervenção manual (create → bet → settle → claim).

- [ ] E3.1 Cliente TxLINE: auth (reusar E1) + consumo do endpoint de scores (snapshot/stream)
- [ ] E3.2 Detecção de fim de partida → determinar outcome
- [ ] E3.3 Chamar `settle_market` no programa em devnet
- [ ] E3.4 Teste E2E com historical replay (determinístico, free tier)

## E4 — Frontend mínimo
**Critério de saída:** no browser contra devnet: listar mercados, apostar, ver estado, claim — com wallet adapter.

- [ ] E4.1 Scaffold (página única) + wallet adapter padrão
- [ ] E4.2 Listar mercados (estado, pools, deadline)
- [ ] E4.3 Apostar SIM/NÃO
- [ ] E4.4 Claim para vencedores
- [ ] E4.5 Deploy estável (frontend hospedado + programa devnet)

## E5 — Submissão
**Critério de saída:** submissão publicada no Superteam Earn até 17/07.

- [ ] E5.1 README: arquitetura, como rodar, endereços devnet
- [ ] E5.2 Vídeo demo: pipeline E2E resolvendo partida (replay) automaticamente
- [ ] E5.3 Texto de submissão — ângulo: settlement trust-minimized via TxLINE (dados timestampados on-chain, validation proofs)
- [ ] E5.4 Submeter no Earn (meta: 16–17/07)

## E6 — Stretch goals (SÓ após E5 submetido e SÓ se o dev pedir)
- [ ] E6.1 Verificação de validation proof do TxLINE on-chain no `settle_market`
- [ ] E6.2 Bot de liquidez / trading agent

---

## Mapeamento cronograma → épicos
| Dias | Épicos |
|---|---|
| 03–04/07 | E0 + E1 |
| 05–08/07 | E2 |
| 09–11/07 | E3 |
| 12–14/07 | E4 |
| 15–16/07 | E5 (**submeter 16–17/07**) |
| 17–18/07 | E6 / buffer |
