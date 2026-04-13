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

    // ── GENERATE WISDOM (Cerebro 3: condensed actionable insights) ──
    let wisdomGenerated = 0;

    // Analyze by symbol+hour for timing wisdom
    const hourMap: Record<string, { wins: number; total: number }> = {};
    const dayMap: Record<string, { wins: number; total: number }> = {};

    for (const sig of allSignals) {
      const hour = new Date(sig.created_at).getUTCHours();
      const day = new Date(sig.created_at).getUTCDay();
      const hKey = `${sig.symbol}|h${hour}`;
      const dKey = `${sig.symbol}|d${day}`;

      if (!hourMap[hKey]) hourMap[hKey] = { wins: 0, total: 0 };
      hourMap[hKey].total++;
      if (sig.outcome === "win") hourMap[hKey].wins++;

      if (!dayMap[dKey]) dayMap[dKey] = { wins: 0, total: 0 };
      dayMap[dKey].total++;
      if (sig.outcome === "win") dayMap[dKey].wins++;
    }

    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    // Best/worst hours per symbol
    for (const [key, data] of Object.entries(hourMap)) {
      if (data.total < 5) continue;
      const [symbol, hourStr] = key.split("|");
      const hour = parseInt(hourStr.slice(1));
      const wr = Math.round((data.wins / data.total) * 100);

      if (wr >= 65) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("trading_wisdom") as any).upsert({
          symbol,
          market_type: allSignals.find((s: { symbol: string }) => s.symbol === symbol)?.market_type || "stocks",
          category: "timing",
          insight: `${symbol}: ${wr}% WR a las ${hour}:00 UTC (${data.total} señales)`,
          confidence: Math.min(90, 50 + data.total),
          sample_size: data.total,
          confidence_adjustment: Math.min(10, Math.round((wr - 50) / 5)),
          metadata: { hour, win_rate: wr, total: data.total },
          last_verified: weekStart,
          active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "symbol,market_type,category,md5(insight)" }).catch(() => {});
        wisdomGenerated++;
      } else if (wr <= 35) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("trading_wisdom") as any).upsert({
          symbol,
          market_type: allSignals.find((s: { symbol: string }) => s.symbol === symbol)?.market_type || "stocks",
          category: "avoid",
          insight: `${symbol}: EVITAR ${hour}:00 UTC — solo ${wr}% WR (${data.total} señales)`,
          confidence: Math.min(90, 50 + data.total),
          sample_size: data.total,
          confidence_adjustment: -Math.min(15, Math.round((50 - wr) / 3)),
          metadata: { hour, win_rate: wr, total: data.total },
          last_verified: weekStart,
          active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "symbol,market_type,category,md5(insight)" }).catch(() => {});
        wisdomGenerated++;
      }
    }

    // Best/worst days per symbol
    for (const [key, data] of Object.entries(dayMap)) {
      if (data.total < 5) continue;
      const [symbol, dayStr] = key.split("|");
      const dayIdx = parseInt(dayStr.slice(1));
      const wr = Math.round((data.wins / data.total) * 100);

      if (wr >= 65 || wr <= 35) {
        const isGood = wr >= 65;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("trading_wisdom") as any).upsert({
          symbol,
          market_type: allSignals.find((s: { symbol: string }) => s.symbol === symbol)?.market_type || "stocks",
          category: isGood ? "timing" : "avoid",
          insight: `${symbol}: ${isGood ? "" : "EVITAR "}${dayNames[dayIdx]} — ${wr}% WR (${data.total} señales)`,
          confidence: Math.min(90, 50 + data.total),
          sample_size: data.total,
          confidence_adjustment: isGood ? Math.min(8, Math.round((wr - 50) / 5)) : -Math.min(12, Math.round((50 - wr) / 3)),
          metadata: { day: dayIdx, day_name: dayNames[dayIdx], win_rate: wr, total: data.total },
          last_verified: weekStart,
          active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "symbol,market_type,category,md5(insight)" }).catch(() => {});
        wisdomGenerated++;
      }
    }

    // Setup-type wisdom per symbol (from patterns already computed)
    for (const [, pattern] of Object.entries(patternMap)) {
      const { symbol, setup_type, market_type, signals } = pattern;
      const total = signals.length;
      if (total < 10) continue;
      const wins = signals.filter((s: { outcome: string }) => s.outcome === "win").length;
      const wr = Math.round((wins / total) * 100);

      if (wr >= 65 || wr <= 35) {
        const isGood = wr >= 65;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("trading_wisdom") as any).upsert({
          symbol,
          market_type: market_type || "stocks",
          category: isGood ? "pattern" : "avoid",
          insight: `${symbol}: ${setup_type} ${isGood ? "funciona" : "NO funciona"} — ${wr}% WR (${total} señales)`,
          confidence: Math.min(95, 50 + total * 2),
          sample_size: total,
          confidence_adjustment: isGood ? Math.min(15, Math.round((wr - 50) / 3)) : -Math.min(20, Math.round((50 - wr) / 2)),
          metadata: { setup_type, win_rate: wr, total, avg_pnl: signals.filter((s: { pnl: number | null }) => s.pnl != null).reduce((a: number, s: { pnl: number }) => a + s.pnl, 0) / total },
          last_verified: weekStart,
          active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "symbol,market_type,category,md5(insight)" }).catch(() => {});
        wisdomGenerated++;
      }
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

    // ── CABLE 2: Train ML Model (weekly, needs 100+ resolved signals with features) ──
    let mlTrainResult: { trained: boolean; reason?: string; overall_accuracy?: number } = { trained: false, reason: "skipped" };
    try {
      // Get resolved signals WITH ml_features
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: resolvedWithFeatures } = await (supabase.from("trading_signal_log") as any)
        .select("outcome, ml_features")
        .not("outcome", "is", null)
        .not("ml_features", "is", null)
        .in("outcome", ["win", "loss"]);

      if (resolvedWithFeatures && resolvedWithFeatures.length >= 100) {
        const { trainMLModel } = await import("@/lib/trading/ml-client");
        mlTrainResult = await trainMLModel(resolvedWithFeatures);
      } else {
        mlTrainResult = {
          trained: false,
          reason: `Need 100 signals with features, have ${resolvedWithFeatures?.length || 0}`,
        };
      }
    } catch (err) {
      mlTrainResult = { trained: false, reason: (err as Error).message };
    }

    const resultData = {
      patterns_updated: patternsUpdated,
      insights_created: insightsCreated,
      wisdom_generated: wisdomGenerated,
      total_signals_analyzed: allSignals.length,
      ml_training: mlTrainResult,
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
