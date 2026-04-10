import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getForexAccount, getForexPositions, getForexQuote, isForexAvailable } from "@/lib/ig/client";

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
    // Fetch live quotes for watchlist
    const WATCHLIST = ["XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY", "EUR/GBP", "EUR/JPY"];
    // IG returns prices in "points" — need to normalize to standard forex prices
    const SCALE: Record<string, number> = {
      "XAU/USD": 1,       // Gold already in correct format from IG
      "EUR/USD": 10000,
      "GBP/USD": 10000,
      "USD/JPY": 100,
      "GBP/JPY": 100,
      "EUR/GBP": 10000,
      "EUR/JPY": 100,
    };

    const quotesPromises = WATCHLIST.map(async (instrument) => {
      try {
        const q = await getForexQuote(instrument);
        const scale = SCALE[instrument] || 1;
        return {
          instrument,
          bid: q.bid / scale,
          offer: q.offer / scale,
          change_pct: q.change_pct,
          low: q.low / scale,
          high: q.high / scale,
          market_status: q.market_status,
        };
      } catch {
        return { instrument, bid: 0, offer: 0, change_pct: 0, low: 0, high: 0, market_status: "unknown" };
      }
    });

    const [account, positionsData, quotesResults, signalsRes, statsRes, learningRes] = await Promise.all([
      getForexAccount().catch(() => null),
      getForexPositions().catch(() => ({ positions: [] })),
      Promise.all(quotesPromises),
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

    // Determine kill zone and session status
    const now = new Date();
    const utcH = now.getUTCHours();
    let killZone: string | null = null;
    if (utcH >= 7 && utcH < 9) killZone = "London";
    else if (utcH >= 12 && utcH < 14) killZone = "New York";

    let session = "closed";
    if (utcH >= 22 || utcH < 7) session = "Sydney/Tokyo";
    else if (utcH >= 7 && utcH < 12) session = "London";
    else if (utcH >= 12 && utcH < 17) session = "New York";
    else if (utcH >= 17 && utcH < 22) session = "Late NY";

    // Filter only quotes that returned data
    const quotes = quotesResults.filter(q => q.bid > 0);

    return NextResponse.json({
      account: account || { balance: 0, available: 0, profit_loss: 0, deposit: 0 },
      positions: positionsData.positions || [],
      quotes,
      session,
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
