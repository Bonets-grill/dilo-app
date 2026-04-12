import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Strategy v2 Status — returns daily plan + v2 signal metrics.
 * Called by the trading dashboard to show "Plan del día" section.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const utcHour = now.getUTCHours();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat

  try {
    // Fetch in parallel
    const [planRes, v2SignalsRes, allSignalsRes] = await Promise.all([
      // Today's strategy plan
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("daily_strategy") as any)
        .select("symbol, htf_bias, trade_direction, zone, swing_high, swing_low, equilibrium, atr, key_levels")
        .eq("date", today)
        .order("symbol"),

      // v2 signals (last 7 days)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("trading_signal_log") as any)
        .select("symbol, side, confidence, outcome, pnl_pct, created_at, filters_applied, setup_type")
        .eq("source", "dilo_strategy_v2")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(20),

      // All resolved v2 signals (for win rate)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("trading_signal_log") as any)
        .select("outcome, pnl_pct, confidence")
        .eq("source", "dilo_strategy_v2")
        .not("outcome", "is", null),
    ]);

    const plans = planRes.data || [];
    const v2Signals = v2SignalsRes.data || [];
    const resolvedV2 = allSignalsRes.data || [];

    // Calculate v2 metrics
    const wins = resolvedV2.filter((s: { outcome: string }) => s.outcome === "win").length;
    const losses = resolvedV2.filter((s: { outcome: string }) => s.outcome === "loss").length;
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
    const avgConfidence = resolvedV2.length > 0
      ? Math.round(resolvedV2.reduce((s: number, r: { confidence: number }) => s + (r.confidence || 0), 0) / resolvedV2.length)
      : 0;

    // Kill zone detection (UTC)
    let killZone: string | null = null;
    let killZoneEnd = "";
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (isWeekday) {
      if (utcHour >= 7 && utcHour < 10) {
        killZone = "London";
        killZoneEnd = "10:00 UTC";
      } else if (utcHour >= 8 && utcHour < 11) {
        killZone = "London";
        killZoneEnd = "11:00 UTC";
      } else if (utcHour >= 13 && utcHour < 16) {
        killZone = "New York";
        killZoneEnd = "16:00 UTC";
      }
    }

    // Silver bullet windows
    let silverBullet: string | null = null;
    if (isWeekday) {
      if (utcHour >= 8 && utcHour < 9) silverBullet = "London SB";
      else if (utcHour >= 15 && utcHour < 16) silverBullet = "NY AM SB";
      else if (utcHour >= 19 && utcHour < 20) silverBullet = "NY PM SB";
    }

    // Next kill zone
    let nextKillZone = "";
    if (!killZone && isWeekday) {
      if (utcHour < 7) nextKillZone = "London 07:00 UTC";
      else if (utcHour >= 10 && utcHour < 13) nextKillZone = "New York 13:00 UTC";
      else if (utcHour >= 16) nextKillZone = "Tomorrow 07:00 UTC";
    } else if (!isWeekday) {
      nextKillZone = "Monday 07:00 UTC";
    }

    // Strategy agent status
    const strategyRan = plans.length > 0;
    const bullish = plans.filter((p: { trade_direction: string }) => p.trade_direction === "LONG_ONLY");
    const bearish = plans.filter((p: { trade_direction: string }) => p.trade_direction === "SHORT_ONLY");
    const neutral = plans.filter((p: { trade_direction: string }) => p.trade_direction === "NO_TRADE");

    return NextResponse.json({
      date: today,
      strategy: {
        active: strategyRan,
        plans: plans.map((p: Record<string, unknown>) => ({
          symbol: p.symbol,
          bias: p.htf_bias,
          direction: p.trade_direction,
          zone: p.zone,
          swingHigh: p.swing_high,
          swingLow: p.swing_low,
          equilibrium: p.equilibrium,
          atr: p.atr,
        })),
        summary: {
          bullish: bullish.length,
          bearish: bearish.length,
          neutral: neutral.length,
          total: plans.length,
        },
      },
      v2Metrics: {
        totalSignals: resolvedV2.length,
        wins,
        losses,
        winRate,
        avgConfidence,
        pendingSignals: v2Signals.filter((s: { outcome: unknown }) => !s.outcome).length,
        recentSignals: v2Signals.slice(0, 5),
      },
      session: {
        killZone,
        killZoneEnd,
        silverBullet,
        nextKillZone,
        isMarketOpen: isWeekday && utcHour >= 13 && utcHour < 21,
        isWeekend: !isWeekday,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
