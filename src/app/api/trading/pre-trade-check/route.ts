import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/trading/pre-trade-check
 * Called before executing any trade. Checks emotional state, circuit breaker, kill zone.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const { shouldBlockTrade } = await import("@/lib/trading/circuit-breaker");
    const result = await shouldBlockTrade(userId);

    return NextResponse.json({
      allowed: !result.blocked,
      blocked_reason: result.reason || null,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error("[Pre-Trade Check] Error:", err);
    return NextResponse.json({ allowed: true, warnings: [] });
  }
}

export const dynamic = "force-dynamic";
