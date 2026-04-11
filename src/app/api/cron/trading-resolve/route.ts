import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Trading Signal Resolution Cron — runs every 2 hours L-V (8,10,12,14,16,18)
 *
 * Resolves pending signals with professional metrics:
 * - MFE (Maximum Favorable Excursion)
 * - MAE (Maximum Adverse Excursion)
 * - R-Multiple (P&L in risk units)
 * - Hold time
 * - Entry hour/day for correlation analysis
 *
 * Separate from trading-learn to avoid touching locked files.
 */
export async function GET() {
  let resolved = 0;
  let expired = 0;

  try {
    // Get unresolved signals older than 4 hours
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pendingSignals } = await (supabase.from("trading_signal_log") as any)
      .select("*")
      .is("outcome", null)
      .lt("created_at", new Date(Date.now() - 4 * 3600000).toISOString());

    if (!pendingSignals || pendingSignals.length === 0) {
      const { logCronResult } = await import("@/lib/cron/logger");
      await logCronResult("trading-resolve", { resolved: 0, expired: 0, pending: 0 });
      return NextResponse.json({ ok: true, resolved: 0, expired: 0 });
    }

    const { enrichSignalMetrics } = await import("@/lib/trading/metrics");

    for (const sig of pendingSignals) {
      try {
        // Auto-expire signals older than 5 days
        const ageHours = (Date.now() - new Date(sig.created_at).getTime()) / 3600000;
        if (ageHours > 120) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("trading_signal_log") as any).update({
            outcome: "expired",
            resolved_at: new Date().toISOString(),
            hold_time_hours: Math.round(ageHours * 10) / 10,
            entry_hour_utc: new Date(sig.created_at).getUTCHours(),
            entry_day_of_week: new Date(sig.created_at).getUTCDay(),
          }).eq("id", sig.id);
          expired++;
          continue;
        }

        // Get current quote based on market type
        let currentPrice = 0;
        let highPrice = 0;
        let lowPrice = 0;

        if (sig.market_type === "forex" || sig.market_type === "gold") {
          try {
            const { getForexQuote } = await import("@/lib/ig/client");
            const quote = await getForexQuote(sig.symbol);
            if (quote?.bid) {
              currentPrice = quote.bid;
              highPrice = quote.high || currentPrice;
              lowPrice = quote.low || currentPrice;
            }
          } catch { /* skip */ }
        } else {
          try {
            const { getQuote } = await import("@/lib/finnhub/client");
            const quote = await getQuote(sig.symbol);
            if (quote?.c > 0) {
              currentPrice = quote.c;
              highPrice = quote.h || currentPrice;
              lowPrice = quote.l || currentPrice;
            }
          } catch { /* skip */ }
        }

        if (currentPrice <= 0) continue;

        // Determine outcome
        let outcome = "expired";
        let pnl = 0;

        if (sig.side === "BUY") {
          if (currentPrice >= sig.take_profit) { outcome = "win"; pnl = sig.take_profit - sig.entry_price; }
          else if (currentPrice <= sig.stop_loss) { outcome = "loss"; pnl = sig.stop_loss - sig.entry_price; }
          else { pnl = currentPrice - sig.entry_price; }
        } else {
          if (currentPrice <= sig.take_profit) { outcome = "win"; pnl = sig.entry_price - sig.take_profit; }
          else if (currentPrice >= sig.stop_loss) { outcome = "loss"; pnl = sig.entry_price - sig.stop_loss; }
          else { pnl = sig.entry_price - currentPrice; }
        }

        // Only resolve if TP or SL was hit, or expired
        if (outcome === "expired" && ageHours < 120) continue;

        const pnlPct = sig.entry_price > 0 ? (pnl / sig.entry_price * 100) : 0;

        // Calculate professional metrics
        const metrics = enrichSignalMetrics(
          { ...sig, pnl },
          currentPrice, highPrice, lowPrice
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("trading_signal_log") as any).update({
          outcome,
          exit_price: currentPrice,
          pnl: Math.round(pnl * 100) / 100,
          pnl_pct: Math.round(pnlPct * 100) / 100,
          hit_tp: outcome === "win",
          hit_sl: outcome === "loss",
          resolved_at: new Date().toISOString(),
          mfe: metrics.mfe,
          mae: metrics.mae,
          r_multiple: metrics.r_multiple,
          hold_time_hours: metrics.hold_time_hours,
          entry_hour_utc: metrics.entry_hour_utc,
          entry_day_of_week: metrics.entry_day_of_week,
        }).eq("id", sig.id);

        resolved++;
      } catch (err) {
        console.error(`[Trading Resolve] Error for signal ${sig.id}:`, err);
      }
    }

    // Update session metrics for today
    try {
      const today = new Date().toISOString().slice(0, 10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: todaySignals } = await (supabase.from("trading_signal_log") as any)
        .select("outcome, pnl, r_multiple, hold_time_hours, mfe, mae")
        .eq("resolved_at::date", today)
        .not("outcome", "is", null);

      if (todaySignals && todaySignals.length > 0) {
        const wins = todaySignals.filter((s: { outcome: string }) => s.outcome === "win").length;
        const losses = todaySignals.filter((s: { outcome: string }) => s.outcome === "loss").length;
        const expiredCount = todaySignals.filter((s: { outcome: string }) => s.outcome === "expired").length;
        const totalPnl = todaySignals.reduce((s: number, sig: { pnl: number }) => s + (sig.pnl || 0), 0);
        const rMultiples = todaySignals.filter((s: { r_multiple: number | null }) => s.r_multiple != null).map((s: { r_multiple: number }) => s.r_multiple);
        const holdTimes = todaySignals.filter((s: { hold_time_hours: number | null }) => s.hold_time_hours != null).map((s: { hold_time_hours: number }) => s.hold_time_hours);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("trading_session_metrics") as any).upsert({
          user_id: null,
          session_date: today,
          total_trades: todaySignals.length,
          wins,
          losses,
          expired: expiredCount,
          win_rate: todaySignals.length > 0 ? Math.round((wins / todaySignals.length) * 1000) / 10 : 0,
          total_pnl: Math.round(totalPnl * 100) / 100,
          avg_r_multiple: rMultiples.length > 0 ? Math.round(rMultiples.reduce((a: number, b: number) => a + b, 0) / rMultiples.length * 100) / 100 : null,
          best_trade_pnl: todaySignals.length > 0 ? Math.max(...todaySignals.map((s: { pnl: number }) => s.pnl || 0)) : null,
          worst_trade_pnl: todaySignals.length > 0 ? Math.min(...todaySignals.map((s: { pnl: number }) => s.pnl || 0)) : null,
          avg_hold_time_hours: holdTimes.length > 0 ? Math.round(holdTimes.reduce((a: number, b: number) => a + b, 0) / holdTimes.length * 10) / 10 : null,
        }, { onConflict: "user_id,session_date" });
      }
    } catch { /* skip session metrics if error */ }

    const resultData = { resolved, expired, pending: pendingSignals.length };
    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("trading-resolve", resultData);

    return NextResponse.json({ ok: true, ...resultData });
  } catch (err) {
    console.error("[Trading Resolve] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("trading-resolve", (err as Error).message);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
