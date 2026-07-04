# BRIEFING — World Cup Hackathon · Trilha Prediction Markets & Settlement

> Contexto completo do projeto. O resumo operacional está no CLAUDE.md da raiz.
> Última atualização: 03/07/2026.

## 1. O hackathon

- **Organização:** TxODDS + Solana, hospedado exclusivamente no Superteam Earn.
- **Premiação total:** US$ 50k em 3 trilhas. A nossa:
  **Prediction Markets & Settlement — 18.000 USDT** (12k / 4k / 2k),
  a maior das três e chamada de "flagship track" pela Superteam.
- **Deadline de submissão:** 19/07/2026. **Anúncio dos vencedores:** 29/07/2026.
- **Meta interna:** submeter em 16–17/07 (margem de 2–3 dias para imprevistos).
- **Concorrência observada em 03/07:** ~13 submissões na trilha (baixa).
- **Elegibilidade:** individuais, times e agentes de IA. Participação solo OK.
- **Requisito central:** build funcional ou app live em testnet usando dados
  do TxLINE como **input primário**. Protótipo conceitual não qualifica.
- **Plágio:** >15% = desqualificação (regra do Earn).
- **Dúvidas:** grupo Telegram TxLINEChat (fonte de detalhes de API e
  sinalizações do que os jurados valorizam — monitorar durante o hackathon).

## 2. O produto (MVP)

Mercado de previsão binário para partidas da Copa 2026, modelo parimutuel,
com settlement automático a partir do feed TxLINE.

### Programa Anchor — instruções
| Instrução | O que faz |
|---|---|
| `create_market` | Cria mercado p/ partida (PDA seed = match_id TxLINE), define deadline de apostas (kickoff), estado inicial Open. |
| `place_bet` | Aposta em SIM ou NÃO; fundos vão para vault PDA (padrão escrow); cria/atualiza conta de posição do apostador. Rejeitar após deadline. |
| `settle_market` | Grava resultado on-chain e muda estado para Settled. Fase 1: autoridade assina. Stretch: verificar validation proof do TxLINE on-chain. |
| `claim` | Vencedor saca payout proporcional: `stake * pool_total / pool_vencedor`. |

### Estados do mercado
`Open` (apostas abertas) → `Locked` (kickoff atingido) → `Settled` (resolvido).

### Settlement service (TypeScript)
- Consome endpoint de scores do TxLINE (snapshot/stream).
- Detecta partida finalizada → determina outcome → chama `settle_market`.
- Em dev/teste: usar **historical replay** (incluso no free tier) para
  reproduzir partidas passadas — testes determinísticos, sem esperar jogo ao vivo.

### Frontend
Página única: lista de mercados, apostar SIM/NÃO, ver estado, claim.
Sem firula. Wallet adapter padrão.

## 3. Fora do escopo (NÃO implementar sem pedido explícito)
- Orderbook, AMM, odds dinâmicas, market making
- Múltiplos outcomes (empate como 3º resultado)
- Mainnet, mobile, token próprio
- Trading agent / bot de liquidez (stretch goal documentado, camada 2)

## 4. TxLINE — fatos essenciais

### Acesso gratuito
- **Service Level 1:** Copa + amistosos, delay 60s — free, documentado em devnet.
- **Service Level 12:** tempo real — free, mas documentado só em mainnet.
- Para settlement pós-jogo, delay de 60s é irrelevante. **Usar SL 1 em devnet.**
- Assinatura dura 4 semanas, renovável de graça. Sem cartão, sem token TxL.

### Fluxo de autenticação (é uma tx Anchor!)
1. `subscribe(service_level, duration_weeks)` no programa txoracle (devnet).
2. `POST /auth/guest/start` → JWT de convidado.
3. Assinar `${txSig}::${jwt}` com a wallet → `POST /api/token/activate`.
4. Toda chamada: headers `Authorization: Bearer <jwt>` + `X-Api-Token: <token>`.

### Redes (NUNCA misturar)
| | Devnet | Mainnet |
|---|---|---|
| API host | txline-dev.txodds.com | txline.txodds.com |
| Programa txoracle | 6pW64gN1... (confirmar na doc) | 9ExbZjAa... (confirmar na doc) |

### Endpoints
- **Fixtures:** partidas/agenda da Copa (104 jogos cobertos).
- **Odds:** snapshot, histórico, stream.
- **Scores:** snapshot, histórico, stream ← base do settlement.
- **Validation proofs:** provas de fixture/odds/score para validação on-chain
  ← diferencial da submissão (settlement trust-minimized). Começar com
  autoridade assinando o settle; evoluir para verificação da prova como stretch.
- TxLINE timestampa todo pacote de dados na Solana → trilha de auditoria
  à prova de adulteração (citar na submissão).
- Índice completo da doc (incl. IDL/types do txoracle):
  https://txline-docs.txodds.com/llms.txt

## 5. Cronograma (03/07 → 19/07)

| Dias | Entrega |
|---|---|
| 1–2 (03–04/07) | Credenciais TxLINE: script `subscribe.ts` (keypair devnet + airdrop + subscribe + activate + GET fixtures no terminal). `anchor init`. |
| 3–6 (05–08/07) | Programa Anchor completo (4 instruções) + testes locais com resultado mockado. |
| 7–9 (09–11/07) | Settlement service TxLINE → programa em devnet. 1ª resolução E2E com dados reais/replay. |
| 10–12 (12–14/07) | Frontend mínimo + deploy estável em devnet. |
| 13–14 (15–16/07) | Vídeo demo, README, texto de submissão. **Submeter 16–17/07.** |
| 15–16 (17–18/07) | Buffer / stretch goals (validation proof on-chain; bot de liquidez). |

**Racional do cronograma:** o risco desconhecido é a API do TxLINE (nunca
usada), não o Anchor (voting + escrow já construídos). Por isso a API vem
primeiro — se houver problema, descobrimos com 15 dias de margem.

## 6. Ativos existentes do dev
- Programa de voting on-chain (Anchor) — Solana Bootcamp 2026.
- Contrato de escrow (Anchor) — Solana Bootcamp 2026.
- Experiência com PDAs, testes em devnet, TypeScript, Rust, C++.

## 7. Ângulo da submissão
"Mercado de previsão com settlement trust-minimized: o resultado não depende
da palavra de um operador — vem do feed TxLINE, timestampado on-chain, com
provas de validação verificáveis." Demonstrar o pipeline E2E resolvendo um
jogo real da Copa (ou replay) automaticamente, sem intervenção humana.
