import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Trading Analytics Cron — runs weekly (Sundays 7:00 AM)
 * Calculates correlations and generates weekly report
 */
export async function GET() {
  try {
    const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // Get all resolved signals from last week
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: signals } = await (supabase.from("trading_signal_log") as any)
      .select("symbol, side, setup_type, outcome, pnl, r_multiple, hold_time_hours, entry_hour_utc, entry_day_of_week, regime_at_entry, market_type, created_at")
      .not("outcome", "is", null)
      .gte("resolved_at", weekStart);

    if (!signals || signals.length < 3) {
      const { logCronResult } = await import("@/lib/cron/logger");
      await logCronResult("trading-analytics", { status: "not_enough_data", signals: signals?.length || 0 });
      return NextResponse.json({ ok: true, status: "not_enough_data" });
    }

    const { analyzeByHour, analyzeByDayOfWeek, analyzeBySetup, analyzeBySymbol, analyzeHoldTime, generateWeeklyReport } = await import("@/lib/trading/analytics");

    // Calculate all correlations
    const correlations = {
      byHour: analyzeByHour(signals),
      byDay: analyzeByDayOfWeek(signals),
      bySetup: analyzeBySetup(signals),
      bySymbol: analyzeBySymbol(signals),
      byHoldTime: analyzeHoldTime(signals),
    };

    // Save analytics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("trading_analytics") as any).upsert({
      user_id: null,
      period: "weekly",
      period_start: today,
      analytics_type: "correlation",
      data: correlations,
    }, { onConflict: "user_id,period,period_start,analytics_type" });

    // Generate and save report
    const report = generateWeeklyReport(signals);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("trading_analytics") as any).upsert({
      user_id: null,
      period: "weekly",
      period_start: today,
      analytics_type: "report",
      data: { markdown: report, signals_count: signals.length },
    }, { onConflict: "user_id,period,period_start,analytics_type" });

    const resultData = {
      signals_analyzed: signals.length,
      correlations_by_hour: correlations.byHour.length,
      correlations_by_setup: correlations.bySetup.length,
    };

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("trading-analytics", resultData);

    return NextResponse.json({ ok: true, ...resultData });
  } catch (err) {
    console.error("[Trading Analytics] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("trading-analytics", (err as Error).message);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
