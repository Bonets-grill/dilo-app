import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAlpacaAccessToken } from "@/lib/oauth/alpaca";
import { getAccount, getPositions } from "@/lib/alpaca/client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Daily cron: snapshot portfolio value for all users with Alpaca connected.
 * Runs once a day after market close.
 */
export async function GET() {
  try {
    // Find all users with alpaca_oauth in preferences
    const { data: users } = await supabase
      .from("users")
      .select("id, preferences")
      .not("preferences->alpaca_oauth", "is", null);

    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, snapshots: 0 });
    }

    const today = new Date().toISOString().slice(0, 10);
    let count = 0;

    for (const user of users) {
      try {
        const token = await getAlpacaAccessToken(user.id);
        if (!token) continue;

        const [account, positions] = await Promise.all([
          getAccount(token),
          getPositions(token),
        ]);

        const equity = parseFloat(account.equity);
        const lastEquity = parseFloat(account.last_equity);
        const dayPnl = equity - lastEquity;
        const dayPnlPct = lastEquity > 0 ? (dayPnl / lastEquity) * 100 : 0;

        // Count today's trades
        const { count: tradesCount } = await supabase
          .from("trade_journal")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("filled_at", today);

        await supabase.from("trade_snapshots").upsert({
          user_id: user.id,
          date: today,
          portfolio_value: equity,
          cash: parseFloat(account.cash),
          day_pnl: dayPnl,
          day_pnl_pct: dayPnlPct,
          positions_count: positions.length,
          trades_count: tradesCount || 0,
        }, { onConflict: "user_id,date" });

        count++;
      } catch (err) {
        console.error(`[Trading Snapshot] Error for user ${user.id}:`, err);
      }
    }

    return NextResponse.json({ ok: true, snapshots: count });
  } catch (err) {
    console.error("[Trading Snapshot] Cron error:", err);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
