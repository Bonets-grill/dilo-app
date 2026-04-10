/**
 * Pattern Discovery Cron — runs weekly (Sundays 6AM)
 *
 * Analyzes ALL resolved signals and discovers:
 * 1. Strong patterns (>65% win rate with 10+ signals) -> confidence boost
 * 2. Weak patterns (<35% win rate with 10+ signals) -> confidence penalty
 * 3. New patterns emerging (5-9 signals)
 * 4. Weekly insights for the user
 *
 * This is the BRAIN of DILO Trader. It's what makes it learn.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const weekStart = new Date().toISOString().slice(0, 10);
  let patternsUpdated = 0;
  let insightsCreated = 0;

  try {
    // Get ALL resolved signals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allSignals } = await (supabase.from("trading_signal_log") as any)
      .select("symbol, side, setup_type, market_type, confidence, outcome, pnl, pnl_pct, filters_applied, created_at")
      .not("outcome", "is", null);

    if (!allSignals || allSignals.length < 10) {
      const { logCronResult } = await import("@/lib/cron/logger");
      await logCronResult("trading-discover-patterns", { status: "not_enough_data", signals: allSignals?.length || 0 });
      return NextResponse.json({ ok: true, status: "not_enough_data" });
    }

    // Get current regime for context
    let currentRegime = "unknown";
    try {
      const { detectRegime } = await import("@/lib/trading/intelligence");
      const regime = await detectRegime();
      currentRegime = regime.regime;
    } catch { /* skip */ }

    // Group signals by pattern combination
    const patternMap: Record<string, {
      symbol: string;
      setup_type: string;
      market_type: string;
      signals: typeof allSignals;
    }> = {};

    for (const sig of allSignals) {
      const key = `${sig.symbol}|${sig.setup_type || "unknown"}|${sig.market_type || "stocks"}`;
      if (!patternMap[key]) {
        patternMap[key] = {
          symbol: sig.symbol,
          setup_type: sig.setup_type || "unknown",
          market_type: sig.market_type || "stocks",
          signals: [],
        };
      }
      patternMap[key].signals.push(sig);
    }

    // Analyze each pattern
    for (const [, pattern] of Object.entries(patternMap)) {
      const { symbol, setup_type, market_type, signals } = pattern;
      const total = signals.length;

      if (total < 5) continue;

      const wins = signals.filter((s: { outcome: string }) => s.outcome === "win").length;
      const losses = signals.filter((s: { outcome: string }) => s.outcome === "loss").length;
      const expired = signals.filter((s: { outcome: string }) => s.outcome === "expired").length;
      const winRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;

      const pnls = signals.filter((s: { pnl: number | null }) => s.pnl != null).map((s: { pnl: number }) => s.pnl);
      const avgPnl = pnls.length > 0 ? Math.round(pnls.reduce((a: number, b: number) => a + b, 0) / pnls.length * 100) / 100 : 0;
      const avgPnlPct = signals.filter((s: { pnl_pct: number | null }) => s.pnl_pct != null).map((s: { pnl_pct: number }) => s.pnl_pct);
      const avgPnlPctVal = avgPnlPct.length > 0 ? Math.round(avgPnlPct.reduce((a: number, b: number) => a + b, 0) / avgPnlPct.length * 100) / 100 : 0;
      const bestPnl = pnls.length > 0 ? Math.max(...pnls) : 0;
      const worstPnl = pnls.length > 0 ? Math.min(...pnls) : 0;
      const avgConf = Math.round(signals.reduce((s: number, sig: { confidence: number }) => s + (sig.confidence || 50), 0) / total);

      // Classify pattern
      let patternType = "neutral";
      let confidenceAdj = 0;
      let notes = "";

      if (total >= 10 && winRate >= 65) {
        patternType = "strong";
        confidenceAdj = Math.min(15, Math.round((winRate - 50) / 3));
        notes = `Patrón fuerte: ${setup_type} en ${symbol} funciona bien (${winRate}% win rate, ${total} señales)`;
      } else if (total >= 10 && winRate <= 35) {
        patternType = "weak";
        confidenceAdj = -Math.min(20, Math.round((50 - winRate) / 2));
        notes = `Patrón débil: ${setup_type} en ${symbol} no funciona (${winRate}% win rate, ${total} señales). Considerar evitar.`;
      } else if (total >= 5) {
        patternType = "neutral";
        confidenceAdj = 0;
        notes = `Patrón en observación: ${total} señales, ${winRate}% win rate. Necesita más datos.`;
      }

      // Upsert pattern
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("trading_patterns") as any).upsert({
        symbol,
        setup_type,
        market_type,
        regime: currentRegime,
        total_signals: total,
        wins,
        losses,
        expired,
        win_rate: winRate,
        avg_pnl: avgPnl,
        avg_pnl_pct: avgPnlPctVal,
        best_pnl: bestPnl,
        worst_pnl: worstPnl,
        avg_confidence: avgConf,
        pattern_type: patternType,
        confidence_adjustment: confidenceAdj,
        first_seen: signals[signals.length - 1]?.created_at?.slice(0, 10),
        last_updated: weekStart,
        notes,
        updated_at: new Date().toISOString(),
      }, { onConflict: "symbol,setup_type,market_type,regime" });

      patternsUpdated++;
    }

    // Generate weekly insights
    const thisWeekStart = new Date(Date.now() - 7 * 86400000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: weekSignals } = await (supabase.from("trading_signal_log") as any)
      .select("symbol, setup_type, market_type, outcome, pnl")
      .not("outcome", "is", null)
      .gte("resolved_at", thisWeekStart);

    if (weekSignals && weekSignals.length >= 3) {
      const weekWins = weekSignals.filter((s: { outcome: string }) => s.outcome === "win").length;
      const weekWinRate = Math.round((weekWins / weekSignals.length) * 100);
      const weekPnl = weekSignals
        .filter((s: { pnl: number | null }) => s.pnl != null)
        .reduce((s: number, sig: { pnl: number }) => s + sig.pnl, 0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("trading_insights") as any).insert({
        week_start: weekStart,
        insight_type: "weekly_summary",
        title: `Semana: ${weekWinRate}% win rate, ${weekSignals.length} señales`,
        description: `${weekWins} wins, ${weekSignals.length - weekWins} losses/expired. P&L total: ${weekPnl >= 0 ? "+" : ""}${weekPnl.toFixed(2)}`,
        data: { win_rate: weekWinRate, total: weekSignals.length, pnl: weekPnl },
      });
      insightsCreated++;
    }

    // Find best and worst patterns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: strongPatterns } = await (supabase.from("trading_patterns") as any)
      .select("symbol, setup_type, win_rate, total_signals")
      .eq("pattern_type", "strong")
      .order("win_rate", { ascending: false })
      .limit(3);

    if (strongPatterns && strongPatterns.length > 0) {
      const best = strongPatterns[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("trading_insights") as any).insert({
        week_start: weekStart,
        insight_type: "best_setup",
        title: `Tu mejor setup: ${best.setup_type} en ${best.symbol}`,
        description: `${best.win_rate}% win rate en ${best.total_signals} señales. Sigue buscando este patrón.`,
        data: best,
        actionable: true,
      });
      insightsCreated++;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: weakPatterns } = await (supabase.from("trading_patterns") as any)
      .select("symbol, setup_type, win_rate, total_signals")
      .eq("pattern_type", "weak")
      .order("win_rate", { ascending: true })
      .limit(3);

    if (weakPatterns && weakPatterns.length > 0) {
      const worst = weakPatterns[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("trading_insights") as any).insert({
        week_start: weekStart,
        insight_type: "worst_setup",
        title: `Evitar: ${worst.setup_type} en ${worst.symbol}`,
        description: `Solo ${worst.win_rate}% win rate en ${worst.total_signals} señales. DILO reducirá confianza automáticamente.`,
        data: worst,
        actionable: true,
      });
      insightsCreated++;
    }

    const resultData = {
      patterns_updated: patternsUpdated,
      insights_created: insightsCreated,
      total_signals_analyzed: allSignals.length,
    };

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("trading-discover-patterns", resultData);

    return NextResponse.json({ ok: true, ...resultData });
  } catch (err) {
    console.error("[Pattern Discovery] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("trading-discover-patterns", (err as Error).message);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
