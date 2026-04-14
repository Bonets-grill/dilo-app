import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getQuote,
  getRecommendations,
  getMarketNews,
  getEarningsCalendar,
  getNewsSentiment,
} from "@/lib/finnhub/client";
import { analyzeSMC, isEngineAvailable } from "@/lib/trading/engine-client";
import { logCronResult } from "@/lib/cron/logger";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * DILO Trading Learning Cron
 * Runs daily at 7:00 AM Canary time (before London session)
 *
 * What it does:
 * 1. Scans key markets for the day (quotes, analyst data, news sentiment)
 * 2. Runs SMC analysis via Python engine on key assets
 * 3. Checks previous signals — did they win or lose?
 * 4. Stores everything in trading_knowledge
 * 5. Updates learning_stats (the progress bar)
 */
export async function GET() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat

  // WEEKEND GUARD — markets are closed, running would reset score to near-zero
  if (day === 0 || day === 6) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Weekend — markets closed" });
  }

  const today = now.toISOString().slice(0, 10);
  let dataPoints = 0;
  let patternsDetected = 0;
  let marketsAnalyzed = 0;
  let signalsGenerated = 0;

  try {
    // ── 1. SCAN KEY MARKETS ──
    const watchlist = ["AAPL", "NVDA", "TSLA", "AMZN", "MSFT", "META", "GOOGL", "SPY", "QQQ"];
    const forexWatch = ["GBP/JPY", "EUR/GBP", "EUR/USD"];

    for (const sym of watchlist) {
      try {
        const [quote, recs, sentiment] = await Promise.all([
          getQuote(sym).catch(() => null),
          getRecommendations(sym).catch(() => []),
          getNewsSentiment(sym).catch(() => null),
        ]);

        if (quote && quote.c > 0) {
          const latest = recs[0];
          const buyCount = latest ? latest.strongBuy + latest.buy : 0;
          const sellCount = latest ? latest.sell + latest.strongSell : 0;
          const holdCount = latest ? latest.hold : 0;
          const bullish = sentiment?.sentiment?.bullishPercent || 0;

          await supabase.from("trading_knowledge").insert({
            date: today,
            category: "market_scan",
            symbol: sym,
            data: {
              price: quote.c,
              change_pct: quote.dp,
              high: quote.h,
              low: quote.l,
              analyst_buy: buyCount,
              analyst_hold: holdCount,
              analyst_sell: sellCount,
              sentiment_bullish: bullish,
              articles_this_week: sentiment?.buzz?.articlesInLastWeek || 0,
            },
            confidence: buyCount > sellCount * 2 ? 80 : buyCount > sellCount ? 60 : 40,
          });

          dataPoints += 5; // price, change, analysts, sentiment, articles
          marketsAnalyzed++;
        }
      } catch { /* skip individual symbol errors */ }
    }

    // ── 2. ANTI-DRAWDOWN CHECK (per-symbol, calculated inside signal loop) ──
    // Moved inside the signal generation loop for per-symbol isolation
    // "Aflojar filtros durante drawdown es catastrófico" — prop firm data

    // ── 3. SMC ANALYSIS via Python Engine ──
    const engineUp = await isEngineAvailable();
    if (engineUp) {
      for (const sym of watchlist.slice(0, 5)) { // Top 5 to save engine calls
        try {
          const smc = await analyzeSMC(sym, "1d", "3mo");
          if (smc && !smc.error) {
            const sweepsCount = (smc.sweeps as unknown[])?.length || 0;
            const obsCount = (smc.order_blocks as unknown[])?.length || 0;
            const fvgsCount = (smc.fvgs as unknown[])?.length || 0;
            const bosCount = (smc.bos as unknown[])?.length || 0;

            await supabase.from("trading_knowledge").insert({
              date: today,
              category: "pattern",
              symbol: sym,
              data: {
                bias: smc.bias,
                sweeps: sweepsCount,
                order_blocks: obsCount,
                fvgs: fvgsCount,
                bos: bosCount,
                has_signal: !!smc.signal,
                signal_side: smc.signal?.side || null,
                signal_confidence: smc.signal?.confidence || null,
              },
              confidence: smc.signal ? (smc.signal as { confidence?: number }).confidence || 50 : 30,
            });

            patternsDetected += sweepsCount + obsCount + fvgsCount + bosCount;
            dataPoints += 10;

            // Auto-generate signal if SMC found a high-confidence setup
            // DEDUP: skip if we already generated a signal for this symbol today
            const { data: existingSignal } = await supabase
              .from("trading_signal_log")
              .select("id")
              .eq("symbol", sym)
              .gte("created_at", `${today}T00:00:00Z`)
              .limit(1);

            const signal = smc.signal as { side?: string; entry_price?: number; stop_loss?: number; take_profit?: number; confidence?: number; setup_type?: string; reasoning?: string[] } | null;
            if (signal && signal.entry_price && signal.stop_loss && signal.take_profit && (signal.confidence || 0) >= 75 && (!existingSignal || existingSignal.length === 0)) {
              // Apply intelligence filters before saving signal
              // Small delay to avoid Finnhub rate limiting (30 calls/sec limit)
              await new Promise(r => setTimeout(r, 1500));
              const { applySignalFilters } = await import("@/lib/trading/intelligence");
              let filterResult;
              try {
                filterResult = await applySignalFilters(
                  sym,
                  (signal.side || "BUY") as "BUY" | "SELL",
                  signal.confidence || 60,
                );
              } catch (filterErr) {
                console.error(`[Trading Learn] Filter error for ${sym}:`, filterErr);
                filterResult = { confidenceAdjustment: 0, filtersApplied: ["filter_error"], context: ["Filtros no disponibles"], blocked: false };
              }

              // Query trading memory for historical context
              let memoryAdjustment = 0;
              let memoryContext: string[] = [];
              try {
                const { queryMemory } = await import("@/lib/trading/memory");
                const { detectRegime } = await import("@/lib/trading/intelligence");
                const regime = await detectRegime().catch(() => ({ regime: "unknown" }));
                const memory = await queryMemory(sym, signal.setup_type || "smc_auto", "stocks", regime.regime);
                memoryAdjustment = memory.confidenceAdjustment;
                memoryContext = [...memory.context, ...memory.warnings];
              } catch { /* skip if memory not available */ }

              // Per-symbol drawdown check
              let drawdownPenalty = 0;
              try {
                const { data: symRecent } = await supabase
                  .from("trading_signal_log")
                  .select("outcome")
                  .eq("symbol", sym)
                  .not("outcome", "is", null)
                  .neq("outcome", "expired")
                  .order("created_at", { ascending: false })
                  .limit(10);
                if (symRecent && symRecent.length >= 10) {
                  const symWins = symRecent.filter(s => s.outcome === "win").length;
                  const symWR = (symWins / symRecent.length) * 100;
                  if (symWR < 40) {
                    drawdownPenalty = -15;
                    memoryContext.push(`DRAWDOWN ${sym}: ${symWR.toFixed(0)}% win rate en últimas 10 señales. Penalización -15.`);
                  }
                }
              } catch { /* skip */ }

              const adjustedConfidence = Math.max(10, Math.min(95, (signal.confidence || 60) + filterResult.confidenceAdjustment + drawdownPenalty + memoryAdjustment));

              // Always save signal with filters applied (soft filters only — never block)
              // Data collection: after 30 days, compare win rate by filter to determine real weights
              await supabase.from("trading_signal_log").insert({
                user_id: null,
                symbol: sym,
                side: signal.side || "BUY",
                entry_price: signal.entry_price,
                stop_loss: signal.stop_loss,
                take_profit: signal.take_profit,
                setup_type: signal.setup_type || "smc_auto",
                confidence: adjustedConfidence,
                reasoning: [
                  ...(signal.reasoning || [`Auto: ${smc.bias} bias, ${sweepsCount} sweeps, ${obsCount} OBs`]),
                  ...filterResult.context,
                  ...memoryContext,
                ],
                filters_applied: filterResult.filtersApplied,
              });
              signalsGenerated++;
            }
          }
        } catch { /* skip */ }
      }
    }

    // ── 3. MARKET NEWS ──
    try {
      const news = await getMarketNews("general");
      if (news && news.length > 0) {
        await supabase.from("trading_knowledge").insert({
          date: today,
          category: "insight",
          symbol: null,
          data: {
            type: "market_news",
            headlines: news.slice(0, 10).map(n => ({
              headline: n.headline,
              source: n.source,
              related: n.related,
            })),
          },
          confidence: 50,
        });
        dataPoints += news.length;
      }
    } catch { /* skip */ }

    // ── 4. EARNINGS CALENDAR ──
    try {
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const earnings = await getEarningsCalendar(today, nextWeek);
      if (earnings?.earningsCalendar?.length > 0) {
        const relevant = earnings.earningsCalendar.filter(
          (e: { symbol: string }) => watchlist.includes(e.symbol)
        );
        if (relevant.length > 0) {
          await supabase.from("trading_knowledge").insert({
            date: today,
            category: "insight",
            symbol: null,
            data: {
              type: "earnings_upcoming",
              events: relevant.map((e: { symbol: string; date: string; epsEstimate: number | null }) => ({
                symbol: e.symbol,
                date: e.date,
                eps_estimate: e.epsEstimate,
              })),
            },
            confidence: 70,
          });
          dataPoints += relevant.length;
        }
      }
    } catch { /* skip */ }

    // ── 5. CHECK PREVIOUS SIGNALS ──
    try {
      const { data: unresolvedSignals } = await supabase
        .from("trading_signal_log")
        .select("*")
        .is("outcome", null)
        .lt("created_at", new Date(Date.now() - 86400000).toISOString()); // Older than 24h

      if (unresolvedSignals) {
        for (const sig of unresolvedSignals) {
          try {
            const quote = await getQuote(sig.symbol);
            if (quote && quote.c > 0) {
              const currentPrice = quote.c;
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

              const pnlPct = sig.entry_price > 0 ? (pnl / sig.entry_price * 100) : 0;

              await supabase.from("trading_signal_log").update({
                outcome,
                exit_price: currentPrice,
                pnl: Math.round(pnl * 100) / 100,
                pnl_pct: Math.round(pnlPct * 100) / 100,
                hit_tp: outcome === "win" && (sig.side === "BUY" ? currentPrice >= sig.take_profit : currentPrice <= sig.take_profit),
                hit_sl: outcome === "loss" && (sig.side === "BUY" ? currentPrice <= sig.stop_loss : currentPrice >= sig.stop_loss),
                resolved_at: new Date().toISOString(),
              }).eq("id", sig.id);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }

    // ── 6. UPDATE LEARNING STATS ──
    const { count: totalKnowledge } = await supabase
      .from("trading_knowledge").select("id", { count: "exact", head: true });

    // System-level stats: count system signals (user_id IS NULL) for global learning score
    const { data: signalStats } = await supabase
      .from("trading_signal_log").select("outcome, user_id")
      .not("outcome", "is", null);

    const totalSignals = signalStats?.length || 0;
    const signalsWon = signalStats?.filter(s => s.outcome === "win").length || 0;
    const signalsLost = signalStats?.filter(s => s.outcome === "loss").length || 0;
    const winRate = totalSignals > 0 ? (signalsWon / totalSignals * 100) : 0;

    // Learning score: weighted combination of data quantity + signal quality
    const dataScore = Math.min(40, (totalKnowledge || 0) / 10); // Max 40 from data
    const signalScore = totalSignals > 0 ? Math.min(30, winRate * 0.5) : 0; // Max 30 from win rate
    const patternScore = Math.min(20, patternsDetected); // Max 20 from patterns today
    const consistencyScore = marketsAnalyzed >= 5 ? 10 : marketsAnalyzed * 2; // Max 10 from coverage
    let learningScore = Math.round(Math.min(100, dataScore + signalScore + patternScore + consistencyScore));

    // HIGH-WATER MARK: score NEVER drops below previous maximum
    // This prevents rogue cron triggers or bad data days from resetting progress
    const { data: previousStats } = await supabase
      .from("trading_learning_stats")
      .select("learning_score")
      .order("learning_score", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousMax = previousStats?.learning_score || 0;
    if (learningScore < previousMax) {
      learningScore = previousMax;
    }

    await supabase.from("trading_learning_stats").upsert({
      date: today,
      total_signals: totalSignals,
      signals_won: signalsWon,
      signals_lost: signalsLost,
      win_rate: Math.round(winRate * 10) / 10,
      total_knowledge_entries: totalKnowledge || 0,
      markets_analyzed: marketsAnalyzed,
      patterns_detected: patternsDetected,
      data_points_processed: dataPoints,
      learning_score: learningScore,
    }, { onConflict: "date" });

    const result = {
      date: today,
      markets_analyzed: marketsAnalyzed,
      patterns_detected: patternsDetected,
      data_points: dataPoints,
      learning_score: learningScore,
      signals_generated: signalsGenerated,
      signals_tracked: totalSignals,
      win_rate: winRate,
    };
    await logCronResult("trading-learn", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Trading Learn] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("trading-learn", (err as Error).message);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
