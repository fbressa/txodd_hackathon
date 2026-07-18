// E4 — página única: lista mercados, aposta SIM/NÃO, claim. Funcional > bonito.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Connection, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
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

const fmtSol = (l: bigint) => `${(Number(l) / LAMPORTS_PER_SOL).toFixed(3)} SOL`;
const fmtDate = (s: number) => new Date(s * 1000).toLocaleString();

type Status = "Aberto" | "Travado" | "Resolvido";
const statusOf = (m: Market): Status =>
  m.settled ? "Resolvido" : Date.now() / 1000 >= m.deadline ? "Travado" : "Aberto";

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
  const status = statusOf(market);
  const total = market.poolSim + market.poolNao;

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

  const claim = () =>
    act(() => new Transaction().add(claimIx(publicKey!, market.address)));

  const won =
    position && market.settled && market.outcome !== null && position.side === market.outcome;

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>Partida (fixture TxLINE) #{market.matchId.toString()}</strong>
        <span>
          {status}
          {market.settled && market.outcome !== null && ` — ${market.outcome ? "SIM" : "NÃO"}`}
        </span>
      </div>
      <div style={{ fontSize: 14, color: "#555", margin: "6px 0" }}>
        Mercado: o mandante vence? · deadline (kickoff): {fmtDate(market.deadline)}
      </div>
      <div style={{ margin: "6px 0" }}>
        Pool SIM: {fmtSol(market.poolSim)} · Pool NÃO: {fmtSol(market.poolNao)} · Total: {fmtSol(total)}
      </div>
      {position && (
        <div style={{ margin: "6px 0", fontSize: 14 }}>
          Sua posição: {fmtSol(position.stake)} no {position.side ? "SIM" : "NÃO"}
          {position.claimed && " (pago)"}
        </div>
      )}
      {publicKey && status === "Aberto" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: 90 }}
          />
          <span>SOL</span>
          <button disabled={busy} onClick={() => bet(true)}>Apostar SIM</button>
          <button disabled={busy} onClick={() => bet(false)}>Apostar NÃO</button>
        </div>
      )}
      {won && !position!.claimed && (
        <button disabled={busy} onClick={claim} style={{ marginTop: 8 }}>
          Resgatar prêmio
        </button>
      )}
    </div>
  );
}

function Page() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
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
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>⚽ World Cup Prediction Market</h1>
        <WalletMultiButton />
      </div>
      <p style={{ color: "#555", fontSize: 14 }}>
        Parimutuel em Solana devnet, settlement automático via feed TxLINE.
        SIM = mandante vence (empate conta como NÃO).
      </p>
      {error && <div style={{ color: "#b00", margin: "8px 0" }}>{error}</div>}
      {markets.length === 0 && <p>Nenhum mercado on-chain ainda.</p>}
      {markets.map((m) => (
        <MarketCard
          key={m.address.toBase58()}
          market={m}
          position={positions.find((p) => p.market.equals(m.address))}
          onAction={onAction}
        />
      ))}
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
