# CLAUDE.md — Prediction Market · World Cup Hackathon (TxODDS)

## O projeto
Mercado de previsão binário parimutuel em Solana (Anchor/Rust) com settlement
automático via feed TxLINE. Submissão para a trilha "Prediction Markets and
Settlement" do World Cup Hackathon (Superteam Earn). **Deadline: 19/07/2026**
(meta interna: submeter 16–17/07). Contexto completo em @BRIEFING.md.

## Backlog
O plano de execução vive em @BACKLOG.md — **sempre siga o backlog**:
- Trabalhe na ordem dos épicos; só avance quando o critério de saída do épico
  atual estiver verde.
- Ao concluir uma tarefa, atualize o status dela no BACKLOG.md na hora.
- Pedidos fora do backlog: sinalize o desvio antes de implementar.
- Se o escopo mudar, atualize o BACKLOG.md junto com a mudança.

---

## Como trabalhar (regras comportamentais)

**Tradeoff assumido:** estas regras favorecem cautela sobre velocidade.
Para tarefas triviais, use bom senso.

### 1. Pense antes de codar
- Declare suas premissas explicitamente. Se incerto, pergunte ANTES de implementar.
- Se houver múltiplas interpretações, apresente-as — não escolha em silêncio.
- Se existir abordagem mais simples, diga. Faça pushback quando justificado.
- Neste projeto: dúvidas sobre o formato do feed TxLINE ou regras da trilha
  não se resolvem por suposição — se a doc não responder, o dev pergunta no
  Telegram TxLINEChat. Nunca inventar formato de resposta da API.

### 2. Simplicidade primeiro
- Mínimo de código que resolve o problema. Nada especulativo.
- Sem features além do pedido, sem abstrações para código de uso único,
  sem "flexibilidade" ou "configurabilidade" não solicitada.
- Se escreveu 200 linhas e cabiam em 50, reescreva.
- Neste projeto isso é regra de sobrevivência: prazo de hackathon.
  O escopo do MVP está travado no @docs/BRIEFING.md §2–3.
  NÃO implementar: orderbook, AMM, odds dinâmicas, múltiplos outcomes
  (empate como 3º resultado), mainnet, mobile, trading agent.
  Stretch goals só depois do fluxo E2E funcionar, e só se o dev pedir.
- Teste: "Um engenheiro sênior diria que está overcomplicado?" Se sim, simplifique.

### 3. Mudanças cirúrgicas
- Toque apenas no necessário. Cada linha alterada deve rastrear diretamente
  ao pedido do dev.
- Não "melhore" código adjacente, comentários ou formatação. Não refatore
  o que não está quebrado. Siga o estilo existente.
- Se suas mudanças criarem órfãos (imports/variáveis sem uso), remova-os.
  Código morto pré-existente: mencione, não delete.

### 4. Execução orientada a objetivo
- Transforme tarefas em critérios verificáveis antes de começar:
  - "Adicionar instrução X" → "escrever teste que exercita X, fazê-lo passar"
  - "Corrigir bug" → "teste que reproduz o bug, depois fazê-lo passar"
- Para tarefas multi-etapa, declare um plano breve: passo → verificação.
- Neste projeto, a verificação canônica é `anchor test` verde + fluxo E2E
  em devnet (create → bet → settle via TxLINE replay → claim).

---

## Regras invioláveis do projeto
- **DEVNET em tudo.** Programa próprio, RPC, e stack TxLINE — nunca misturar redes.
  - TxLINE devnet API: `https://txline-dev.txodds.com`
  - TxLINE txoracle program (devnet): começa com `6pW64gN1` (confirmar ID completo na doc)
- O feed TxLINE deve ser **input primário** do produto (requisito da trilha).
- Toda instrução Anchor com checagens de segurança explícitas:
  signer, owner, estado do mercado, deadline.

## Arquitetura (3 componentes)
1. **Programa Anchor** — `create_market`, `place_bet`, `settle_market`, `claim`.
   PDAs: market (seed: match_id TxLINE), vault, position (por apostador).
   Estados: Open → Locked → Settled.
2. **Settlement service (TypeScript)** — consome scores do TxLINE, detecta fim
   de partida, chama `settle_market`. Auth TxLINE: subscribe on-chain →
   JWT guest → activate token → headers `Authorization: Bearer` + `X-Api-Token`.
3. **Frontend mínimo** — listar mercados, apostar, claim. Funcional > bonito.

## Comandos
- Build/testes do programa: `anchor build` / `anchor test`
- Deploy devnet: `anchor deploy --provider.cluster devnet`
- Settlement service: `npm run dev` (em `service/`)

## Convenções
- Testes primeiro com resultado mockado; integração TxLINE real depois,
  usando o **historical replay** do free tier (testes determinísticos).
- Commits pequenos e frequentes; mensagens em inglês.

## Documentação de referência
- TxLINE quickstart: https://txline.txodds.com/documentation/quickstart
- TxLINE World Cup: https://txline.txodds.com/documentation/worldcup
- Índice completo da doc TxLINE: https://txline-docs.txodds.com/llms.txt
- Trilha no Earn: https://superteam.fun/earn/listing/prediction-markets-and-settlement/