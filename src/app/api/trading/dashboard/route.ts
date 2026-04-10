import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAlpacaKeys } from "@/lib/oauth/alpaca";
import { getAccount, getPositions, getPortfolioHistory } from "@/lib/alpaca/client";
import { getQuote } from "@/lib/finnhub/client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Trading Dashboard API — returns all data needed for the trading tab.
 * Called by the frontend with polling (every 30s when tab is active).
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const keys = await getAlpacaKeys(userId);
  if (!keys) return NextResponse.json({ error: "alpaca_not_connected" }, { status: 401 });

  try {
    // Fetch everything in parallel
    const [account, positions, histWeek, histMonth, profile, learningStats, recentSignals] = await Promise.all([
      getAccount(keys),
      getPositions(keys),
      getPortfolioHistory(keys, { period: "1W", timeframe: "1D" }).catch(() => null),
      getPortfolioHistory(keys, { period: "1M", timeframe: "1D" }).catch(() => null),
      supabase.from("trading_profiles").select("*").eq("user_id", userId).single().then(r => r.data),
      supabase.from("trading_learning_stats").select("*").order("date", { ascending: false }).limit(1).then(r => r.data?.[0] || null),
      supabase.from("trading_signal_log").select("symbol, side, entry_price, stop_loss, take_profit, confidence, outcome, pnl, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(5).then(r => r.data || []),
    ]);

    const equity = parseFloat(account.equity);
    const lastEquity = parseFloat(account.last_equity);
    const cash = parseFloat(account.cash);
    const buyingPower = parseFloat(account.buying_power);
    const dayPnl = equity - lastEquity;
    const dayPnlPct = lastEquity > 0 ? (dayPnl / lastEquity * 100) : 0;

    // Weekly & monthly P&L
    // IMPORTANT: Alpaca portfolio history does NOT include today's intradía P&L
    // We add dayPnl (equity - last_equity) to get the real total
    let weekPnl = 0, weekPnlPct = 0, monthPnl = 0, monthPnlPct = 0;
    if (histWeek?.profit_loss?.length) {
      const histWeekPnl = histWeek.profit_loss.reduce((s: number, v: number) => s + (v || 0), 0);
      weekPnl = histWeekPnl + dayPnl; // Add today's intradía
      weekPnlPct = histWeek.base_value > 0 ? (weekPnl / histWeek.base_value * 100) : 0;
    } else {
      weekPnl = dayPnl; // Only today's data
      weekPnlPct = dayPnlPct;
    }
    if (histMonth?.profit_loss?.length) {
      const histMonthPnl = histMonth.profit_loss.reduce((s: number, v: number) => s + (v || 0), 0);
      monthPnl = histMonthPnl + dayPnl; // Add today's intradía
      monthPnlPct = histMonth.base_value > 0 ? (monthPnl / histMonth.base_value * 100) : 0;
    } else {
      monthPnl = dayPnl;
      monthPnlPct = dayPnlPct;
    }
    // Fix -0.00% display issue
    if (Math.abs(weekPnlPct) < 0.005) weekPnlPct = 0;
    if (Math.abs(monthPnlPct) < 0.005) monthPnlPct = 0;

    // Format positions
    const positionsData = positions.map(p => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      avgEntry: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      marketValue: parseFloat(p.market_value),
      unrealizedPl: parseFloat(p.unrealized_pl),
      unrealizedPlPct: parseFloat(p.unrealized_plpc) * 100,
      changeToday: parseFloat(p.change_today) * 100,
    })).sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue));

    // Equity curve from monthly history
    const equityCurve = histMonth ? histMonth.timestamp.map((t: number, i: number) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      equity: histMonth.equity[i],
      pnl: histMonth.profit_loss[i],
    })) : [];

    // Profile session status
    const today = new Date().toISOString().slice(0, 10);
    const sessionStatus = profile ? {
      tradesToday: profile.last_reset_date === today ? profile.trades_today : 0,
      maxTrades: profile.max_trades_per_day,
      pnlToday: dayPnl, // Use Alpaca as single source of truth (real-time)
      dailyGoal: profile.daily_goal,
      sessionClosed: profile.last_reset_date === today ? profile.session_closed : false,
      riskPerTrade: profile.risk_per_trade_amount,
      accountSize: profile.account_size,
      tradingStyle: profile.trading_style,
      openPositions: positions.length, // For UI clarity
    } : null;

    return NextResponse.json({
      account: {
        equity,
        cash,
        buyingPower,
        mode: keys.paperMode ? "paper" : "live",
      },
      pnl: {
        day: { amount: dayPnl, pct: dayPnlPct },
        week: { amount: weekPnl, pct: weekPnlPct },
        month: { amount: monthPnl, pct: monthPnlPct },
      },
      positions: positionsData,
      equityCurve,
      session: sessionStatus,
      learning: learningStats ? {
        score: learningStats.learning_score,
        winRate: learningStats.win_rate,
        totalSignals: learningStats.total_signals,
        marketsAnalyzed: learningStats.markets_analyzed,
      } : null,
      signals: recentSignals,
    });
  } catch (err) {
    console.error("[Trading Dashboard] Error:", err);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
