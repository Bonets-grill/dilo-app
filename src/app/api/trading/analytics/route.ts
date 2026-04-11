import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/trading/analytics?period=weekly
 * Returns trading analytics (correlations, reports)
 */
export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get("period") || "weekly";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("trading_analytics") as any)
      .select("*")
      .eq("period", period)
      .order("period_start", { ascending: false })
      .limit(5);

    return NextResponse.json({ analytics: data || [] });
  } catch (err) {
    console.error("[Trading Analytics API] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
