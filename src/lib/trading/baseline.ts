/**
 * Trading Baseline — Calculates a trader's normal behavior over 30 days
 * Used as reference to detect emotional deviations (FOMO, revenge, tilt)
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface BaselineMetrics {
  avgTradesPerDay: number;
  avgGapMinutes: number;
  avgPositionSize: number;
  winRate: number;
  avgHoldTimeHours: number;
  totalDays: number;
}

/**
 * Calculate baseline metrics for a user over the last N days
 */
export async function getBaselineMetrics(userId: string, days: number = 30): Promise<BaselineMetrics> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  try {
    // Get resolved signals for this user (or system signals if no user trades)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: signals } = await (supabase.from("trading_signal_log") as any)
      .select("created_at, outcome, hold_time_hours, confidence")
      .or(userId ? `user_id.eq.${userId}` : "user_id.is.null")
      .not("outcome", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (!signals || signals.length < 3) {
      return {
        avgTradesPerDay: 2,
        avgGapMinutes: 120,
        avgPositionSize: 1000,
        winRate: 50,
        avgHoldTimeHours: 24,
        totalDays: 0,
      };
    }

    // Calculate days with activity
    const uniqueDays = new Set(signals.map((s: { created_at: string }) => s.created_at.slice(0, 10)));
    const totalDays = uniqueDays.size;

    // Average trades per day
    const avgTradesPerDay = Math.round((signals.length / Math.max(totalDays, 1)) * 10) / 10;

    // Average gap between trades (in minutes)
    let totalGap = 0;
    let gapCount = 0;
    for (let i = 1; i < signals.length; i++) {
      const gap = new Date(signals[i].created_at).getTime() - new Date(signals[i - 1].created_at).getTime();
      totalGap += gap;
      gapCount++;
    }
    const avgGapMinutes = gapCount > 0 ? Math.round(totalGap / gapCount / 60000) : 120;

    // Win rate
    const wins = signals.filter((s: { outcome: string }) => s.outcome === "win").length;
    const winRate = Math.round((wins / signals.length) * 1000) / 10;

    // Average hold time
    const holdTimes = signals
      .filter((s: { hold_time_hours: number | null }) => s.hold_time_hours != null)
      .map((s: { hold_time_hours: number }) => s.hold_time_hours);
    const avgHoldTimeHours = holdTimes.length > 0
      ? Math.round(holdTimes.reduce((a: number, b: number) => a + b, 0) / holdTimes.length * 10) / 10
      : 24;

    return {
      avgTradesPerDay,
      avgGapMinutes,
      avgPositionSize: 1000, // placeholder — would need Alpaca data
      winRate,
      avgHoldTimeHours,
      totalDays,
    };
  } catch {
    return {
      avgTradesPerDay: 2,
      avgGapMinutes: 120,
      avgPositionSize: 1000,
      winRate: 50,
      avgHoldTimeHours: 24,
      totalDays: 0,
    };
  }
}
