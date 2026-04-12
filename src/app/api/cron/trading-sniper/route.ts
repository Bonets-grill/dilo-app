import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ENGINE_URL = process.env.TRADING_ENGINE_URL || "http://localhost:8000";
const ENGINE_KEY = process.env.TRADING_ENGINE_KEY || "dev-secret";

/**
 * Sniper Agent (Agent 2: Francotirador)
 * Cron: every 15min during kill zones 8-10,14-16 UTC Mon-Fri
 *
 * What it does:
 * 1. Reads today's strategy plan from daily_strategy table
 * 2. Only checks symbols with LONG_ONLY or SHORT_ONLY direction
 * 3. Calls Python engine /strategy/sniper for real-time LTF analysis
 * 4. If confluence >= 8/15 and kill zone active → generates signal
 * 5. Saves signal to trading_signal_log with source "dilo_strategy_v2"
 *
 * Key: This agent ONLY fires during kill zones and ONLY on symbols
 * where the Strategy Agent found a clear HTF bias.
 */
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const startTime = Date.now();

  let signalsGenerated = 0;
  let symbolsChecked = 0;
  let skipped = 0;

  try {
    // 1. Read today's strategy plan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: plans } = await (supabase.from("daily_strategy") as any)
      .select("*")
      .eq("date", today)
      .neq("trade_direction", "NO_TRADE");

    if (!plans || plans.length === 0) {
      const { logCronResult } = await import("@/lib/cron/logger");
      await logCronResult("trading-sniper", {
        date: today,
        status: "no_plan",
        message: "No strategy plan for today — Strategy Agent may not have run yet",
      });
      return NextResponse.json({ ok: true, status: "no_plan", symbols: 0 });
    }

    // 2. Check engine health
    const healthRes = await fetch(`${ENGINE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!healthRes?.ok) {
      const { logCronError } = await import("@/lib/cron/logger");
      await logCronError("trading-sniper", "Python engine unavailable");
      return NextResponse.json({ error: "Engine unavailable" }, { status: 503 });
    }

    // 3. Check each tradeable symbol
    for (const plan of plans) {
      try {
        symbolsChecked++;

        // Call sniper endpoint
        const sniperRes = await fetch(`${ENGINE_URL}/strategy/sniper`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": ENGINE_KEY,
          },
          body: JSON.stringify({
            symbol: plan.symbol,
            htf_period: "6mo",
            htf_interval: "1d",
            ltf_period: "5d",
            ltf_interval: "15m",
          }),
          signal: AbortSignal.timeout(30000), // 30s per symbol
        });

        if (!sniperRes.ok) {
          skipped++;
          continue;
        }

        const result = await sniperRes.json();

        // 4. Check if signal was generated
        if (result.action !== "SIGNAL" || !result.signal) {
          skipped++;
          continue;
        }

        const signal = result.signal;
        const confluence = result.confluence;

        // 5. Save signal to trading_signal_log
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("trading_signal_log") as any).insert({
          symbol: signal.symbol,
          side: signal.side,
          entry_price: signal.entry_price,
          stop_loss: signal.stop_loss,
          take_profit: signal.take_profit,
          setup_type: signal.setup_type || "mtf_confluence",
          confidence: confluence?.confidence || signal.confidence || 0,
          reasoning: signal.reasoning || [],
          source: "dilo_strategy_v2",
          market_type: "stocks",
          filters_applied: confluence?.active_factors || [],
        });

        signalsGenerated++;

        // 6. Alert via WhatsApp if signal generated
        try {
          const { data: channel } = await supabase
            .from("channels")
            .select("instance_name, phone")
            .eq("type", "whatsapp")
            .eq("status", "connected")
            .limit(1)
            .maybeSingle();

          if (channel?.phone) {
            const EVO_URL = process.env.EVOLUTION_API_URL || "";
            const EVO_KEY = process.env.EVOLUTION_API_KEY || "";
            if (EVO_URL && EVO_KEY) {
              const side = signal.side === "BUY" ? "COMPRA" : "VENTA";
              const grade = confluence?.grade || "?";
              const score = confluence?.score || 0;
              const msg = `🎯 *DILO Sniper — ${signal.symbol}*\n\n` +
                `${side} @ $${signal.entry_price}\n` +
                `SL: $${signal.stop_loss}\n` +
                `TP: $${signal.take_profit}\n` +
                `Confluencia: ${grade} (${score}pts)\n` +
                `Confianza: ${confluence?.confidence || signal.confidence}%\n\n` +
                `Factores: ${(confluence?.active_factors || []).slice(0, 5).join(", ")}\n\n` +
                `_Señal automática v2. La decisión final es tuya._`;

              await fetch(`${EVO_URL}/message/sendText/${channel.instance_name}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: EVO_KEY },
                body: JSON.stringify({ number: channel.phone, text: msg }),
              }).catch(() => {});
            }
          }
        } catch { /* WhatsApp alert is best-effort */ }

      } catch {
        skipped++;
      }
    }

    const duration = Date.now() - startTime;
    const result = {
      date: today,
      symbols_checked: symbolsChecked,
      signals_generated: signalsGenerated,
      skipped,
      duration_ms: duration,
    };

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("trading-sniper", result, duration);

    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("trading-sniper", (err as Error).message, Date.now() - startTime);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;
