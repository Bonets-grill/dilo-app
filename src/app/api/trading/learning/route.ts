import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET: Retrieve learning stats for the progress bar
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  // Get latest learning stats
  const { data: stats } = await supabase
    .from("trading_learning_stats")
    .select("*")
    .order("date", { ascending: false })
    .limit(7);

  // Get total knowledge entries
  const { count: totalKnowledge } = await supabase
    .from("trading_knowledge")
    .select("id", { count: "exact", head: true });

  // Get signal stats — user's own signals + system signals (user_id IS NULL)
  const { data: signals } = await supabase
    .from("trading_signal_log")
    .select("outcome")
    .not("outcome", "is", null)
    .or(userId ? `user_id.eq.${userId},user_id.is.null` : "user_id.is.null");

  const totalSignals = signals?.length || 0;
  const wins = signals?.filter(s => s.outcome === "win").length || 0;
  const winRate = totalSignals > 0 ? (wins / totalSignals * 100) : 0;

  // Latest learning score
  const latestScore = stats?.[0]?.learning_score || 0;

  // Days of learning
  const { count: daysLearning } = await supabase
    .from("trading_learning_stats")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    learning_score: latestScore,
    total_knowledge: totalKnowledge || 0,
    total_signals: totalSignals,
    signals_won: wins,
    win_rate: Math.round(winRate * 10) / 10,
    days_learning: daysLearning || 0,
    history: (stats || []).reverse().map(s => ({
      date: s.date,
      score: s.learning_score,
      markets: s.markets_analyzed,
      patterns: s.patterns_detected,
      data_points: s.data_points_processed,
    })),
  });
}
