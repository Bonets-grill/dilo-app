import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/trading/enhanced-dashboard?userId=xxx
 * Extended dashboard with emotional state + kill zone + analytics
 * Separate from main dashboard (locked) — frontend calls both
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const [emotionalRes, analyticsRes, killZoneRes] = await Promise.all([
      // Latest emotional state
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("trading_emotional_state") as any)
        .select("emotional_level, composite_score, tilt_score, fomo_score, revenge_score, overtrading_score, circuit_breaker_active, cooldown_until, trades_today, losses_today, daily_pnl, triggers")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Latest weekly analytics
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("trading_analytics") as any)
        .select("data, period_start")
        .eq("analytics_type", "correlation")
        .eq("period", "weekly")
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Kill zone check
      import("@/lib/trading/kill-zones").then(m => m.isInKillZone()),
    ]);

    return NextResponse.json({
      emotional_state: emotionalRes.data || { emotional_level: "OK", composite_score: 0 },
      kill_zone: killZoneRes,
      weekly_analytics: analyticsRes.data?.data || null,
      circuit_breaker_active: emotionalRes.data?.circuit_breaker_active || false,
    });
  } catch (err) {
    console.error("[Enhanced Dashboard] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
