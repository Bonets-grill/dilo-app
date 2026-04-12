import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ENGINE_URL = process.env.TRADING_ENGINE_URL || "http://localhost:8000";
const ENGINE_KEY = process.env.TRADING_ENGINE_KEY || "dev-secret";

const WATCHLIST = ["AAPL", "NVDA", "TSLA", "AMZN", "MSFT", "META", "GOOGL", "SPY", "QQQ"];

/**
 * Strategy Agent (Agent 1: Estratega)
 * Cron: 0 7 * * 1-5 (7:00 UTC Mon-Fri, before London session)
 *
 * What it does:
 * 1. Calls Python engine /strategy for HTF analysis of all watchlist symbols
 * 2. Saves daily plan (bias, zones, key levels) to daily_strategy table
 * 3. This plan is used by the Sniper Agent to check alignment before entering
 */
export async function GET() {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Weekend — markets closed" });
  }

  const today = now.toISOString().slice(0, 10);
  const startTime = Date.now();

  try {
    // Check if engine is alive
    const healthRes = await fetch(`${ENGINE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!healthRes?.ok) {
      const { logCronError } = await import("@/lib/cron/logger");
      await logCronError("trading-strategy", "Python engine unavailable");
      return NextResponse.json({ error: "Engine unavailable" }, { status: 503 });
    }

    // Call the Strategy endpoint on the Python engine
    const strategyRes = await fetch(`${ENGINE_URL}/strategy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ENGINE_KEY,
      },
      body: JSON.stringify({
        watchlist: WATCHLIST,
        htf_period: "6mo",
        htf_interval: "1d",
      }),
      signal: AbortSignal.timeout(120000), // 2 min timeout (9 symbols)
    });

    if (!strategyRes.ok) {
      const text = await strategyRes.text();
      const { logCronError } = await import("@/lib/cron/logger");
      await logCronError("trading-strategy", `Engine returned ${strategyRes.status}: ${text.slice(0, 200)}`);
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const data = await strategyRes.json();
    const plans = data.plans || [];

    // Save each plan to daily_strategy table
    let saved = 0;
    let errors = 0;

    for (const plan of plans) {
      if (plan.error) {
        errors++;
        continue;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("daily_strategy") as any).upsert({
          date: today,
          symbol: plan.symbol,
          htf_bias: plan.htf_bias || "neutral",
          trade_direction: plan.trade_direction || "NO_TRADE",
          swing_high: plan.key_levels?.swing_high || null,
          swing_low: plan.key_levels?.swing_low || null,
          equilibrium: plan.zone?.equilibrium || null,
          zone: plan.zone?.zone || null,
          atr: plan.key_levels?.atr || null,
          key_levels: {
            key_obs: plan.key_levels?.key_obs || [],
            key_fvgs: plan.key_levels?.key_fvgs || [],
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: "date,symbol" });

        saved++;
      } catch {
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    const result = {
      date: today,
      symbols_analyzed: plans.length,
      saved,
      errors,
      summary: data.summary || {},
      duration_ms: duration,
    };

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("trading-strategy", result, duration);

    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("trading-strategy", (err as Error).message, Date.now() - startTime);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes max for Vercel Pro
