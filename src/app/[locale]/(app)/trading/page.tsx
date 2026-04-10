"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback, useRef } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import {
  TrendingUp,
  BarChart3,
  Target,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertTriangle,
  Globe,
  Zap,
} from "lucide-react";

interface DashboardData {
  account: { equity: number; cash: number; buyingPower: number; mode: string };
  pnl: {
    day: { amount: number; pct: number };
    week: { amount: number; pct: number };
    month: { amount: number; pct: number };
  };
  positions: Array<{
    symbol: string;
    qty: number;
    avgEntry: number;
    currentPrice: number;
    marketValue: number;
    unrealizedPl: number;
    unrealizedPlPct: number;
    changeToday: number;
  }>;
  equityCurve: Array<{ date: string; equity: number; pnl: number }>;
  session: {
    tradesToday: number;
    maxTrades: number;
    pnlToday: number;
    dailyGoal: number;
    sessionClosed: boolean;
    riskPerTrade: number;
    accountSize: number;
    tradingStyle: string;
  } | null;
  learning: {
    score: number;
    winRate: number;
    totalSignals: number;
    marketsAnalyzed: number;
  } | null;
  signals: Array<{
    symbol: string;
    side: string;
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    confidence: number;
    outcome: string | null;
    pnl: number | null;
    created_at: string;
  }>;
}

