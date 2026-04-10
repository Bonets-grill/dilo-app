import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getForexAccount, getForexPositions, isForexAvailable } from "@/lib/ig/client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const available = await isForexAvailable();
  if (!available) {
    return NextResponse.json({ error: "forex_unavailable" }, { status: 503 });
  }

  try {
    const [account, positionsData, signalsRes, statsRes, learningRes] = await Promise.all([
      getForexAccount().catch(() => null),
      getForexPositions().catch(() => ({ positions: [] })),
      supabase
        .from("trading_signal_log")
        .select("symbol, side, entry_price, stop_loss, take_profit, confidence, outcome, pnl, pnl_pct, market_type, filters_applied, created_at, resolved_at")
        .in("market_type", ["forex", "gold"])
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("trading_signal_log")
        .select("outcome, market_type")
        .in("market_type", ["forex", "gold"])
        .not("outcome", "is", null),
      supabase
        .from("trading_learning_stats")
        .select("learning_score, markets_analyzed, patterns_detected")
        .eq("market_type", "forex")
        .order("date", { ascending: false })
        .limit(1),
    ]);

    const signals = signalsRes.data || [];
    const resolved = statsRes.data || [];

    const wins = resolved.filter((s) => s.outcome === "win").length;
    const losses = resolved.filter((s) => s.outcome === "loss").length;
    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    const forexSignals = resolved.filter((s) => s.market_type === "forex");
    const goldSignals = resolved.filter((s) => s.market_type === "gold");
    const forexWins = forexSignals.filter((s) => s.outcome === "win").length;
    const goldWins = goldSignals.filter((s) => s.outcome === "win").length;

    // Determine kill zone status
    const now = new Date();
    const utcH = now.getUTCHours();
    let killZone: string | null = null;
    if (utcH >= 7 && utcH < 9) killZone = "London";
    else if (utcH >= 12 && utcH < 14) killZone = "New York";

    return NextResponse.json({
      account: account || { balance: 0, available: 0, profit_loss: 0, deposit: 0 },
      positions: positionsData.positions || [],
      signals,
      stats: {
        totalSignals: resolved.length,
        wins,
        losses,
        winRate,
        forexWinRate: forexSignals.length > 0 ? (forexWins / forexSignals.length) * 100 : 0,
        goldWinRate: goldSignals.length > 0 ? (goldWins / goldSignals.length) * 100 : 0,
      },
      killZone,
      learning: learningRes.data?.[0] ? {
        score: learningRes.data[0].learning_score,
        marketsAnalyzed: learningRes.data[0].markets_analyzed,
        patternsDetected: learningRes.data[0].patterns_detected,
      } : null,
    });
  } catch (e) {
    console.error("[forex-dashboard] Error:", e);
    return NextResponse.json({ error: "fetch_error" }, { status: 500 });
  }
}
