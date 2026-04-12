"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  Crosshair,
  Clock,
  Zap,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
} from "lucide-react";

interface StrategyPlan {
  symbol: string;
  bias: string;
  direction: string;
  zone: string | null;
  swingHigh: number | null;
  swingLow: number | null;
  equilibrium: number | null;
  atr: number | null;
}

interface StrategyStatus {
  date: string;
  strategy: {
    active: boolean;
    plans: StrategyPlan[];
    summary: { bullish: number; bearish: number; neutral: number; total: number };
  };
  v2Metrics: {
    totalSignals: number;
    wins: number;
    losses: number;
    winRate: number;
    avgConfidence: number;
    pendingSignals: number;
    recentSignals: Array<{
      symbol: string;
      side: string;
      confidence: number;
      outcome: string | null;
      filters_applied: string[];
      created_at: string;
    }>;
  };
  session: {
    killZone: string | null;
    killZoneEnd: string;
    silverBullet: string | null;
    nextKillZone: string;
    isMarketOpen: boolean;
    isWeekend: boolean;
  };
}

const BIAS_CONFIG = {
  bullish: { icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/10", label: "LONG", dot: "bg-green-400" },
  bearish: { icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/10", label: "SHORT", dot: "bg-red-400" },
  neutral: { icon: Minus, color: "text-[var(--dim)]", bg: "bg-[var(--bg2)]", label: "NO TRADE", dot: "bg-gray-500" },
};

export default function StrategyPanel() {
  const [status, setStatus] = useState<StrategyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const res = await fetch(`/api/trading/strategy-status?userId=${user.id}`);
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 animate-pulse">
        <div className="h-4 bg-[var(--border)] rounded w-1/3 mb-3" />
        <div className="h-20 bg-[var(--border)] rounded" />
      </div>
    );
  }

  if (!status) return null;

  const { strategy, v2Metrics, session } = status;

  return (
    <div className="space-y-3">

      {/* Kill Zone Status Bar */}
      <div className={`rounded-xl p-3 flex items-center justify-between ${
        session.killZone
          ? "bg-green-500/10 border border-green-500/30"
          : session.isWeekend
            ? "bg-[var(--card)] border border-[var(--border)]"
            : "bg-[var(--card)] border border-[var(--border)]"
      }`}>
        <div className="flex items-center gap-2">
          {session.killZone ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
              </span>
              <div>
                <p className="text-xs font-semibold text-green-400">
                  {session.killZone} Kill Zone
                  {session.silverBullet && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[9px]">
                      {session.silverBullet}
                    </span>
                  )}
                </p>
                <p className="text-[9px] text-[var(--dim)]">Sniper activo hasta {session.killZoneEnd}</p>
              </div>
            </>
          ) : (
            <>
              <Clock size={14} className="text-[var(--dim)]" />
              <div>
                <p className="text-xs font-medium text-[var(--dim)]">
                  {session.isWeekend ? "Mercado cerrado" : "Fuera de kill zone"}
                </p>
                {session.nextKillZone && (
                  <p className="text-[9px] text-[var(--dim)]">Siguiente: {session.nextKillZone}</p>
                )}
              </div>
            </>
          )}
        </div>
        {session.isMarketOpen && (
          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-[9px] font-medium">
            MARKET OPEN
          </span>
        )}
      </div>

      {/* Daily Plan */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Crosshair size={14} className="text-[var(--accent)]" />
            Plan del dia
          </h3>
          {strategy.active ? (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-green-400">{strategy.summary.bullish}L</span>
              <span className="text-[var(--dim)]">/</span>
              <span className="text-red-400">{strategy.summary.bearish}S</span>
              <span className="text-[var(--dim)]">/</span>
              <span className="text-[var(--dim)]">{strategy.summary.neutral}N</span>
            </div>
          ) : (
            <span className="text-[10px] text-yellow-400">Esperando 7:00 UTC</span>
          )}
        </div>

        {strategy.plans.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {strategy.plans.map(plan => {
              const config = BIAS_CONFIG[plan.bias as keyof typeof BIAS_CONFIG] || BIAS_CONFIG.neutral;
              const Icon = config.icon;
              return (
                <div key={plan.symbol} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                    <span className="text-xs font-semibold w-12">{plan.symbol}</span>
                    <span className={`flex items-center gap-1 text-[10px] font-medium ${config.color}`}>
                      <Icon size={10} />
                      {config.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-[var(--dim)]">
                    {plan.zone && (
                      <span className={`px-1.5 py-0.5 rounded ${
                        plan.zone === "discount" ? "bg-green-500/10 text-green-400" :
                        plan.zone === "premium" ? "bg-red-500/10 text-red-400" :
                        "bg-[var(--bg2)]"
                      }`}>
                        {plan.zone}
                      </span>
                    )}
                    {plan.atr && (
                      <span>ATR {Number(plan.atr).toFixed(1)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-[var(--dim)]">
              {session.isWeekend
                ? "El plan se genera el lunes a las 7:00 UTC"
                : "El Strategy Agent generara el plan a las 7:00 UTC"}
            </p>
          </div>
        )}
      </div>

      {/* Strategy v2 Metrics */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Zap size={14} className="text-yellow-400" />
            Strategy v2
          </h3>
          <div className="flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span className="text-[9px] text-cyan-400 font-medium">ACTIVE</span>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="text-center">
            <p className="text-lg font-bold text-white">{v2Metrics.totalSignals}</p>
            <p className="text-[8px] text-[var(--dim)] uppercase">Signals</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold ${v2Metrics.winRate >= 60 ? "text-green-400" : v2Metrics.winRate >= 40 ? "text-yellow-400" : v2Metrics.totalSignals === 0 ? "text-[var(--dim)]" : "text-red-400"}`}>
              {v2Metrics.totalSignals > 0 ? `${v2Metrics.winRate}%` : "—"}
            </p>
            <p className="text-[8px] text-[var(--dim)] uppercase">Win Rate</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-green-400">{v2Metrics.wins}</p>
            <p className="text-[8px] text-[var(--dim)] uppercase">Wins</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-400">{v2Metrics.losses}</p>
            <p className="text-[8px] text-[var(--dim)] uppercase">Losses</p>
          </div>
        </div>

        {/* Win rate progress bar */}
        <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-green-500 transition-all duration-1000"
            style={{ width: `${v2Metrics.totalSignals > 0 ? v2Metrics.winRate : 0}%` }}
          />
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between text-[9px] text-[var(--dim)]">
          <div className="flex items-center gap-1">
            <Shield size={10} />
            <span>Confluence min 8/15</span>
          </div>
          <div className="flex items-center gap-1">
            <Activity size={10} />
            <span>{v2Metrics.pendingSignals} pending</span>
          </div>
          {v2Metrics.avgConfidence > 0 && (
            <span>Avg conf: {v2Metrics.avgConfidence}%</span>
          )}
        </div>
      </div>
    </div>
  );
}
