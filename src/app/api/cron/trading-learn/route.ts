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
  const today = new Date().toISOString().slice(0, 10);
  let dataPoints = 0;
  let patternsDetected = 0;
  let marketsAnalyzed = 0;

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

    // ── 2. SMC ANALYSIS via Python Engine ──
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
                else { pnl = currentPrice - sig.entry_price; outcome = pnl > 0 ? "win" : "loss"; }
              } else {
                if (currentPrice <= sig.take_profit) { outcome = "win"; pnl = sig.entry_price - sig.take_profit; }
                else if (currentPrice >= sig.stop_loss) { outcome = "loss"; pnl = sig.entry_price - sig.stop_loss; }
                else { pnl = sig.entry_price - currentPrice; outcome = pnl > 0 ? "win" : "loss"; }
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

    const { data: signalStats } = await supabase
      .from("trading_signal_log").select("outcome");

    const totalSignals = signalStats?.length || 0;
    const signalsWon = signalStats?.filter(s => s.outcome === "win").length || 0;
    const signalsLost = signalStats?.filter(s => s.outcome === "loss").length || 0;
    const winRate = totalSignals > 0 ? (signalsWon / totalSignals * 100) : 0;

    // Learning score: weighted combination of data quantity + signal quality
    const dataScore = Math.min(40, (totalKnowledge || 0) / 10); // Max 40 from data
    const signalScore = totalSignals > 5 ? Math.min(30, winRate * 0.5) : 0; // Max 30 from win rate
    const patternScore = Math.min(20, patternsDetected); // Max 20 from patterns today
    const consistencyScore = marketsAnalyzed >= 5 ? 10 : marketsAnalyzed * 2; // Max 10 from coverage
    const learningScore = Math.round(Math.min(100, dataScore + signalScore + patternScore + consistencyScore));

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

    return NextResponse.json({
      ok: true,
      date: today,
      markets_analyzed: marketsAnalyzed,
      patterns_detected: patternsDetected,
      data_points: dataPoints,
      learning_score: learningScore,
      signals_tracked: totalSignals,
      win_rate: winRate,
    });
  } catch (err) {
    console.error("[Trading Learn] Error:", err);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
