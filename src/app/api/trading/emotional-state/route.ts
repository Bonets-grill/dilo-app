import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/trading/emotional-state?userId=xxx
 * Returns the current emotional state of the trader
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("trading_emotional_state") as any)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({
        emotional_level: "OK",
        composite_score: 0,
        tilt_score: 0,
        fomo_score: 0,
        revenge_score: 0,
        overtrading_score: 0,
        circuit_breaker_active: false,
        triggers: [],
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[Emotional State] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
