// E4 — página única: lista mercados, aposta SIM/NÃO, claim.
import { useCallback, useEffect, useMemo, useState } from "react";
import { LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";
import fixturesJson from "./fixtures.json";
import {
  Market,
  Position,
  PROGRAM_ID,
  RPC_URL,
  claimIx,
  decodeMarket,
  decodePosition,
  placeBetIx,
} from "./chain";

interface FixtureInfo { home: string; away: string; kickoff: number; competition: string }
const FIXTURES: Record<string, FixtureInfo> = fixturesJson;

const MIN_BET = 0.001;
const FEE_BUFFER = 0.005; // sobra p/ taxas de rede + rent da posição

const sol = (l: bigint) => (Number(l) / LAMPORTS_PER_SOL).toFixed(3).replace(/\.?0+$/, "");
const fmtDate = (s: number) =>
  new Date(s * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Status = "open" | "locked" | "settled";
const statusOf = (m: Market, nowMs: number): Status =>
  m.settled ? "settled" : nowMs / 1000 >= m.deadline ? "locked" : "open";

// Heurística 9: erros da carteira/programa traduzidos para linguagem humana
const ERROR_MAP: Array<[RegExp, string]> = [
  [/User rejected/i, "Transação cancelada na carteira — nada foi enviado."],
  [/0x1772|DeadlinePassed/, "As apostas desta partida já fecharam (kickoff atingido)."],
  [/0x1775|SideMismatch/, "Você já tem posição no outro lado deste mercado — não dá para trocar de lado."],
  [/0x1777|AlreadyClaimed/, "Este prêmio já foi resgatado."],
  [/0x1778|NotWinner/, "Sua posição não está no lado vencedor."],
  [/0x1771|MarketNotOpen/, "Este mercado não aceita mais apostas."],
  [/0x1776|MarketNotSettled/, "O mercado ainda não foi resolvido — aguarde o fim do jogo."],
  [/insufficient|debit an account|0x1$/i, "Saldo insuficiente. Em devnet, pegue SOL de teste em faucet.solana.com."],
];
const humanError = (raw: string): string => {
  for (const [re, msg] of ERROR_MAP) if (re.test(raw)) return msg;
  return `Algo deu errado: ${raw.slice(0, 160)}`;
};

/** tick para countdowns (heurística 1: visibilidade de status) */
function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function countdown(deadline: number, nowMs: number): string {
  const s = deadline - Math.floor(nowMs / 1000);
  if (s <= 0) return "fechado";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `fecha em ${d}d ${h}h`;
  if (h > 0) return `fecha em ${h}h ${m}min`;
  if (m > 0) return `fecha em ${m}min`;
  return "fecha em menos de 1min";
}

function multiplier(m: Market, side: boolean): string {
  const pool = side ? m.poolSim : m.poolNao;
  if (pool === 0n) return "—";
  return `×${(Number(m.poolSim + m.poolNao) / Number(pool)).toFixed(2)}`;
}

interface Toast { kind: "info" | "success" | "error"; msg: string; sig?: string }

function StatusBadge({ market, nowMs }: { market: Market; nowMs: number }) {
  const st = statusOf(market, nowMs);
  if (st === "open") return <span className="badge open">apostas abertas</span>;
  if (st === "locked") return <span className="badge locked">em jogo · travado</span>;
  return market.outcome ? (
    <span className="badge sim">resolvido · SIM</span>
  ) : (
    <span className="badge nao">resolvido · NÃO</span>
  );
}

function MarketCard({
  market,
  position,
  balance,
  nowMs,
  onAction,
}: {
  market: Market;
  position?: Position;
  balance: number | null;
  nowMs: number;
  onAction: (build: () => Transaction, okMsg: string) => Promise<boolean>;
}) {
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState("0.05");
  const [pendingSide, setPendingSide] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const st = statusOf(market, nowMs);
  const fx = FIXTURES[market.matchId.toString()];
  const home = fx?.home ?? `Mandante (fixture ${market.matchId})`;
  const away = fx?.away ?? "Visitante";
  const total = market.poolSim + market.poolNao;
  const simPct = total > 0n ? Number((market.poolSim * 100n) / total) : 50;

  // Heurística 5: prevenção de erro — validação antes de assinar
  const amt = parseFloat(amount);
  const amountInvalid = isNaN(amt) || amt < MIN_BET;
  const noFunds = balance !== null && !isNaN(amt) && amt + FEE_BUFFER > balance;
  const lockedSide = position ? position.side : null; // não pode trocar de lado

  // Heurística 3: confirmação com o resultado projetado antes de enviar
  const projPayout = (side: boolean): string => {
    if (isNaN(amt) || amt <= 0) return "—";
    const lam = BigInt(Math.round(amt * LAMPORTS_PER_SOL));
    const myStake = (position && position.side === side ? position.stake : 0n) + lam;
    const poolSide = (side ? market.poolSim : market.poolNao) + lam;
    const tot = total + lam;
    return sol((myStake * tot) / poolSide);
  };

  const doBet = async (side: boolean) => {
    setBusy(true);
    const lam = BigInt(Math.round(amt * LAMPORTS_PER_SOL));
    const ok = await onAction(
      () => new Transaction().add(placeBetIx(publicKey!, market.address, side, lam)),
      `Aposta de ${amt} SOL no ${side ? "SIM" : "NÃO"} confirmada!`
    );
    if (ok) setPendingSide(null);
    setBusy(false);
  };

  const doClaim = async () => {
    setBusy(true);
    await onAction(
      () => new Transaction().add(claimIx(publicKey!, market.address)),
      "Prêmio resgatado — SOL na sua carteira!"
    );
    setBusy(false);
  };

  const won =
    position && market.settled && market.outcome !== null && position.side === market.outcome;
  const payout =
    position && won && (market.outcome ? market.poolSim : market.poolNao) > 0n
      ? (position.stake * total) / (market.outcome ? market.poolSim : market.poolNao)
      : 0n;

  return (
    <div className="card">
      <div className="card-head">
        <div className="match">
          {home} × {away}
          {fx && <span className="comp">{fx.competition}</span>}
        </div>
        <StatusBadge market={market} nowMs={nowMs} />
      </div>
      <div className="question">
        Mercado: <b>o {home} (mandante) vence?</b> — empate ou vitória do {away} conta como NÃO
      </div>
      <div className="kickoff">
        Kickoff: {fmtDate(market.deadline)}
        {st === "open" && <span className="countdown"> · {countdown(market.deadline, nowMs)}</span>}
      </div>

      <div className="poolbar" title={`SIM ${sol(market.poolSim)} SOL · NÃO ${sol(market.poolNao)} SOL`}>
        <div className="sim" style={{ width: `${simPct}%` }} />
        <div className="nao" style={{ width: `${100 - simPct}%` }} />
      </div>
      <div className="pool-legend">
        <span>
          <span className="side-sim">SIM {sol(market.poolSim)} SOL</span>{" "}
          <span className="mult">{multiplier(market, true)}</span>
        </span>
        <span className="mult">pote total {sol(total)} SOL</span>
        <span>
          <span className="mult">{multiplier(market, false)}</span>{" "}
          <span className="side-nao">NÃO {sol(market.poolNao)} SOL</span>
        </span>
      </div>

      {position && (
        <div className="position">
          Sua posição: <b>{sol(position.stake)} SOL no {position.side ? "SIM" : "NÃO"}</b>
          {market.settled &&
            (position.claimed ? (
              <span className="win"> — prêmio resgatado ✓</span>
            ) : won ? (
              <span className="win"> — você venceu! Prêmio: {sol(payout)} SOL</span>
            ) : (
              <span className="lose"> — não foi dessa vez</span>
            ))}
        </div>
      )}

      {publicKey && st === "open" && pendingSide === null && (
        <>
          <div className="controls">
            <input
              type="number"
              min={MIN_BET}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="valor da aposta em SOL"
              aria-invalid={amountInvalid || noFunds}
            />
            <div className="chips" role="group" aria-label="valores rápidos">
              {["0.01", "0.05", "0.1"].map((v) => (
                <button key={v} className="chip" onClick={() => setAmount(v)}>
                  {v}
                </button>
              ))}
            </div>
            <button
              className="btn sim"
              disabled={busy || amountInvalid || noFunds || lockedSide === false}
              title={lockedSide === false ? "Você já apostou no NÃO — não dá para trocar de lado" : undefined}
              onClick={() => setPendingSide(true)}
            >
              SIM {multiplier(market, true)}
            </button>
            <button
              className="btn nao"
              disabled={busy || amountInvalid || noFunds || lockedSide === true}
              title={lockedSide === true ? "Você já apostou no SIM — não dá para trocar de lado" : undefined}
              onClick={() => setPendingSide(false)}
            >
              NÃO {multiplier(market, false)}
            </button>
          </div>
          {amountInvalid && <div className="hint warn">Valor mínimo: {MIN_BET} SOL.</div>}
          {!amountInvalid && noFunds && (
            <div className="hint warn">
              Saldo insuficiente ({balance?.toFixed(3)} SOL). Pegue SOL de teste em faucet.solana.com.
            </div>
          )}
          {!amountInvalid && !noFunds && lockedSide !== null && (
            <div className="hint">
              Você já tem posição no {lockedSide ? "SIM" : "NÃO"} — apostas novas somam nesse lado.
            </div>
          )}
          {!amountInvalid && !noFunds && lockedSide === null && (
            <div className="hint">
              Parimutuel: vencedores dividem o pote todo, proporcional à aposta. O multiplicador
              é o retorno com o pote atual.
            </div>
          )}
        </>
      )}

      {publicKey && st === "open" && pendingSide !== null && (
        <div className="confirm" role="alertdialog" aria-label="confirmar aposta">
          <div className="confirm-text">
            Apostar <b>{amt} SOL</b> no <b className={pendingSide ? "side-sim" : "side-nao"}>{pendingSide ? "SIM" : "NÃO"}</b> ({pendingSide ? home : `${away} ou empate`}).
            Se vencer, você resgata ~<b>{projPayout(pendingSide)} SOL</b>. Apostas não podem ser
            canceladas depois de confirmadas.
          </div>
          <div className="controls">
            <button className={`btn ${pendingSide ? "sim" : "nao"}`} disabled={busy} onClick={() => doBet(pendingSide)}>
              {busy ? "Enviando…" : "Confirmar aposta"}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setPendingSide(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {publicKey && won && !position!.claimed && (
        <div className="controls">
          <button className="btn claim" disabled={busy} onClick={doClaim}>
            {busy ? "Enviando…" : `🏆 Resgatar ${sol(payout)} SOL`}
          </button>
        </div>
      )}

      {!publicKey && st === "open" && (
        <div className="connect-cta">Conecte a carteira (botão no topo) para apostar.</div>
      )}
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="howto">
      <div className="step">
        <b><span className="num">1</span>Aposte</b>
        Escolha uma partida e aposte SOL em <b>SIM</b> (mandante vence) ou <b>NÃO</b>
        (empate/visitante). Seus fundos vão para um cofre on-chain.
      </div>
      <div className="step">
        <b><span className="num">2</span>Trava no kickoff</b>
        Quando a bola rola, o mercado trava — ninguém mais entra.
      </div>
      <div className="step">
        <b><span className="num">3</span>Settlement automático</b>
        O placar final vem do feed TxLINE (timestampado on-chain pela TxODDS) e
        resolve o mercado sem intervenção humana.
      </div>
      <div className="step">
        <b><span className="num">4</span>Resgate</b>
        Acertou? Os vencedores dividem <b>o pote inteiro</b>, proporcional ao
        que cada um apostou. Resgate direto na sua carteira.
      </div>
    </div>
  );
}

function Page() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const nowMs = useNow(30_000);

  const refresh = useCallback(async () => {
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID);
      const ms: Market[] = [];
      const ps: Position[] = [];
      for (const { pubkey, account } of accounts) {
        const m = decodeMarket(pubkey, account.data);
        if (m) ms.push(m);
        const p = decodePosition(pubkey, account.data);
        if (p) ps.push(p);
      }
      setMarkets(ms);
      setPositions(publicKey ? ps.filter((p) => p.bettor.equals(publicKey)) : []);
      if (publicKey) {
        setBalance((await connection.getBalance(publicKey)) / LAMPORTS_PER_SOL);
      } else {
        setBalance(null);
      }
    } catch (e: any) {
      setToast({ kind: "error", msg: humanError(String(e.message ?? e)) });
    } finally {
      setLoaded(true);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  // Heurística 1: cada etapa da transação visível; sucesso com link do explorer
  const onAction = async (build: () => Transaction, okMsg: string): Promise<boolean> => {
    try {
      setToast({ kind: "info", msg: "Aprove a transação na sua carteira…" });
      const sig = await sendTransaction(build(), connection);
      setToast({ kind: "info", msg: "Enviada — confirmando na devnet…" });
      await connection.confirmTransaction(sig, "confirmed");
      setToast({ kind: "success", msg: okMsg, sig });
      await refresh();
      return true;
    } catch (e: any) {
      setToast({ kind: "error", msg: humanError(String(e.message ?? e)) });
      return false;
    }
  };

  // Heurística 8: abertos primeiro (fechando mais cedo no topo), depois em jogo, depois resolvidos
  const groups = useMemo(() => {
    const open = markets.filter((m) => statusOf(m, nowMs) === "open").sort((a, b) => a.deadline - b.deadline);
    const locked = markets.filter((m) => statusOf(m, nowMs) === "locked").sort((a, b) => b.deadline - a.deadline);
    const settled = markets.filter((m) => statusOf(m, nowMs) === "settled").sort((a, b) => b.deadline - a.deadline);
    return { open, locked, settled };
  }, [markets, nowMs]);

  const renderGroup = (title: string, list: Market[]) =>
    list.length > 0 && (
      <>
        <h2 className="section-h">{title}</h2>
        {list.map((m) => (
          <MarketCard
            key={m.address.toBase58()}
            market={m}
            position={positions.find((p) => p.market.equals(m.address))}
            balance={balance}
            nowMs={nowMs}
            onAction={onAction}
          />
        ))}
      </>
    );

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          <h1>
            ⚽ Palpite da Copa
            <span className="devnet-pill">DEVNET</span>
          </h1>
          <div className="tagline">
            Mercado de previsão parimutuel em Solana · settlement automático via feed TxLINE
          </div>
        </div>
        <div className="wallet-area">
          {balance !== null && (
            <span className="balance" title="saldo da carteira (devnet)">
              {balance.toFixed(3)} SOL
            </span>
          )}
          <WalletMultiButton />
        </div>
      </div>

      <HowItWorks />

      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          <span>
            {toast.msg}{" "}
            {toast.sig && (
              <a
                href={`https://explorer.solana.com/tx/${toast.sig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                ver transação
              </a>
            )}
          </span>
          <button className="close-x" aria-label="fechar aviso" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}

      {!loaded && <div className="empty">Carregando mercados da devnet…</div>}
      {loaded && markets.length === 0 && <div className="empty">Nenhum mercado on-chain ainda.</div>}

      {renderGroup("Apostas abertas", groups.open)}
      {renderGroup("Em andamento", groups.locked)}
      {renderGroup("Resolvidos", groups.settled)}

      <div className="footer">
        Programa:{" "}
        <a
          href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
        >
          {PROGRAM_ID.toBase58()}
        </a>
        <br />
        Rede de teste (devnet) — SOL sem valor real; pegue o seu em{" "}
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>
        <br />
        Dados de partidas e placares: TxLINE (TxODDS) ·{" "}
        <a href="https://github.com/fbressa/txodd_hackathon" target="_blank" rel="noreferrer">
          código
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const wallets = useMemo(() => [], []); // Wallet Standard: Phantom etc. auto-detectados
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Page />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
