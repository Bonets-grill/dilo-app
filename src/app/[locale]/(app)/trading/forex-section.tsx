"use client";

import { Link } from "@/i18n/navigation";
import {
  Target,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertTriangle,
  Globe,
  Zap,
} from "lucide-react";

export interface ForexData {
  account: { balance: number; available: number; profit_loss: number; deposit: number };
  positions: Array<{
    instrument_name: string;
    direction: string;
    size: number;
    open_level: number;
    current_bid: number;
    profit_loss: number;
  }>;
  quotes: Array<{
    instrument: string;
    bid: number;
    offer: number;
    change_pct: number;
    low: number;
    high: number;
    market_status: string;
  }>;
  session: string;
  signals: Array<{
    symbol: string;
    side: string;
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    confidence: number;
    outcome: string | null;
    pnl: number | null;
    pnl_pct: number | null;
    market_type: string;
    filters_applied: string[] | null;
    created_at: string;
    resolved_at: string | null;
  }>;
  stats: {
    totalSignals: number;
    wins: number;
    losses: number;
    winRate: number;
    forexWinRate: number;
    goldWinRate: number;
  };
  killZone: string | null;
  learning: {
    score: number;
    marketsAnalyzed: number;
    patternsDetected: number;
  } | null;
}

interface Props {
  data: ForexData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  t: (key: string, values?: Record<string, string>) => string;
}

