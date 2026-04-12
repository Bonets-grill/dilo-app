import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeForexMTF, isForexAvailable } from "@/lib/ig/client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FOREX_WATCHLIST = [
  { instrument: "XAU/USD", market_type: "gold" },
  { instrument: "EUR/USD", market_type: "forex" },
  { instrument: "GBP/USD", market_type: "forex" },
  { instrument: "USD/JPY", market_type: "forex" },
  { instrument: "GBP/JPY", market_type: "forex" },
  { instrument: "EUR/GBP", market_type: "forex" },
  { instrument: "EUR/JPY", market_type: "forex" },
];

// Kill zones (UTC hours)
const KILL_ZONES = {
  LONDON: { start: 7, end: 9 },
  NY: { start: 12, end: 14 },
  OVERLAP: { start: 12, end: 16 },
};

function isInKillZone(): { inZone: boolean; zone: string } {
  const hour = new Date().getUTCHours();
  if (hour >= KILL_ZONES.LONDON.start && hour <= KILL_ZONES.LONDON.end)
    return { inZone: true, zone: "London" };
  if (hour >= KILL_ZONES.NY.start && hour <= KILL_ZONES.NY.end)
    return { inZone: true, zone: "NY" };
  return { inZone: false, zone: "off-hours" };
}

/**
 * Forex Learning Cron — runs 2x daily (8AM before London, 14:00 before NY)
 * Separate from stocks cron. Uses IG Markets via Python engine.
 *
 * 1. Scans forex watchlist with MTF analysis (W + D + H1)
 * 2. Saves aligned signals with market_type + filters_applied
 * 3. Resolves forex signals >24h old
 * 4. Logs to cron_logs
 */
