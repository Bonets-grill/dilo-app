import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push/send";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Price Check Cron — runs daily at 10:00
 * Checks all active price alerts against current Google Shopping prices
 */
export async function GET() {
  const key = process.env.SERPER_API_KEY;
  if (!key) return NextResponse.json({ status: "ok", reason: "no serper key" });

  try {
    const { data: alerts } = await supabase.from("price_alerts")
      .select("*").eq("status", "active").limit(50);

    if (!alerts?.length) return NextResponse.json({ status: "ok", checked: 0 });

    let triggered = 0;

    for (const alert of alerts) {
      try {
        // Check current price
        const res = await fetch("https://google.serper.dev/shopping", {
          method: "POST",
          headers: { "X-API-KEY": key, "Content-Type": "application/json" },
          body: JSON.stringify({ q: alert.product, gl: "es", hl: "es", num: 3 }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const items = data.shopping || [];

        // Find cheapest
        let cheapestPrice = Infinity;
        for (const item of items) {
          const p = parseFloat((item.price || "0").replace(/[^\d,.-]/g, "").replace(",", "."));
          if (p > 0 && p < cheapestPrice) cheapestPrice = p;
        }
        if (cheapestPrice === Infinity) continue;

        // Update current and lowest price
        const newLowest = Math.min(alert.lowest_price || Infinity, cheapestPrice);
        await supabase.from("price_alerts").update({
          current_price: cheapestPrice,
          lowest_price: newLowest,
          last_checked: new Date().toISOString(),
        }).eq("id", alert.id);

        // Check if price dropped below target
        if (cheapestPrice <= alert.target_price) {
          await supabase.from("price_alerts").update({
            status: "triggered",
            triggered_at: new Date().toISOString(),
          }).eq("id", alert.id);

          // Notify user
          const { data: subs } = await supabase.from("push_subscriptions")
            .select("endpoint, keys").eq("user_id", alert.user_id);

          if (subs?.length) {
            for (const sub of subs) {
              await sendPush(
                { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
                {
                  title: "DILO — Precio bajó",
                  body: `${alert.product}: ${cheapestPrice}€ (antes ${alert.current_price}€). ¡Ahorra ${(alert.current_price - cheapestPrice).toFixed(2)}€!`,
                  url: "/chat",
                }
              );
            }
          }
          triggered++;
        }
      } catch { continue; }
    }

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("price-check", { checked: alerts.length, triggered });
    return NextResponse.json({ status: "ok", checked: alerts.length, triggered });
  } catch (err) {
    console.error("[PriceCheck] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("price-check", (err as Error).message);
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}

export const dynamic = "force-dynamic";
