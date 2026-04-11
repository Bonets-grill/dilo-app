import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Trading Emotional Check Cron — runs every 30 min L-V during market hours
 * Detects FOMO, revenge, tilt, overtrading and activates circuit breaker if needed
 */
export async function GET() {
  let usersChecked = 0;
  let alertsSent = 0;

  try {
    // Get users with Alpaca connected (active traders)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: users } = await (supabase.from("users") as any)
      .select("id, name, preferences")
      .not("preferences", "is", null)
      .limit(50);

    if (!users || users.length === 0) {
      const { logCronResult } = await import("@/lib/cron/logger");
      await logCronResult("trading-emotional-check", { users: 0, alerts: 0 });
      return NextResponse.json({ ok: true, users: 0 });
    }

    const { detectFOMO, detectRevenge, detectTilt, detectOvertrading, calculateCompositeScore, getEmotionalLevel } = await import("@/lib/trading/emotional-detector");
    const { getBaselineMetrics } = await import("@/lib/trading/baseline");
    const { activateCircuitBreaker } = await import("@/lib/trading/circuit-breaker");

    const today = new Date().toISOString().slice(0, 10);

    for (const user of users) {
      try {
        // Check if user has Alpaca keys (preferences contains encrypted keys)
        const prefs = user.preferences;
        if (!prefs?.alpaca_keys_b64) continue;

        // Get today's signals for this user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: todaySignals } = await (supabase.from("trading_signal_log") as any)
          .select("created_at, outcome, pnl, symbol, side, confidence")
          .or(`user_id.eq.${user.id},user_id.is.null`)
          .gte("created_at", `${today}T00:00:00`);

        if (!todaySignals || todaySignals.length < 3) continue;

        // Get baseline
        const baseline = await getBaselineMetrics(user.id);

        // Run all detectors
        const fomo = detectFOMO(todaySignals, baseline);
        const revenge = detectRevenge(todaySignals, baseline);
        const tilt = detectTilt(todaySignals, baseline);
        const overtrading = detectOvertrading(todaySignals, baseline);
        const composite = calculateCompositeScore(tilt.score, fomo.score, revenge.score, overtrading.score);
        const level = getEmotionalLevel(composite);

        const allTriggers = [...fomo.triggers, ...revenge.triggers, ...tilt.triggers, ...overtrading.triggers];

        // Save state
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("trading_emotional_state") as any).insert({
          user_id: user.id,
          tilt_score: tilt.score,
          fomo_score: fomo.score,
          revenge_score: revenge.score,
          overtrading_score: overtrading.score,
          composite_score: composite,
          emotional_level: level,
          trades_today: todaySignals.length,
          losses_today: todaySignals.filter((s: { outcome: string }) => s.outcome === "loss").length,
          daily_pnl: todaySignals.reduce((s: number, sig: { pnl: number | null }) => s + (sig.pnl || 0), 0),
          triggers: allTriggers,
        });

        // Circuit breaker if composite > 70
        if (composite >= 70) {
          await activateCircuitBreaker(user.id, 60, `Composite score: ${composite}/100. ${allTriggers[0] || "Múltiples triggers"}`);

          // Send push notification
          try {
            const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, keys").eq("user_id", user.id);
            if (subs && subs.length > 0) {
              const webpush = (await import("web-push")).default;
              const VAPID_PUBLIC = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/=+$/, "");
              const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/=+$/, "");
              webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
              for (const sub of subs) {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
                  JSON.stringify({ title: "DILO Trading", body: `CIRCUIT BREAKER: Trading pausado 60 min. ${allTriggers[0] || ""}`, url: "/chat" })
                ).catch(() => {});
              }
            }
          } catch { /* skip push */ }
          alertsSent++;
        } else if (composite >= 50) {
          // Send warning push
          try {
            const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, keys").eq("user_id", user.id);
            if (subs && subs.length > 0) {
              const webpush = (await import("web-push")).default;
              const VAPID_PUBLIC = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/=+$/, "");
              const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/=+$/, "");
              webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
              for (const sub of subs) {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
                  JSON.stringify({ title: "DILO Trading", body: `ALERTA: Estado emocional ${level} (${composite}/100). ${allTriggers[0] || ""}`, url: "/chat" })
                ).catch(() => {});
              }
            }
          } catch { /* skip push */ }
          alertsSent++;
        }

        usersChecked++;
      } catch (err) {
        console.error(`[Emotional Check] Error for user ${user.id}:`, err);
      }
    }

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("trading-emotional-check", { users_checked: usersChecked, alerts_sent: alertsSent });

    return NextResponse.json({ ok: true, users_checked: usersChecked, alerts_sent: alertsSent });
  } catch (err) {
    console.error("[Emotional Check] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("trading-emotional-check", (err as Error).message);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