interface ForexData {
  account: { balance: number; available: number; profit_loss: number; deposit: number };
  positions: Array<{
    instrument_name: string;
    direction: string;
    size: number;
    open_level: number;
    current_bid: number;
    profit_loss: number;
  }>;
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

const POLL_INTERVAL = 30_000; // 30 seconds

export default function TradingPage() {
  const t = useTranslations("trading");
  const [tab, setTab] = useState<"stocks" | "forex">("stocks");
  const [data, setData] = useState<DashboardData | null>(null);
  const [forexData, setForexData] = useState<ForexData | null>(null);
  const [forexLoading, setForexLoading] = useState(false);
  const [forexError, setForexError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = useCallback(async () => {
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setError("not_logged_in"); return; }

    try {
      const res = await fetch(`/api/trading/dashboard?userId=${user.id}`);
      if (res.status === 401) { setError("not_connected"); setLoading(false); return; }
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdate(new Date());
    } catch {
      setError("fetch_error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchForex = useCallback(async () => {
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setForexLoading(true);
    try {
      const res = await fetch(`/api/trading/forex-dashboard?userId=${user.id}`);
      if (res.status === 503) { setForexError("forex_unavailable"); return; }
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setForexData(json);
      setForexError(null);
    } catch {
      setForexError("fetch_error");
    } finally {
      setForexLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    intervalRef.current = setInterval(fetchDashboard, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchDashboard]);

  // Fetch forex data when switching to forex tab
  useEffect(() => {
    if (tab === "forex" && !forexData && !forexLoading) fetchForex();
  }, [tab, forexData, forexLoading, fetchForex]);

  // Pause polling when tab is hidden
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      } else {
        fetchDashboard();
        intervalRef.current = setInterval(fetchDashboard, POLL_INTERVAL);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="animate-spin text-[var(--dim)]" size={24} />
      </div>
    );
  }

  if (error === "not_connected") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
        <BarChart3 size={48} className="text-[var(--dim)]" />
        <h2 className="text-lg font-semibold">{t("connectTitle")}</h2>
        <p className="text-sm text-[var(--dim)]">{t("connectDesc")}</p>
        <Link href="/settings" className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium">
          {t("goToSettings")}
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle size={32} className="text-yellow-500" />
        <p className="text-sm text-[var(--dim)]">{t("errorLoading")}</p>
        <button onClick={fetchDashboard} className="text-sm text-[var(--accent)] underline">{t("retry")}</button>
      </div>
    );
  }

  const { account, pnl, positions, session, learning, signals } = data;
  const dayPositive = pnl.day.amount >= 0;

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Header + Tab Switcher */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            <div className="flex items-center gap-2 text-xs text-[var(--dim)]">
              {tab === "stocks" && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${account.mode === "paper" ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}`}>
                  {account.mode === "paper" ? "PAPER" : "LIVE"}
                </span>
              )}
              {lastUpdate && (
                <button onClick={tab === "stocks" ? fetchDashboard : fetchForex} className="flex items-center gap-1 hover:text-white transition-colors">
                  <RefreshCw size={12} />
                  {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </button>
              )}
            </div>
          </div>
          {/* Acciones / Forex switcher */}
          <div className="flex rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-1">
            <button
              onClick={() => setTab("stocks")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${tab === "stocks" ? "bg-[var(--card)] text-white shadow-sm" : "text-[var(--dim)]"}`}
            >
              <BarChart3 size={14} /> Acciones
            </button>
            <button
              onClick={() => setTab("forex")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${tab === "forex" ? "bg-[var(--card)] text-white shadow-sm" : "text-[var(--dim)]"}`}
            >
              <Globe size={14} /> Forex
            </button>
          </div>
        </div>

        {/* ===== FOREX TAB ===== */}
        {tab === "forex" && (
          <ForexSection data={forexData} loading={forexLoading} error={forexError} onRetry={fetchForex} />
        )}

        {/* ===== STOCKS TAB ===== */}
        {tab === "stocks" && <>

        {/* Session Status (if profile exists) */}
        {session && (
          <div className={`rounded-xl p-3 ${session.sessionClosed ? "bg-red-500/10 border border-red-500/30" : "bg-[var(--card)] border border-[var(--border)]"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--dim)]">{t("dailySession")}</span>
              <span className={`text-xs font-semibold ${session.sessionClosed ? "text-red-400" : "text-green-400"}`}>
                {session.sessionClosed ? t("sessionClosed") : t("sessionOpen")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--dim)]">{t("dailyGoal")}</span>
                  <span className={session.pnlToday >= 0 ? "text-green-400" : "text-red-400"}>
                    {session.pnlToday >= 0 ? "+" : ""}${session.pnlToday.toFixed(0)} / ${session.dailyGoal.toFixed(0)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${session.pnlToday >= 0 ? "bg-green-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(100, Math.abs(session.pnlToday / session.dailyGoal) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-center px-2 border-l border-[var(--border)]">
                <span className="text-sm font-semibold">{session.tradesToday}</span>
                <span className="text-[10px] text-[var(--dim)]">/{session.maxTrades}</span>
                <p className="text-[9px] text-[var(--dim)]">{t("trades")} hoy</p>
              </div>
            </div>
          </div>
        )}

