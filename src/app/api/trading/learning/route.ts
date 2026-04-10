import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET: Retrieve learning stats — supports per-market breakdown
 * ?userId=xxx — optional, includes user's own signals
 * ?market=stocks|forex|all — filter by market (default: all)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const market = url.searchParams.get("market") || "all";

  // Get latest learning stats (per market or global)
  let statsQuery = supabase
    .from("trading_learning_stats")
    .select("*")
    .order("date", { ascending: false })
    .limit(7);

  if (market === "stocks") {
    statsQuery = statsQuery.eq("market_type", "stocks");
  } else if (market === "forex") {
    statsQuery = statsQuery.eq("market_type", "forex");
  }
  // "all" returns both

  const { data: stats } = await statsQuery;

  // Signal stats by market
  const marketTypes = market === "stocks" ? ["stocks"]
    : market === "forex" ? ["forex", "gold"]
    : ["stocks", "forex", "gold"];

  let signalQuery = supabase
    .from("trading_signal_log")
    .select("outcome, market_type")
    .not("outcome", "is", null)
    .in("market_type", marketTypes);

  if (userId) {
    signalQuery = signalQuery.or(`user_id.eq.${userId},user_id.is.null`);
  } else {
    signalQuery = signalQuery.is("user_id", null);
  }

  const { data: signals } = await signalQuery;

  const totalSignals = signals?.length || 0;
  const wins = signals?.filter(s => s.outcome === "win").length || 0;
  const losses = signals?.filter(s => s.outcome === "loss").length || 0;
  const winRate = totalSignals > 0 ? (wins / totalSignals * 100) : 0;

  // Per-market breakdown (always returned for dashboard)
  const stocksSignals = signals?.filter(s => s.market_type === "stocks") || [];
  const forexSignals = signals?.filter(s => s.market_type === "forex" || s.market_type === "gold") || [];

  const stocksWins = stocksSignals.filter(s => s.outcome === "win").length;
  const forexWins = forexSignals.filter(s => s.outcome === "win").length;

  // Latest scores per market
  const stocksScore = stats?.find(s => s.market_type === "stocks")?.learning_score || 0;
  const forexScore = stats?.find(s => s.market_type === "forex")?.learning_score || 0;

  // Total knowledge
  const { count: totalKnowledge } = await supabase
    .from("trading_knowledge")
    .select("id", { count: "exact", head: true });

  const { count: daysLearning } = await supabase
    .from("trading_learning_stats")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    // Global (backwards compatible)
    learning_score: market === "forex" ? forexScore : market === "stocks" ? stocksScore : Math.max(stocksScore, forexScore),
    total_knowledge: totalKnowledge || 0,
    total_signals: totalSignals,
    signals_won: wins,
    signals_lost: losses,
    win_rate: Math.round(winRate * 10) / 10,
    days_learning: daysLearning || 0,

    // Per-market breakdown
    by_market: {
      stocks: {
        score: stocksScore,
        signals: stocksSignals.length,
        wins: stocksWins,
        win_rate: stocksSignals.length > 0 ? Math.round(stocksWins / stocksSignals.length * 1000) / 10 : 0,
      },
      forex: {
        score: forexScore,
        signals: forexSignals.length,
        wins: forexWins,
        win_rate: forexSignals.length > 0 ? Math.round(forexWins / forexSignals.length * 1000) / 10 : 0,
      },
    },

    history: (stats || []).reverse().map(s => ({
      date: s.date,
      score: s.learning_score,
      market_type: s.market_type || "stocks",
      markets: s.markets_analyzed,
      patterns: s.patterns_detected,
      data_points: s.data_points_processed,
    })),
  });
}