export default function ForexSection({ data, loading, error, onRetry, t }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-[var(--dim)]" size={20} />
      </div>
    );
  }

  if (error === "forex_unavailable") {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 text-center space-y-2">
        <Globe size={32} className="mx-auto text-[var(--dim)]" />
        <p className="text-sm font-medium">{t("forexUnavailable")}</p>
        <p className="text-xs text-[var(--dim)]">{t("forexUnavailableDesc")}</p>
        <button onClick={onRetry} className="text-xs text-[var(--accent)] underline mt-2">{t("retry")}</button>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 text-center space-y-2">
        <AlertTriangle size={24} className="mx-auto text-yellow-500" />
        <p className="text-sm text-[var(--dim)]">{t("forexErrorLoading")}</p>
        <button onClick={onRetry} className="text-xs text-[var(--accent)] underline">{t("retry")}</button>
      </div>
    );
  }

  const { account, positions, signals, stats, quotes, session, killZone, learning } = data;
  const plPositive = account.profit_loss >= 0;

  return (
    <>
      {/* Session + Kill Zone */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-[var(--dim)]">{session}</span>
        </div>
        {killZone && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/30">
            <Zap size={12} className="text-green-400" />
            <span className="text-[10px] font-medium text-green-400">{t("killZoneActive", { zone: killZone })}</span>
          </div>
        )}
      </div>

      {/* Live Market Quotes */}
      {quotes.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)]">
            <h3 className="text-xs font-semibold text-[var(--dim)] uppercase tracking-wider">Market Overview</h3>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {quotes.map(q => {
              const isGold = q.instrument.includes("XAU");
              const decimals = isGold || q.instrument.includes("JPY") ? 2 : 5;
              const positive = q.change_pct >= 0;
              return (
                <div key={q.instrument} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isGold && <span className="text-yellow-400 text-xs">&#9679;</span>}
                    <div>
                      <p className="text-xs font-semibold">{q.instrument}</p>
                      <p className="text-[10px] text-[var(--dim)]">{q.low.toFixed(decimals)} &mdash; {q.high.toFixed(decimals)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono font-semibold">{q.bid.toFixed(decimals)}</p>
                    <p className={`text-[10px] font-medium ${positive ? "text-green-400" : "text-red-400"}`}>
                      {positive ? "+" : ""}{q.change_pct.toFixed(2)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Account Card */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] text-[var(--dim)] uppercase tracking-wider">{t("igAccount")}</p>
            <p className="text-2xl font-bold mt-0.5">
              &euro;{account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-sm font-semibold ${plPositive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
            {plPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {account.profit_loss >= 0 ? "+" : ""}&euro;{account.profit_loss.toFixed(2)}
          </div>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-[var(--dim)]">
          <span>{t("available")}: &euro;{account.available.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          <span>{t("deposit")}: &euro;{account.deposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 text-center">
          <p className="text-[10px] text-[var(--dim)] mb-1">{t("winRate")}</p>
          <p className={`text-sm font-semibold ${stats.winRate >= 50 ? "text-green-400" : stats.totalSignals > 0 ? "text-red-400" : "text-[var(--dim)]"}`}>
            {stats.totalSignals > 0 ? `${stats.winRate.toFixed(0)}%` : "\u2014"}
          </p>
          <p className="text-[10px] text-[var(--dim)]">{stats.wins}W / {stats.losses}L</p>
        </div>
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 text-center">
          <p className="text-[10px] text-[var(--dim)] mb-1">{t("forex")}</p>
          <p className="text-sm font-semibold text-blue-400">
            {stats.forexWinRate > 0 ? `${stats.forexWinRate.toFixed(0)}%` : "\u2014"}
          </p>
          <p className="text-[10px] text-[var(--dim)]">win rate</p>
        </div>
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 text-center">
          <p className="text-[10px] text-[var(--dim)] mb-1">{t("gold")}</p>
          <p className="text-sm font-semibold text-yellow-400">
            {stats.goldWinRate > 0 ? `${stats.goldWinRate.toFixed(0)}%` : "\u2014"}
          </p>
          <p className="text-[10px] text-[var(--dim)]">win rate</p>
        </div>
      </div>

      {/* Positions */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("forexPositions")}</h3>
          <span className="text-xs text-[var(--dim)]">{positions.length}</span>
        </div>
        {positions.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-[var(--dim)]">
            {t("noForexPositions")}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {positions.map((pos, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{pos.instrument_name}</p>
                  <p className="text-[10px] text-[var(--dim)]">
                    {pos.direction} {pos.size} @ {pos.open_level.toFixed(pos.open_level > 100 ? 2 : 5)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{pos.current_bid.toFixed(pos.current_bid > 100 ? 2 : 5)}</p>
                  <p className={`text-[10px] font-medium ${pos.profit_loss >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {pos.profit_loss >= 0 ? "+" : ""}&euro;{pos.profit_loss.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Forex Signals */}
      {signals.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Target size={14} />
              {t("forexSignals")}
            </h3>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {signals.map((sig, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${sig.side === "BUY" ? "bg-green-400" : "bg-red-400"}`} />
                  <div>
                    <p className="text-xs font-medium">
                      {sig.symbol}{" "}
                      <span className="text-[var(--dim)]">{sig.side}</span>
                      {sig.market_type === "gold" && <span className="ml-1 text-yellow-400">&#9679;</span>}
                    </p>
                    <p className="text-[10px] text-[var(--dim)]">
                      {sig.entry_price.toFixed(sig.entry_price > 100 ? 2 : 5)}
                      {sig.filters_applied?.includes("mtf_aligned") && (
                        <span className="ml-1 text-blue-400">MTF</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {sig.outcome ? (
                    <span className={`text-xs font-medium ${sig.outcome === "win" ? "text-green-400" : "text-red-400"}`}>
                      {sig.outcome === "win" ? "WIN" : "LOSS"}
                      {sig.pnl_pct != null && ` ${sig.pnl_pct >= 0 ? "+" : ""}${sig.pnl_pct.toFixed(1)}%`}
                    </span>
                  ) : (
                    <span className="text-[10px] text-yellow-400">{t("pending")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forex Learning Score */}
      {learning && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Brain size={14} />
              {t("forexLearning")}
            </h3>
            <span className="text-sm font-bold text-blue-400">{learning.score}/100</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden mb-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
              style={{ width: `${learning.score}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-semibold">{stats.totalSignals}</p>
              <p className="text-[9px] text-[var(--dim)]">{t("signals")}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{stats.winRate > 0 ? `${stats.winRate.toFixed(0)}%` : "\u2014"}</p>
              <p className="text-[9px] text-[var(--dim)]">{t("winRate")}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{learning.marketsAnalyzed}</p>
              <p className="text-[9px] text-[var(--dim)]">{t("markets")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Forex */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/chat?q=escaneo%20forex" className="flex items-center gap-2 rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 active:opacity-70 transition-opacity">
          <Globe size={16} className="text-blue-400" />
          <span className="text-xs font-medium">{t("scanForex")}</span>
        </Link>
        <Link href="/chat?q=analiza%20oro%20dolar" className="flex items-center gap-2 rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 active:opacity-70 transition-opacity">
          <Target size={16} className="text-yellow-400" />
          <span className="text-xs font-medium">{t("analyzeGold")}</span>
        </Link>
      </div>
    </>
  );
}
