import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VAPID_PUBLIC = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/=+$/, "");
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/=+$/, "");
const EVO_URL = process.env.EVOLUTION_API_URL || "";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "";

try {
  if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_PUBLIC !== "placeholder") {
    webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
  }
} catch { /* skip */ }

/**
 * Proactive Assistant Cron — runs every 2 hours
 * Analyzes user data and sends relevant insights
 *
 * Rules:
 * - Max 3 proactive notifications per user per day
 * - Only send if priority >= 6
 * - Never repeat same insight type within 24h
 * - Learn from dismissals
 */
export async function GET() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  let totalInsights = 0;

  // Get all active users
  const { data: users } = await supabase
    .from("users")
    .select("id, name, currency, timezone")
    .limit(100);

  if (!users || users.length === 0) {
    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("proactive", { users: 0, insights: 0 });
    return NextResponse.json({ ok: true, insights: 0 });
  }

  for (const user of users) {
    try {
      // Check how many proactive notifications sent today (max 3)
      const { count: todayCount } = await supabase
        .from("proactive_insights")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", `${today}T00:00:00`)
        .not("delivered_via", "is", null);

      if ((todayCount || 0) >= 3) continue;

      const insights: Array<{ type: string; content: string; priority: number }> = [];

      // ── SPENDING VELOCITY ──
      if (hour >= 18) { // Only check in evening
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const monthProgress = dayOfMonth / daysInMonth;

        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const { data: expenses } = await supabase
          .from("expenses")
          .select("amount")
          .eq("user_id", user.id)
          .gte("date", monthStart);

        if (expenses && expenses.length > 0) {
          const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);

          // Get last month's total for comparison
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
          const { data: lastMonthExp } = await supabase
            .from("expenses")
            .select("amount")
            .eq("user_id", user.id)
            .gte("date", lastMonthStart)
            .lte("date", lastMonthEnd);

          const lastMonthTotal = lastMonthExp?.reduce((s, e) => s + Number(e.amount), 0) || 0;
          const spendingPace = totalSpent / monthProgress;

          if (lastMonthTotal > 0 && spendingPace > lastMonthTotal * 1.3) {
            insights.push({
              type: "spending_velocity",
              content: `Llevas €${totalSpent.toFixed(0)} gastados este mes. Al ritmo actual terminarás en ~€${spendingPace.toFixed(0)}, un ${((spendingPace / lastMonthTotal - 1) * 100).toFixed(0)}% más que el mes pasado (€${lastMonthTotal.toFixed(0)}).`,
              priority: 7,
            });
          }
        }
      }

      // ── CATEGORY OVERSPEND ──
      if (hour >= 20) {
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const { data: catExpenses } = await supabase
          .from("expenses")
          .select("amount, category")
          .eq("user_id", user.id)
          .gte("date", monthStart);

        if (catExpenses && catExpenses.length > 5) {
          const byCategory: Record<string, number> = {};
          catExpenses.forEach(e => {
            byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
          });

          // Get last 3 months average by category
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
          const { data: histExpenses } = await supabase
            .from("expenses")
            .select("amount, category")
            .eq("user_id", user.id)
            .gte("date", threeMonthsAgo)
            .lt("date", monthStart);

          const histByCategory: Record<string, number[]> = {};
          histExpenses?.forEach(e => {
            if (!histByCategory[e.category]) histByCategory[e.category] = [];
            histByCategory[e.category].push(Number(e.amount));
          });

          for (const [cat, amount] of Object.entries(byCategory)) {
            const hist = histByCategory[cat];
            if (hist && hist.length > 3) {
              const avg = hist.reduce((a, b) => a + b, 0) / 3; // 3 months average
              if (amount > avg * 1.5 && amount > 50) {
                const catNames: Record<string, string> = {
                  food: "comida", transport: "transporte", entertainment: "ocio",
                  shopping: "compras", bills: "facturas", health: "salud", home: "hogar",
                };
                insights.push({
                  type: "category_overspend",
                  content: `${catNames[cat] || cat}: €${amount.toFixed(0)} este mes vs €${avg.toFixed(0)} de media. Un ${((amount / avg - 1) * 100).toFixed(0)}% más de lo normal.`,
                  priority: 6,
                });
              }
            }
          }
        }
      }

      // ── UNANSWERED WHATSAPP MESSAGES ──
      if (hour >= 10 && hour <= 22) {
        const fourHoursAgo = new Date(now.getTime() - 4 * 3600000).toISOString();
        const { data: unanswered } = await supabase
          .from("whatsapp_tracking")
          .select("contact_name, phone, created_at")
          .eq("user_id", user.id)
          .eq("direction", "in")
          .eq("responded", false)
          .lt("created_at", fourHoursAgo)
          .order("created_at", { ascending: false })
          .limit(5);

        if (unanswered && unanswered.length >= 2) {
          const names = unanswered.map(m => m.contact_name || m.phone).slice(0, 3).join(", ");
          insights.push({
            type: "unanswered_msgs",
            content: `Tienes ${unanswered.length} mensajes de WhatsApp sin responder (${names}). El más antiguo hace ${Math.round((now.getTime() - new Date(unanswered[unanswered.length - 1].created_at).getTime()) / 3600000)}h.`,
            priority: 6,
          });
        }
      }

      // ── COMMITMENTS FROM WHATSAPP ──
      {
        const { data: commitments } = await supabase
          .from("whatsapp_tracking")
          .select("commitment_text, commitment_date, contact_name")
          .eq("user_id", user.id)
          .eq("has_commitment", true)
          .gte("commitment_date", now.toISOString())
          .lte("commitment_date", new Date(now.getTime() + 24 * 3600000).toISOString());

        if (commitments && commitments.length > 0) {
          for (const c of commitments) {
            insights.push({
              type: "commitment",
              content: `Recuerda: le dijiste a ${c.contact_name || "alguien"} que "${c.commitment_text}". Es hoy.`,
              priority: 8,
            });
          }
        }
      }

      // ── NO EXPENSES TRACKED IN 3 DAYS ──
      if (hour >= 19) {
        const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 10);
        const { count: recentExpenses } = await supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("date", threeDaysAgo);

        if ((recentExpenses || 0) === 0) {
          // Check they have tracked before (not a new user)
          const { count: totalExp } = await supabase
            .from("expenses")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);

          if ((totalExp || 0) > 5) {
            insights.push({
              type: "pattern_break",
              content: "No has registrado gastos en 3 días. ¿Todo bien? Dime qué has gastado y lo apunto.",
              priority: 5,
            });
          }
        }
      }

      // ── WEATHER ALERTS ──
      if (hour >= 7 && hour <= 10) {
        try {
          // Get user's city from facts
          const { data: cityFacts } = await supabase
            .from("user_facts")
            .select("fact")
            .eq("user_id", user.id)
            .eq("category", "identity")
            .or("fact.ilike.%vive en%,fact.ilike.%ciudad%,fact.ilike.%lives in%")
            .limit(1);

          let city = "Madrid"; // fallback
          if (cityFacts && cityFacts.length > 0) {
            // Extract city name from fact like "Vive en Las Palmas"
            const match = cityFacts[0].fact.match(/(?:vive en|ciudad|lives in)\s+(.+)/i);
            if (match) city = match[1].trim().replace(/\.$/, "");
          }

          const { getWeather } = await import("@/lib/weather/client");
          const weather = await getWeather(city);

          if (weather) {
            // Rain alert
            const rainToday = weather.forecast[0]?.precipitationSum || 0;
            if (rainToday > 2) {
              insights.push({
                type: "weather_rain",
                content: `Hoy llueve en ${weather.location} (${rainToday}mm). Lleva paraguas.`,
                priority: 7,
              });
            }

            // Extreme heat
            const maxTemp = weather.forecast[0]?.tempMax || 0;
            if (maxTemp >= 38) {
              insights.push({
                type: "weather_heat",
                content: `Alerta calor en ${weather.location}: ${maxTemp}°C hoy. Hidrátate y evita el sol directo de 12 a 17h.`,
                priority: 7,
              });
            }

            // Extreme cold
            const minTemp = weather.forecast[0]?.tempMin || 0;
            if (minTemp <= 0) {
              insights.push({
                type: "weather_cold",
                content: `Frío intenso en ${weather.location}: mínima ${minTemp}°C. Abrígate bien.`,
                priority: 6,
              });
            }
          }
        } catch { /* skip weather if unavailable */ }
      }

      // ── BIRTHDAY REMINDERS ──
      {
        const tomorrow = new Date(now.getTime() + 24 * 3600000);
        const tomorrowStr = `${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

        const { data: facts } = await supabase
          .from("user_facts")
          .select("fact")
          .eq("user_id", user.id)
          .eq("category", "contacts")
          .ilike("fact", `%cumpleaños%${tomorrowStr}%`);

        if (facts && facts.length > 0) {
          for (const f of facts) {
            insights.push({
              type: "birthday",
              content: `Mañana: ${f.fact}. ¿Quieres que le envíe un mensaje de felicitación?`,
              priority: 8,
            });
          }
        }
      }

      // ── FILTER: only insights not sent in last 24h ──
      const filteredInsights = [];
      for (const insight of insights) {
        if (insight.priority < 6) continue;

        const { count: recent } = await supabase
          .from("proactive_insights")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("insight_type", insight.type)
          .gte("created_at", new Date(now.getTime() - 24 * 3600000).toISOString());

        if ((recent || 0) === 0) {
          filteredInsights.push(insight);
        }
      }

      // Sort by priority, take top 2
      filteredInsights.sort((a, b) => b.priority - a.priority);
      const toSend = filteredInsights.slice(0, 2);

      // ── DELIVER INSIGHTS ──
      for (const insight of toSend) {
        // Save to DB
        await supabase.from("proactive_insights").insert({
          user_id: user.id,
          insight_type: insight.type,
          content: insight.content,
          priority: insight.priority,
          delivered_via: "push",
        });

        // Send push
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("endpoint, keys")
          .eq("user_id", user.id);

        if (subs && subs.length > 0) {
          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
                JSON.stringify({ title: "DILO", body: insight.content, url: "/chat" })
              );
            } catch { /* skip */ }
          }
        }

        totalInsights++;
      }
    } catch (err) {
      console.error(`[Proactive] Error for user ${user.id}:`, err);
    }
  }

  const { logCronResult } = await import("@/lib/cron/logger");
  await logCronResult("proactive", { users: users.length, insights_sent: totalInsights });

  return NextResponse.json({ ok: true, users: users.length, insights_sent: totalInsights });
}

export const dynamic = "force-dynamic";