        {/* Account Summary Card */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] text-[var(--dim)] uppercase tracking-wider">{t("totalEquity")}</p>
              <p className="text-2xl font-bold mt-0.5">${account.equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-sm font-semibold ${dayPositive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {dayPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {pnl.day.pct >= 0 ? "+" : ""}{pnl.day.pct.toFixed(2)}%
            </div>
          </div>
          <p className={`text-sm mt-1 ${dayPositive ? "text-green-400" : "text-red-400"}`}>
            {pnl.day.amount >= 0 ? "+" : ""}${pnl.day.amount.toFixed(2)} {t("today")}
          </p>
        </div>

        {/* P&L Grid */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: t("today"), ...pnl.day },
            { label: t("week"), ...pnl.week },
            { label: t("month"), ...pnl.month },
          ].map(({ label, amount, pct }) => (
            <div key={label} className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 text-center">
              <p className="text-[10px] text-[var(--dim)] mb-1">{label}</p>
              <p className={`text-sm font-semibold ${amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                {amount >= 0 ? "+" : ""}${Math.abs(amount).toFixed(0)}
              </p>
              <p className={`text-[10px] ${pct >= 0 ? "text-green-400/70" : "text-red-400/70"}`}>
                {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
              </p>
            </div>
          ))}
        </div>

        {/* Positions */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("positions")}</h3>
            <span className="text-xs text-[var(--dim)]">{positions.length}</span>
          </div>
          {positions.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--dim)]">
              {t("noPositions")}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {positions.map(pos => (
                <div key={pos.symbol} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{pos.symbol}</p>
                    <p className="text-[10px] text-[var(--dim)]">{pos.qty} @ ${pos.avgEntry.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">${pos.currentPrice.toFixed(2)}</p>
                    <p className={`text-[10px] font-medium ${pos.unrealizedPl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pos.unrealizedPl >= 0 ? "+" : ""}${pos.unrealizedPl.toFixed(2)} ({pos.unrealizedPlPct >= 0 ? "+" : ""}{pos.unrealizedPlPct.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Signals */}
        {signals.length > 0 && (
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Target size={14} />
                {t("recentSignals")}
              </h3>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {signals.map((sig, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${sig.side === "BUY" ? "bg-green-400" : "bg-red-400"}`} />
                    <div>
                      <p className="text-xs font-medium">{sig.symbol} <span className="text-[var(--dim)]">{sig.side}</span></p>
                      <p className="text-[10px] text-[var(--dim)]">${sig.entry_price.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {sig.outcome ? (
                      <span className={`text-xs font-medium ${sig.outcome === "win" ? "text-green-400" : "text-red-400"}`}>
                        {sig.outcome === "win" ? "WIN" : "LOSS"} {sig.pnl ? `$${sig.pnl.toFixed(2)}` : ""}
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

        {/* Learning Score */}
        {learning && (
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Brain size={14} />
                {t("learningTitle")}
              </h3>
              <span className="text-sm font-bold text-[var(--accent)]">{learning.score}/100</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${learning.score}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-semibold">{learning.totalSignals}</p>
                <p className="text-[9px] text-[var(--dim)]">{t("signals")}</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{learning.totalSignals > 0 && learning.winRate === 0 ? "—" : `${learning.winRate.toFixed(1)}%`}</p>
                <p className="text-[9px] text-[var(--dim)]">Win Rate</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{learning.marketsAnalyzed}</p>
                <p className="text-[9px] text-[var(--dim)]">{t("markets")}</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Link href="/chat?q=oportunidades" className="flex items-center gap-2 rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 active:opacity-70 transition-opacity">
            <TrendingUp size={16} className="text-green-400" />
            <span className="text-xs font-medium">{t("scanMarket")}</span>
          </Link>
          <Link href="/chat?q=mi%20calendario%20de%20trading" className="flex items-center gap-2 rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 active:opacity-70 transition-opacity">
            <BarChart3 size={16} className="text-blue-400" />
            <span className="text-xs font-medium">{t("viewCalendar")}</span>
          </Link>
        </div>

        {/* Cash & Buying Power */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3">
            <p className="text-[10px] text-[var(--dim)]">{t("cash")}</p>
            <p className="text-sm font-semibold mt-0.5">${account.cash.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3">
            <p className="text-[10px] text-[var(--dim)]">{t("buyingPower")}</p>
            <p className="text-sm font-semibold mt-0.5">${account.buyingPower.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        </>}

        <p className="text-[9px] text-center text-[var(--dim)] pb-2">
          {t("disclaimer")}
        </p>
      </div>
    </div>
  );
}

function ForexSection({ data, loading, error, onRetry }: { data: ForexData | null; loading: boolean; error: string | null; onRetry: () => void }) {
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
        <p className="text-sm font-medium">Forex no disponible</p>
        <p className="text-xs text-[var(--dim)]">El motor de forex no est&aacute; conectado. Verifica que el Python engine est&eacute; activo.</p>
        <button onClick={onRetry} className="text-xs text-[var(--accent)] underline mt-2">Reintentar</button>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 text-center space-y-2">
        <AlertTriangle size={24} className="mx-auto text-yellow-500" />
        <p className="text-sm text-[var(--dim)]">Error cargando datos forex</p>
        <button onClick={onRetry} className="text-xs text-[var(--accent)] underline">Reintentar</button>
      </div>
    );
  }

  const { account, positions, signals, stats, killZone, learning } = data;
  const plPositive = account.profit_loss >= 0;

  return (
    <>
      {/* Kill Zone Banner */}
      {killZone && (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/30 px-3 py-2">
          <Zap size={14} className="text-green-400" />
          <span className="text-xs font-medium text-green-400">Kill Zone {killZone} activa</span>
        </div>
      )}

      {/* Account Card */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] text-[var(--dim)] uppercase tracking-wider">Cuenta IG</p>
            <p className="text-2xl font-bold mt-0.5">
              &euro;{account.balance.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-sm font-semibold ${plPositive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
            {plPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {account.profit_loss >= 0 ? "+" : ""}&euro;{account.profit_loss.toFixed(2)}
          </div>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-[var(--dim)]">
          <span>Disponible: &euro;{account.available.toLocaleString("es-ES", { minimumFractionDigits: 2 })}</span>
          <span>Dep&oacute;sito: &euro;{account.deposit.toLocaleString("es-ES", { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 text-center">
          <p className="text-[10px] text-[var(--dim)] mb-1">Win Rate</p>
          <p className={`text-sm font-semibold ${stats.winRate >= 50 ? "text-green-400" : stats.totalSignals > 0 ? "text-red-400" : "text-[var(--dim)]"}`}>
            {stats.totalSignals > 0 ? `${stats.winRate.toFixed(0)}%` : "\u2014"}
          </p>
          <p className="text-[10px] text-[var(--dim)]">{stats.wins}W / {stats.losses}L</p>
        </div>
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 text-center">
          <p className="text-[10px] text-[var(--dim)] mb-1">Forex</p>
          <p className="text-sm font-semibold text-blue-400">
            {stats.forexWinRate > 0 ? `${stats.forexWinRate.toFixed(0)}%` : "\u2014"}
          </p>
          <p className="text-[10px] text-[var(--dim)]">win rate</p>
        </div>
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 text-center">
          <p className="text-[10px] text-[var(--dim)] mb-1">Oro</p>
          <p className="text-sm font-semibold text-yellow-400">
            {stats.goldWinRate > 0 ? `${stats.goldWinRate.toFixed(0)}%` : "\u2014"}
          </p>
          <p className="text-[10px] text-[var(--dim)]">win rate</p>
        </div>
      </div>

      {/* Positions */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Posiciones Forex</h3>
          <span className="text-xs text-[var(--dim)]">{positions.length}</span>
        </div>
        {positions.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-[var(--dim)]">
            Sin posiciones abiertas
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
              Se&ntilde;ales Forex
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
                    <span className="text-[10px] text-yellow-400">Pendiente</span>
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
              Aprendizaje Forex
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
              <p className="text-[9px] text-[var(--dim)]">Se&ntilde;ales</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{stats.winRate > 0 ? `${stats.winRate.toFixed(0)}%` : "\u2014"}</p>
              <p className="text-[9px] text-[var(--dim)]">Win Rate</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{learning.marketsAnalyzed}</p>
              <p className="text-[9px] text-[var(--dim)]">Mercados</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Forex */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/chat?q=escaneo%20forex" className="flex items-center gap-2 rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 active:opacity-70 transition-opacity">
          <Globe size={16} className="text-blue-400" />
          <span className="text-xs font-medium">Escanear Forex</span>
        </Link>
        <Link href="/chat?q=analiza%20oro%20dolar" className="flex items-center gap-2 rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 active:opacity-70 transition-opacity">
          <Target size={16} className="text-yellow-400" />
          <span className="text-xs font-medium">Analizar Oro</span>
        </Link>
      </div>
    </>
  );
}
