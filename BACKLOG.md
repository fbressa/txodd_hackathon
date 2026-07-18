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
- [x] E0.4 Keypair devnet dedicada (`BHpiHXaARUP1hzYbxsA8cTewTjE23D1YRg94hbuJD7mo`) — 30 SOL via faucet

> **Nota (04/07):** repo vive em `~/txodd` no **WSL Ubuntu** (builds rápidos,
> fora do OneDrive). Anchor 1.0.1: template usa testes em **Rust**
> (`cargo test`, `programs/prediction_market/tests/`), não ts-mocha.

## E1 — Credenciais TxLINE (risco desconhecido — fazer primeiro)
**Critério de saída:** `npx ts-node service/subscribe.ts` imprime fixtures da Copa no terminal usando a API devnet.

- [x] E1.1 Program ID txoracle devnet: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
- [x] E1.2 Script `subscribe.ts` (tx subscribe SL 1 / 4 semanas — exige criar ATA Token-2022 do user na mesma tx)
- [x] E1.3 Auth completa (activate retorna token em texto puro, não JSON)
- [x] E1.4 GET fixtures OK — Copa = CompetitionId 72; 10 fixtures no devnet em 05/07
- [x] E1.5 `docs/txline-notas.md` com formatos reais (fixture, score event, SSE)

> **Pendência E1 — RESOLVIDA (17/07):** fim de partida = evento `game_finalised`
> (`StatusId: 100`) com placar final em `Score.*.Total.Goals` (`GameState` não muda,
> não usar). Replay: `interval` = fatia de 5min a partir de `hourOfDay`.
> Detalhes em `docs/txline-notas.md`.

## E2 — Programa Anchor (4 instruções)
**Critério de saída:** `anchor test` verde cobrindo fluxo feliz + rejeições de segurança, com resultado mockado.

- [x] E2.1 Contas/PDAs: `Market` (seed: match_id TxLINE), `Vault`, `Position` (por apostador); enum de estado Open → Locked → Settled
- [x] E2.2 `create_market`: cria PDA, define deadline (kickoff), estado Open
- [x] E2.3 `place_bet`: aposta SIM/NÃO → vault; cria/atualiza Position; rejeita após deadline
- [x] E2.4 `settle_market`: autoridade assina; grava outcome; estado Settled
- [x] E2.5 `claim`: payout `stake * pool_total / pool_vencedor`; só vencedor, só uma vez
- [x] E2.6 Testes de segurança: signer errado, mercado no estado errado, aposta após deadline, claim duplo, claim de perdedor
- [x] E2.7 Deploy em devnet — Program ID `FwFokFQm1uFrnvrSXKvTATXf2VY8GKnSoUpBrU5WWA85` (slot 476979228)

> **Nota (17/07):** `Locked` não é variante armazenada — derivado de `now >= deadline`
> (decisão do ARQUITETURA.md). `outcome: Option<bool>` (true = SIM). Apostador não
> troca de lado (aposta repetida soma stake). Vault recebe rent-exempt mínimo no
> `create_market` para o último claim não deixar dust abaixo do rent. 12 testes litesvm verdes.

## E3 — Settlement service (TypeScript)
**Critério de saída:** partida do historical replay é resolvida E2E em devnet sem intervenção manual (create → bet → settle → claim).

- [x] E3.1 Cliente TxLINE: auth (reusar E1) + consumo do endpoint de scores (snapshot/stream)
- [x] E3.2 Detecção de fim de partida → determinar outcome (`game_finalised`, SIM = mandante vence, empate = NÃO)
- [x] E3.3 Chamar `settle_market` no programa em devnet
- [x] E3.4 Teste E2E com historical replay (determinístico, free tier)

> **Nota (17/07):** E2E rodado em devnet com fixture real 18187298 (Brazil 1x2 Norway):
> create → bets SIM/NÃO → settle via replay → claim 0.08 SOL exato + NotWinner p/ perdedor.
> `service/`: `txline.ts` (client), `program.ts` (ix helpers), `settle.ts` (detecção
> replay/polling + settle), `e2e.ts`. Reexecutar E2E exige `--match-id` novo (PDA único).
> No WSL, `npm` exige shell interativo (`bash -ic`) — node vem do nvm.

## E4 — Frontend mínimo
**Critério de saída:** no browser contra devnet: listar mercados, apostar, ver estado, claim — com wallet adapter.

- [x] E4.1 Scaffold (página única) + wallet adapter padrão
- [x] E4.2 Listar mercados (estado, pools, deadline)
- [x] E4.3 Apostar SIM/NÃO
- [x] E4.4 Claim para vencedores
- [x] E4.5 Deploy estável — GitHub Pages: https://fbressa.github.io/txodd_hackathon/ (workflow no push p/ master)

> **Nota (18/07):** `app/` = Vite + React 19, Wallet Standard (Phantom auto-detectado).
> Decode manual das contas (sem client TS do Anchor); mesmas instruções byte-a-byte
> do service validado E2E. Verificado no browser contra devnet: listagem, estado
> derivado (Aberto/Travado/Resolvido), pools. **Falta teste manual com Phantom**
> (apostar/claim assinando de verdade) — caminho on-chain já validado via e2e.ts.

## E5 — Submissão
**Critério de saída:** submissão publicada no Superteam Earn até 17/07.

- [x] E5.1 README: arquitetura, como rodar, endereços devnet
- [ ] E5.2 Vídeo demo: pipeline E2E resolvendo partida (replay) automaticamente — **dev grava** (roteiro em docs/submissao.md)
- [x] E5.3 Texto de submissão — rascunho em docs/submissao.md (links TODO: repo público, app hospedado, vídeo)
- [ ] E5.4 Submeter no Earn — **bloqueado só pelo vídeo (E5.2)**; repo público ✅ (fbressa/txodd_hackathon) e hosting ✅

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
