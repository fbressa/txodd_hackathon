// E4 — página única: lista mercados, aposta SIM/NÃO, claim. i18n EN/PT em i18n.ts.
import { useCallback, useEffect, useMemo, useState } from "react";
import { LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";
import fixturesJson from "./fixtures.json";
import { LangCode, STRINGS, Strings } from "./i18n";
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

type Status = "open" | "locked" | "settled";
const statusOf = (m: Market, nowMs: number): Status =>
  m.settled ? "settled" : nowMs / 1000 >= m.deadline ? "locked" : "open";

const ERROR_KEYS: Array<[RegExp, keyof Strings["errors"]]> = [
  [/User rejected/i, "rejected"],
  [/0x1772|DeadlinePassed/, "deadlinePassed"],
  [/0x1775|SideMismatch/, "sideMismatch"],
  [/0x1777|AlreadyClaimed/, "alreadyClaimed"],
  [/0x1778|NotWinner/, "notWinner"],
  [/0x1771|MarketNotOpen/, "notOpen"],
  [/0x1776|MarketNotSettled/, "notSettled"],
  [/insufficient|debit an account|0x1$/i, "insufficient"],
];
const humanError = (t: Strings, raw: string): string => {
  for (const [re, key] of ERROR_KEYS) if (re.test(raw)) return t.errors[key];
  return t.errWrap(raw.slice(0, 160));
};

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function countdown(t: Strings, deadline: number, nowMs: number): string {
  const s = deadline - Math.floor(nowMs / 1000);
  if (s <= 0) return t.closed;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return t.closesIn(`${d}d ${h}h`);
  if (h > 0) return t.closesIn(`${h}h ${m}min`);
  if (m > 0) return t.closesIn(`${m}min`);
  return t.closesIn("<1min");
}

function multiplier(m: Market, side: boolean): string {
  const pool = side ? m.poolSim : m.poolNao;
  if (pool === 0n) return "";
  return `×${(Number(m.poolSim + m.poolNao) / Number(pool)).toFixed(2)}`;
}

interface Toast { kind: "info" | "success" | "error"; msg: string; sig?: string }

function StatusBadge({ t, market, nowMs }: { t: Strings; market: Market; nowMs: number }) {
  const st = statusOf(market, nowMs);
  if (st === "open") return <span className="badge open">{t.badgeOpen}</span>;
  if (st === "locked") return <span className="badge locked">{t.badgeLocked}</span>;
  return market.outcome ? (
    <span className="badge sim">{t.badgeSettled} · {t.yes}</span>
  ) : (
    <span className="badge nao">{t.badgeSettled} · {t.no}</span>
  );
}

function MarketCard({
  t,
  market,
  position,
  balance,
  nowMs,
  onAction,
}: {
  t: Strings;
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
  const home = fx?.home ?? t.homeFallback(market.matchId.toString());
  const away = fx?.away ?? t.awayFallback;
  const total = market.poolSim + market.poolNao;
  const simPct = total > 0n ? Number((market.poolSim * 100n) / total) : 50;
  const sideName = (side: boolean) => (side ? t.yes : t.no);
  const fmtDate = (s: number) =>
    new Date(s * 1000).toLocaleString(t.locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const amt = parseFloat(amount);
  const amountInvalid = isNaN(amt) || amt < MIN_BET;
  const noFunds = balance !== null && !isNaN(amt) && amt + FEE_BUFFER > balance;
  const lockedSide = position ? position.side : null;

  const projPayout = (side: boolean): string => {
    if (isNaN(amt) || amt <= 0) return "";
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
      t.betOk(amt, sideName(side))
    );
    if (ok) setPendingSide(null);
    setBusy(false);
  };

  const doClaim = async () => {
    setBusy(true);
    await onAction(() => new Transaction().add(claimIx(publicKey!, market.address)), t.claimOk);
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
        <StatusBadge t={t} market={market} nowMs={nowMs} />
      </div>
      <div className="question">
        {t.marketLabel} <b>{t.questionBold(home)}</b> {t.questionRest(away)}
      </div>
      <div className="kickoff">
        {t.kickoff} {fmtDate(market.deadline)}
        {st === "open" && <span className="countdown"> · {countdown(t, market.deadline, nowMs)}</span>}
      </div>

      <div className="poolbar" title={`${t.yes} ${sol(market.poolSim)} SOL · ${t.no} ${sol(market.poolNao)} SOL`}>
        <div className="sim" style={{ width: `${simPct}%` }} />
        <div className="nao" style={{ width: `${100 - simPct}%` }} />
      </div>
      <div className="pool-legend">
        <span>
          <span className="side-sim">{t.yes} {sol(market.poolSim)} SOL</span>{" "}
          <span className="mult">{multiplier(market, true)}</span>
        </span>
        <span className="mult">{t.potTotal(sol(total))}</span>
        <span>
          <span className="mult">{multiplier(market, false)}</span>{" "}
          <span className="side-nao">{t.no} {sol(market.poolNao)} SOL</span>
        </span>
      </div>

      {position && (
        <div className="position">
          {t.position} <b>{t.positionSide(sol(position.stake), sideName(position.side))}</b>
          {market.settled &&
            (position.claimed ? (
              <span className="win">{t.posClaimed}</span>
            ) : won ? (
              <span className="win">{t.posWon(sol(payout))}</span>
            ) : (
              <span className="lose">{t.posLost}</span>
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
              aria-label={t.ariaAmount}
              aria-invalid={amountInvalid || noFunds}
            />
            <div className="chips" role="group" aria-label={t.ariaQuick}>
              {["0.01", "0.05", "0.1"].map((v) => (
                <button key={v} className="chip" onClick={() => setAmount(v)}>
                  {v}
                </button>
              ))}
            </div>
            <button
              className="btn sim"
              disabled={busy || amountInvalid || noFunds || lockedSide === false}
              title={lockedSide === false ? t.noSwitch(t.no) : undefined}
              onClick={() => setPendingSide(true)}
            >
              {t.yes} {multiplier(market, true)}
            </button>
            <button
              className="btn nao"
              disabled={busy || amountInvalid || noFunds || lockedSide === true}
              title={lockedSide === true ? t.noSwitch(t.yes) : undefined}
              onClick={() => setPendingSide(false)}
            >
              {t.no} {multiplier(market, false)}
            </button>
          </div>
          {amountInvalid && <div className="hint warn">{t.minBet(MIN_BET)}</div>}
          {!amountInvalid && noFunds && (
            <div className="hint warn">{t.noFunds(balance!.toFixed(3))}</div>
          )}
          {!amountInvalid && !noFunds && lockedSide !== null && (
            <div className="hint">{t.lockedHint(sideName(lockedSide))}</div>
          )}
          {!amountInvalid && !noFunds && lockedSide === null && (
            <div className="hint">{t.parimutuelHint}</div>
          )}
        </>
      )}

      {publicKey && st === "open" && pendingSide !== null && (
        <div className="confirm" role="alertdialog" aria-label={t.confirmBet}>
          <div className="confirm-text">
            {t.cBet} <b>{amt} SOL</b> {t.cOn}{" "}
            <b className={pendingSide ? "side-sim" : "side-nao"}>{sideName(pendingSide)}</b>{" "}
            ({pendingSide ? home : t.orDraw(away)}). {t.cIfWin} <b>~{projPayout(pendingSide)} SOL</b>.{" "}
            {t.cNoCancel}
          </div>
          <div className="controls">
            <button className={`btn ${pendingSide ? "sim" : "nao"}`} disabled={busy} onClick={() => doBet(pendingSide)}>
              {busy ? t.sending : t.confirmBet}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setPendingSide(null)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {publicKey && won && !position!.claimed && (
        <div className="controls">
          <button className="btn claim" disabled={busy} onClick={doClaim}>
            {busy ? t.sending : t.claimBtn(sol(payout))}
          </button>
        </div>
      )}

      {!publicKey && st === "open" && <div className="connect-cta">{t.connectCta}</div>}

      {st === "settled" && (
        <div className="verify">
          {t.verify(market.matchId.toString())}
          {" · "}
          <a
            href={`https://explorer.solana.com/address/${market.address.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            {t.verifyLink}
          </a>
        </div>
      )}
    </div>
  );
}

function HowItWorks({ t }: { t: Strings }) {
  return (
    <div className="howto">
      {t.steps.map((s, i) => (
        <div className="step" key={i}>
          <b><span className="num">{i + 1}</span>{s.t}</b>
          {s.b}
        </div>
      ))}
    </div>
  );
}

function Page() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [lang, setLang] = useState<LangCode>(
    () => (localStorage.getItem("lang") === "pt" ? "pt" : "en")
  );
  const [markets, setMarkets] = useState<Market[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const nowMs = useNow(30_000);
  const t = STRINGS[lang];

  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

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
      setToast({ kind: "error", msg: humanError(STRINGS[lang], String(e.message ?? e)) });
    } finally {
      setLoaded(true);
    }
  }, [connection, publicKey, lang]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Devnet costuma passar dos 30s do confirmTransaction; insistir mais ~40s
  // consultando o status antes de declarar incerteza.
  const confirmWithRetry = async (sig: string): Promise<boolean> => {
    try {
      await connection.confirmTransaction(sig, "confirmed");
      return true;
    } catch {
      for (let i = 0; i < 8; i++) {
        const st = (await connection.getSignatureStatuses([sig])).value[0];
        if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
          return st.err === null;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      return false;
    }
  };

  const onAction = async (build: () => Transaction, okMsg: string): Promise<boolean> => {
    try {
      setToast({ kind: "info", msg: t.approveTx });
      const sig = await sendTransaction(build(), connection);
      setToast({ kind: "info", msg: t.confirming });
      const ok = await confirmWithRetry(sig);
      await refresh();
      if (!ok) {
        setToast({ kind: "error", msg: t.errors.unconfirmed, sig });
        return false;
      }
      setToast({ kind: "success", msg: okMsg, sig });
      return true;
    } catch (e: any) {
      setToast({ kind: "error", msg: humanError(t, String(e.message ?? e)) });
      return false;
    }
  };

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
            t={t}
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
            {t.title}
            <span className="devnet-pill">DEVNET</span>
          </h1>
          <div className="tagline">{t.tagline}</div>
        </div>
        <div className="wallet-area">
          <div className="lang-switch" role="group" aria-label="language">
            <button
              className={`lang-btn ${lang === "en" ? "active" : ""}`}
              onClick={() => setLang("en")}
            >
              EN
            </button>
            <button
              className={`lang-btn ${lang === "pt" ? "active" : ""}`}
              onClick={() => setLang("pt")}
            >
              PT
            </button>
          </div>
          {balance !== null && (
            <span className="balance" title={t.balanceTitle}>
              {balance.toFixed(3)} SOL
            </span>
          )}
          <WalletMultiButton />
        </div>
      </div>

      <HowItWorks t={t} />

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
                {t.viewTx}
              </a>
            )}
          </span>
          <button className="close-x" aria-label={t.ariaCloseToast} onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}

      {!loaded && <div className="empty">{t.loading}</div>}
      {loaded && markets.length === 0 && <div className="empty">{t.empty}</div>}

      {renderGroup(t.sectionOpen, groups.open)}
      {renderGroup(t.sectionLocked, groups.locked)}
      {renderGroup(t.sectionSettled, groups.settled)}

      <div className="footer">
        {t.program}{" "}
        <a
          href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
        >
          {PROGRAM_ID.toBase58()}
        </a>
        <br />
        {t.testnetLine}{" "}
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>
        <br />
        {t.dataLine} ·{" "}
        <a href="https://github.com/fbressa/txodd_hackathon" target="_blank" rel="noreferrer">
          {t.codeLink}
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
