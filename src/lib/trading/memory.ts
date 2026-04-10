/**
 * DILO Trader Memory — Queries historical patterns to enrich new signals.
 *
 * Called BEFORE generating each signal to check:
 * 1. How did similar signals perform in the past?
 * 2. Is this a known strong pattern or weak pattern?
 * 3. Should confidence be adjusted based on history?
 *
 * This is what separates DILO from every other trading bot.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface MemoryContext {
  patternFound: boolean;
  patternType: "strong" | "weak" | "neutral" | "unknown";
  confidenceAdjustment: number;

  historicalWinRate: number | null;
  historicalSignals: number;
  historicalAvgPnl: number | null;

  symbolWinRate: number | null;
  symbolTotalSignals: number;
  symbolBestSetup: string | null;

  recentWinRate: number | null;
  recentStreak: number;

  warnings: string[];
  context: string[];
}

/**
 * Query DILO's memory for a specific signal context.
 * Returns historical performance data to adjust confidence.
 */
export async function queryMemory(
  symbol: string,
  setupType: string,
  marketType: string,
  regime?: string,
): Promise<MemoryContext> {
  const result: MemoryContext = {
    patternFound: false,
    patternType: "unknown",
    confidenceAdjustment: 0,
    historicalWinRate: null,
    historicalSignals: 0,
    historicalAvgPnl: null,
    symbolWinRate: null,
    symbolTotalSignals: 0,
    symbolBestSetup: null,
    recentWinRate: null,
    recentStreak: 0,
    warnings: [],
    context: [],
  };

  try {
    // 1. Check exact pattern match
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pattern } = await (supabase.from("trading_patterns") as any)
      .select("*")
      .eq("symbol", symbol)
      .eq("setup_type", setupType)
      .eq("market_type", marketType)
      .eq("regime", regime || "unknown")
      .maybeSingle();

    if (pattern && pattern.total_signals >= 5) {
      result.patternFound = true;
      result.patternType = pattern.pattern_type;
      result.confidenceAdjustment = pattern.confidence_adjustment;
      result.historicalWinRate = pattern.win_rate;
      result.historicalSignals = pattern.total_signals;
      result.historicalAvgPnl = pattern.avg_pnl;

      if (pattern.pattern_type === "strong") {
        result.context.push(
          `PATRÓN FUERTE: ${setupType} en ${symbol} (${regime}) = ${pattern.win_rate}% win rate en ${pattern.total_signals} señales`
        );
      } else if (pattern.pattern_type === "weak") {
        result.warnings.push(
          `PATRÓN DÉBIL: ${setupType} en ${symbol} (${regime}) = ${pattern.win_rate}% win rate en ${pattern.total_signals} señales. Considerar no operar.`
        );
      }
    }

    // 2. Symbol-wide stats (across all setups)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: symbolPatterns } = await (supabase.from("trading_patterns") as any)
      .select("win_rate, total_signals, setup_type")
      .eq("symbol", symbol)
      .eq("market_type", marketType)
      .gt("total_signals", 5)
      .order("win_rate", { ascending: false });

    if (symbolPatterns && symbolPatterns.length > 0) {
      const totalSigs = symbolPatterns.reduce((s: number, p: { total_signals: number }) => s + p.total_signals, 0);
      const weightedWR = symbolPatterns.reduce((s: number, p: { win_rate: number; total_signals: number }) => s + (p.win_rate || 0) * p.total_signals, 0) / totalSigs;

      result.symbolWinRate = Math.round(weightedWR * 10) / 10;
      result.symbolTotalSignals = totalSigs;
      result.symbolBestSetup = symbolPatterns[0]?.setup_type || null;

      result.context.push(
        `${symbol}: ${result.symbolWinRate}% win rate global (${totalSigs} señales). Mejor setup: ${result.symbolBestSetup}`
      );
    }

    // 3. Recent performance (last 20 resolved signals for this symbol)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentSignals } = await (supabase.from("trading_signal_log") as any)
      .select("outcome")
      .eq("symbol", symbol)
      .not("outcome", "is", null)
      .order("resolved_at", { ascending: false })
      .limit(20);

    if (recentSignals && recentSignals.length >= 5) {
      const recentWins = recentSignals.filter((s: { outcome: string }) => s.outcome === "win").length;
      result.recentWinRate = Math.round((recentWins / recentSignals.length) * 1000) / 10;

      // Calculate streak
      let streak = 0;
      const firstOutcome = recentSignals[0]?.outcome;
      for (const sig of recentSignals) {
        if (sig.outcome === firstOutcome) {
          streak += firstOutcome === "win" ? 1 : -1;
        } else break;
      }
      result.recentStreak = streak;

      if (streak <= -3) {
        result.warnings.push(
          `RACHA NEGATIVA: ${Math.abs(streak)} pérdidas consecutivas en ${symbol}. Reducir tamaño o pausar.`
        );
        result.confidenceAdjustment -= 10;
      }
      if (streak >= 3) {
        result.context.push(`Racha positiva: ${streak} wins consecutivos en ${symbol}`);
      }
    }

    // 4. Check for upcoming events (earnings, etc.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: earningsKnowledge } = await (supabase.from("trading_knowledge") as any)
      .select("data")
      .eq("category", "insight")
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date", { ascending: false })
      .limit(1);

    if (earningsKnowledge?.[0]?.data?.type === "earnings_upcoming") {
      const events = earningsKnowledge[0].data.events || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const symbolEarnings = events.find((e: any) => e.symbol === symbol);
      if (symbolEarnings) {
        result.warnings.push(
          `EARNINGS PRÓXIMOS: ${symbol} reporta el ${symbolEarnings.date}. Alta volatilidad esperada. Reducir tamaño.`
        );
        result.confidenceAdjustment -= 10;
      }
    }
  } catch (err) {
    console.error("[Trading Memory] Error:", err);
  }

  return result;
}

/**
 * Format memory context as readable string for signal reasoning.
 */
export function formatMemoryContext(memory: MemoryContext): string {
  const parts: string[] = [];

  if (memory.context.length > 0) {
    parts.push(...memory.context);
  }
  if (memory.warnings.length > 0) {
    parts.push(...memory.warnings);
  }

  return parts.join("\n");
}
