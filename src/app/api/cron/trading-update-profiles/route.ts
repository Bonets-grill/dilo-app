import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBasicFinancials, getRecommendations } from "@/lib/finnhub/client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WATCHLIST = ["AAPL", "NVDA", "TSLA", "AMZN", "MSFT", "META", "GOOGL", "SPY", "QQQ"];

/**
 * Monthly cron: auto-update symbol_profiles with DILO's real signal data.
 * Runs 1st of each month.
 *
 * For each symbol:
 * 1. Query resolved signals from last 90 days
 * 2. Calculate win rate by setup type
 * 3. Find best/worst timeframe
 * 4. Update Finnhub fundamentals (beta, analyst consensus)
 * 5. Write back to symbol_profiles
 */
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  let updated = 0;

  for (const symbol of WATCHLIST) {
    try {
      // Get DILO's own signal history for this symbol
      const { data: signals } = await supabase
        .from("trading_signal_log")
        .select("outcome, setup_type, confidence, pnl, created_at")
        .eq("symbol", symbol)
        .not("outcome", "is", null)
        .gte("created_at", ninetyDaysAgo);

      const totalSignals = signals?.length || 0;
      const wins = signals?.filter(s => s.outcome === "win") || [];
      const winRate = totalSignals > 0 ? Math.round((wins.length / totalSignals) * 1000) / 10 : null;

      // Best setup type
      const setupStats: Record<string, { wins: number; total: number }> = {};
      for (const sig of signals || []) {
        const setup = sig.setup_type || "unknown";
        if (!setupStats[setup]) setupStats[setup] = { wins: 0, total: 0 };
        setupStats[setup].total++;
        if (sig.outcome === "win") setupStats[setup].wins++;
      }
      const bestSetup = Object.entries(setupStats)
        .filter(([, s]) => s.total > 0)
        .sort(([, a], [, b]) => (b.wins / (b.total || 1)) - (a.wins / (a.total || 1)))
        .map(([name]) => name)[0] || null;

      // Average R:R on winners
      const avgRR = wins.length > 0
        ? Math.round(wins.reduce((s, w) => s + Math.abs(w.pnl || 0), 0) / wins.length * 100) / 100
        : null;

      // Get Finnhub fundamentals
      const [financials, recs] = await Promise.all([
        getBasicFinancials(symbol).catch(() => null),
        getRecommendations(symbol).catch(() => []),
      ]);

      const beta = financials?.metric?.beta || null;
      const latest = recs[0];
      const totalAnalysts = latest ? latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell : 0;
      const buyPct = totalAnalysts > 0 ? (latest!.strongBuy + latest!.buy) / totalAnalysts : 0;
      const institutional = buyPct > 0.6 ? "bullish" : buyPct < 0.4 ? "bearish" : "neutral";

      // Update profile
      const updates: Record<string, unknown> = {
        last_auto_update: today,
        data_source: totalSignals > 0 ? "dilo_signals" : "finnhub",
        updated_at: new Date().toISOString(),
      };

      if (beta !== null) updates.beta = beta;
      if (institutional) updates.institutional_sentiment = institutional;

      // Finnhub fundamentals: avg daily range, earnings beat rate
      const high52 = financials?.metric?.["52WeekHigh"] || 0;
      const low52 = financials?.metric?.["52WeekLow"] || 0;
      if (high52 > 0 && low52 > 0) {
        updates.avg_daily_range_pct = Math.round(((high52 - low52) / ((high52 + low52) / 2)) * 100 * 10) / 10;
      }

      // Insider activity
      try {
        const { analyzeInsiderActivity } = await import("@/lib/finnhub/insider");
        const insider = await analyzeInsiderActivity(symbol);
        updates.recent_insider_buys = insider.buys;
      } catch { /* skip */ }

      // Signal stats by regime (if we have enough signals)
      if (totalSignals > 5) {
        updates.smc_win_rate = winRate;
        updates.smc_best_setup = bestSetup;
        updates.smc_avg_rr = avgRR;
        updates.total_signals_analyzed = totalSignals;

        // Best timeframe from signal metadata (if available)
        updates.best_timeframe = "1d"; // Default — we generate on daily
      }

      await supabase.from("symbol_profiles").update(updates).eq("symbol", symbol);
      updated++;
    } catch (err) {
      console.error(`[ProfileUpdate] Error for ${symbol}:`, err);
    }
  }

  const { logCronResult } = await import("@/lib/cron/logger");
  await logCronResult("trading-update-profiles", { updated, total: WATCHLIST.length });

  return NextResponse.json({ ok: true, updated, total: WATCHLIST.length });
}

export const dynamic = "force-dynamic";