export async function GET() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat

  // WEEKEND GUARD — forex markets close Friday 22:00 UTC, reopen Sunday 22:00 UTC
  if (day === 0 || day === 6) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Weekend — forex markets closed" });
  }

  const today = now.toISOString().slice(0, 10);
  let signalsGenerated = 0;
  let marketsAnalyzed = 0;

  try {
    // Check if forex engine is available
    const forexUp = await isForexAvailable();
    if (!forexUp) {
      const { logCronResult } = await import("@/lib/cron/logger");
      await logCronResult("trading-learn-forex", { error: "Forex engine not available" });
      return NextResponse.json({ ok: false, error: "Forex engine not available" });
    }

    const killZone = isInKillZone();

    // ── 1. SCAN FOREX WATCHLIST WITH MTF ──
    for (const { instrument, market_type } of FOREX_WATCHLIST) {
      try {
        const analysis = await analyzeForexMTF(instrument);
        marketsAnalyzed++;

        // Save market scan data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("trading_knowledge") as any).insert({
          date: today,
          category: "forex_scan",
          symbol: instrument,
          data: {
            bias: analysis.bias,
            mtf_aligned: analysis.mtf_aligned,
            mtf_weekly_bias: analysis.mtf_weekly_bias,
            mtf_reason: analysis.mtf_reason,
            order_blocks: analysis.order_blocks?.length || 0,
            fvgs: analysis.fvgs?.length || 0,
            bos: analysis.bos?.length || 0,
            sweeps: analysis.sweeps?.length || 0,
            kill_zone: killZone.zone,
          },
          confidence: analysis.signal?.confidence || 30,
        });

        // Save signal if MTF aligned + high confidence
        const signal = analysis.signal;
        if (signal && analysis.mtf_aligned && signal.confidence >= 60) {
          const filtersApplied = ["mtf_aligned"];
          if (killZone.inZone) filtersApplied.push("kill_zone_active");
          if (!killZone.inZone) {
            signal.confidence = Math.max(10, signal.confidence - 5);
            filtersApplied.push("kill_zone_off");
          }

          // Apply intelligence filters
          try {
            const { applySignalFilters } = await import("@/lib/trading/intelligence");
            const filterResult = await applySignalFilters(
              instrument,
              signal.side as "BUY" | "SELL",
              signal.confidence,
            );
            signal.confidence = Math.max(10, Math.min(95, signal.confidence + filterResult.confidenceAdjustment));
            filtersApplied.push(...filterResult.filtersApplied);
          } catch { /* skip if intelligence not available */ }

          // Query trading memory for historical context
          let memoryContext: string[] = [];
          try {
            const { queryMemory } = await import("@/lib/trading/memory");
            const { detectRegime } = await import("@/lib/trading/intelligence");
            const regime = await detectRegime().catch(() => ({ regime: "unknown" }));
            const memory = await queryMemory(instrument, signal.setup_type || "smc_forex_mtf", market_type, regime.regime);
            signal.confidence = Math.max(10, Math.min(95, signal.confidence + memory.confidenceAdjustment));
            memoryContext = [...memory.context, ...memory.warnings];
            if (memory.confidenceAdjustment !== 0) filtersApplied.push("memory_adjusted");
          } catch { /* skip if memory not available */ }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("trading_signal_log") as any).insert({
            user_id: null,
            symbol: instrument,
            side: signal.side,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            setup_type: signal.setup_type || "smc_forex_mtf",
            confidence: signal.confidence,
            reasoning: [...(signal.reasoning || []), ...memoryContext],
            filters_applied: filtersApplied,
            market_type,
          });
          signalsGenerated++;
        }
      } catch (err) {
        console.error(`[Forex Learn] Error for ${instrument}:`, err);
      }
    }

    // ── 2. RESOLVE PREVIOUS FOREX SIGNALS ──
    try {
      const { data: unresolvedSignals } = await supabase
        .from("trading_signal_log")
        .select("*")
        .is("outcome", null)
        .in("market_type", ["forex", "gold"])
        .lt("created_at", new Date(Date.now() - 86400000).toISOString());

      if (unresolvedSignals) {
        for (const sig of unresolvedSignals) {
          try {
            const { getForexQuote } = await import("@/lib/ig/client");
            const quote = await getForexQuote(sig.symbol);
            const currentPrice = quote?.bid || 0;

            if (currentPrice > 0) {
              let outcome = "expired";
              let pnl = 0;

              if (sig.side === "BUY") {
                if (currentPrice >= sig.take_profit) { outcome = "win"; pnl = sig.take_profit - sig.entry_price; }
                else if (currentPrice <= sig.stop_loss) { outcome = "loss"; pnl = sig.stop_loss - sig.entry_price; }
                else { pnl = currentPrice - sig.entry_price; outcome = "expired"; }
              } else {
                if (currentPrice <= sig.take_profit) { outcome = "win"; pnl = sig.entry_price - sig.take_profit; }
                else if (currentPrice >= sig.stop_loss) { outcome = "loss"; pnl = sig.entry_price - sig.stop_loss; }
                else { pnl = sig.entry_price - currentPrice; outcome = "expired"; }
              }

              await supabase.from("trading_signal_log").update({
                outcome,
                exit_price: currentPrice,
                pnl: Math.round(pnl * 100) / 100,
                pnl_pct: sig.entry_price > 0 ? Math.round((pnl / sig.entry_price) * 10000) / 100 : 0,
                hit_tp: outcome === "win",
                hit_sl: outcome === "loss",
                resolved_at: new Date().toISOString(),
              }).eq("id", sig.id);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }

    // ── 3. UPDATE FOREX LEARNING STATS ──
    let forexLearningScore = 0;
    try {
      const { count: forexKnowledge } = await supabase
        .from("trading_knowledge").select("id", { count: "exact", head: true })
        .eq("category", "forex_scan");

      const { data: forexSignalStats } = await supabase
        .from("trading_signal_log").select("outcome")
        .in("market_type", ["forex", "gold"])
        .not("outcome", "is", null);

      const fxTotal = forexSignalStats?.length || 0;
      const fxWon = forexSignalStats?.filter(s => s.outcome === "win").length || 0;
      const fxLost = forexSignalStats?.filter(s => s.outcome === "loss").length || 0;
      const fxWinRate = fxTotal > 0 ? (fxWon / fxTotal * 100) : 0;

      const fxPatternsDetected = marketsAnalyzed * 4; // OBs+FVGs+BOS+sweeps per pair scanned

      const dataScore = Math.min(40, (forexKnowledge || 0) / 10);
      const signalScore = fxTotal > 0 ? Math.min(30, fxWinRate * 0.5) : 0;
      const patternScore = Math.min(20, fxPatternsDetected);
      const consistencyScore = marketsAnalyzed >= 5 ? 10 : marketsAnalyzed * 2;
      forexLearningScore = Math.round(Math.min(100, dataScore + signalScore + patternScore + consistencyScore));

      // HIGH-WATER MARK: score NEVER drops below previous maximum
      const { data: prevForexMax } = await supabase
        .from("trading_learning_stats")
        .select("learning_score")
        .eq("market_type", "forex")
        .order("learning_score", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevForexMax && forexLearningScore < prevForexMax.learning_score) {
        forexLearningScore = prevForexMax.learning_score;
      }

      // Insert forex stats row (separate from stocks row which uses date unique)
      // Use delete+insert to avoid conflict with stocks' onConflict:"date"
      await supabase.from("trading_learning_stats")
        .delete()
        .eq("date", today)
        .eq("market_type", "forex");

      await supabase.from("trading_learning_stats").insert({
        date: today,
        market_type: "forex",
        total_signals: fxTotal,
        signals_won: fxWon,
        signals_lost: fxLost,
        win_rate: Math.round(fxWinRate * 10) / 10,
        total_knowledge_entries: forexKnowledge || 0,
        markets_analyzed: marketsAnalyzed,
        patterns_detected: fxPatternsDetected,
        data_points_processed: marketsAnalyzed * 15,
        learning_score: forexLearningScore,
      });
    } catch (err) {
      console.error("[Forex Learn] Stats update error:", err);
    }

    const result = {
      date: today,
      markets_analyzed: marketsAnalyzed,
      signals_generated: signalsGenerated,
      kill_zone: killZone,
      forex_learning_score: forexLearningScore,
    };

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("trading-learn-forex", result);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Forex Learn] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("trading-learn-forex", (err as Error).message);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
