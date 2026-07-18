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

const sol = (l: bigint) => (Number(l) / LAMPORTS_PER_SOL).toFixed(3).replace(/\.?0+$/, "");
const fmtDate = (s: number) =>
  new Date(s * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Status = "open" | "locked" | "settled";
const statusOf = (m: Market): Status =>
  m.settled ? "settled" : Date.now() / 1000 >= m.deadline ? "locked" : "open";

/** multiplicador parimutuel corrente do lado: total / pool do lado */
function multiplier(m: Market, side: boolean): string {
  const pool = side ? m.poolSim : m.poolNao;
  if (pool === 0n) return "—";
  const x = Number(m.poolSim + m.poolNao) / Number(pool);
  return `×${x.toFixed(2)}`;
}

function StatusBadge({ market }: { market: Market }) {
  const st = statusOf(market);
  if (st === "open") return <span className="badge open">APOSTAS ABERTAS</span>;
  if (st === "locked") return <span className="badge locked">EM JOGO · TRAVADO</span>;
  return market.outcome ? (
    <span className="badge sim">RESOLVIDO · SIM</span>
  ) : (
    <span className="badge nao">RESOLVIDO · NÃO</span>
  );
}

function MarketCard({
  market,
  position,
  onAction,
}: {
  market: Market;
  position?: Position;
  onAction: (build: () => Transaction) => Promise<void>;
}) {
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState("0.05");
  const [busy, setBusy] = useState(false);
  const st = statusOf(market);
  const fx = FIXTURES[market.matchId.toString()];
  const home = fx?.home ?? `Mandante (fixture ${market.matchId})`;
  const away = fx?.away ?? "Visitante";
  const total = market.poolSim + market.poolNao;
  const simPct = total > 0n ? Number((market.poolSim * 100n) / total) : 50;

  const act = async (build: () => Transaction) => {
    setBusy(true);
    try {
      await onAction(build);
    } finally {
      setBusy(false);
    }
  };

  const bet = (side: boolean) => {
    const lamports = BigInt(Math.round(parseFloat(amount) * LAMPORTS_PER_SOL));
    return act(() => new Transaction().add(placeBetIx(publicKey!, market.address, side, lamports)));
  };
  const claim = () => act(() => new Transaction().add(claimIx(publicKey!, market.address)));

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
        <StatusBadge market={market} />
      </div>
      <div className="question">
        Mercado: <b>o {home} (mandante) vence?</b> — empate ou vitória do {away} conta como NÃO
      </div>
      <div className="kickoff">
        {st === "open" ? "Apostas até o kickoff: " : "Kickoff: "}
        {fmtDate(market.deadline)}
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

      {publicKey && st === "open" && (
        <>
          <div className="controls">
            <input
              type="number"
              min="0.001"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="valor em SOL"
            />
            <button className="btn sim" disabled={busy} onClick={() => bet(true)}>
              SIM {multiplier(market, true)}
            </button>
            <button className="btn nao" disabled={busy} onClick={() => bet(false)}>
              NÃO {multiplier(market, false)}
            </button>
          </div>
          <div className="hint">
            Valor em SOL (devnet). O multiplicador é o retorno se o pote não mudar —
            parimutuel: vencedores dividem o pote todo, proporcional à aposta.
          </div>
        </>
      )}

      {publicKey && won && !position!.claimed && (
        <div className="controls">
          <button className="btn claim" disabled={busy} onClick={claim}>
            🏆 Resgatar {sol(payout)} SOL
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

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
      ms.sort((a, b) => b.deadline - a.deadline);
      setMarkets(ms);
      setPositions(publicKey ? ps.filter((p) => p.bettor.equals(publicKey)) : []);
      setError("");
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setLoaded(true);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const onAction = async (build: () => Transaction) => {
    try {
      const sig = await sendTransaction(build(), connection);
      await connection.confirmTransaction(sig, "confirmed");
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

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
        <WalletMultiButton />
      </div>

      <HowItWorks />

      {error && <div className="error">{error}</div>}
      {!loaded && <div className="empty">Carregando mercados da devnet…</div>}
      {loaded && markets.length === 0 && (
        <div className="empty">Nenhum mercado on-chain ainda.</div>
      )}
      {markets.map((m) => (
        <MarketCard
          key={m.address.toBase58()}
          market={m}
          position={positions.find((p) => p.market.equals(m.address))}
          onAction={onAction}
        />
      ))}

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
        Dados de partidas e placares: TxLINE (TxODDS) · rede: Solana devnet ·{" "}
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
