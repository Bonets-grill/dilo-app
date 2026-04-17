import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { sendPush } from "@/lib/push/send";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Daily Insights Cron — Runs at 21:00
 * Analyzes user's day and profile to find patterns, anomalies, and opportunities.
 * Sends 0-2 proactive insights via push notification.
 */
export async function GET(req: NextRequest) {
  const gate = requireCronAuth(req); if (gate) return gate;
  try {
    const { data: users } = await supabase
      .from("users")
      .select("id, name, language");

    if (!users?.length) {
      return NextResponse.json({ status: "ok", processed: 0 });
    }

    let insightsSent = 0;

    for (const user of users) {
      try {
        const sent = await analyzeAndNotify(user);
        insightsSent += sent;
      } catch (err) {
        console.error(`[Insights] Failed for ${user.id}:`, err);
      }
    }

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("insights", { insights_sent: insightsSent, users: users.length });
    return NextResponse.json({ status: "ok", insights_sent: insightsSent, users: users.length });
  } catch (err) {
    console.error("[Insights Cron] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("insights", (err as Error).message);
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}

async function analyzeAndNotify(user: {
  id: string;
  name: string | null;
  language: string | null;
}): Promise<number> {
  const name = user.name || "usuario";
  const lang = user.language || "es";
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const monthStart = today.slice(0, 7) + "-01";

  // Gather everything in parallel
  const [facts, weekExpenses, monthExpenses, todayReminders, upcomingReminders] = await Promise.all([
    supabase.from("user_facts").select("category, fact, confidence, updated_at")
      .eq("user_id", user.id).gte("confidence", 0.4)
      .order("confidence", { ascending: false }).limit(20),

    supabase.from("expenses").select("amount, category, description, date")
      .eq("user_id", user.id).gte("date", weekAgo),

    supabase.from("expenses").select("amount, category, date")
      .eq("user_id", user.id).gte("date", monthStart),

    supabase.from("reminders").select("text, due_at")
      .eq("user_id", user.id).eq("status", "pending")
      .gte("due_at", today + "T00:00:00").lte("due_at", today + "T23:59:59"),

    // Reminders in next 7 days
    supabase.from("reminders").select("text, due_at")
      .eq("user_id", user.id).eq("status", "pending")
      .gte("due_at", today + "T00:00:00")
      .lte("due_at", new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0] + "T23:59:59")
      .order("due_at", { ascending: true }),
  ]);

  const factList = facts.data?.map(f => f.fact) || [];
  const weekTotal = weekExpenses.data?.reduce((s, e) => s + Number(e.amount), 0) || 0;
  const monthTotal = monthExpenses.data?.reduce((s, e) => s + Number(e.amount), 0) || 0;

  // Category breakdown this week
  const byCat: Record<string, number> = {};
  weekExpenses.data?.forEach(e => {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
  });
  const topCategories = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Skip users with almost no data
  if (factList.length === 0 && weekTotal === 0 && (upcomingReminders.data?.length || 0) === 0) {
    return 0;
  }

  const prompt = `Eres el motor de insights de DILO. Analiza estos datos de ${name} y genera 0-2 insights ÚTILES.

PERFIL (facts aprendidos):
${factList.length > 0 ? factList.map(f => `- ${f}`).join("\n") : "- Perfil aún vacío"}

GASTOS ESTA SEMANA: €${weekTotal.toFixed(2)}
${topCategories.length > 0 ? topCategories.map(([cat, amt]) => `- ${cat}: €${(amt as number).toFixed(2)}`).join("\n") : ""}
GASTOS ESTE MES: €${monthTotal.toFixed(2)}

RECORDATORIOS PRÓXIMOS 7 DÍAS:
${upcomingReminders.data?.length ? upcomingReminders.data.map(r => `- ${r.text} (${new Date(r.due_at).toLocaleDateString("es")})`).join("\n") : "- Ninguno"}

GENERA insights como JSON array. Cada insight:
{
  "text": "El mensaje para el usuario (máx 2 líneas, tono amigo)",
  "type": "finance|health|productivity|relationships|dates|general",
  "priority": "high|medium|low"
}

REGLAS:
1. Idioma: ${lang === "es" ? "español" : lang}
2. Solo insights ACCIONABLES. "Llevas €X en comida" no es suficiente → "Llevas €X en comida, €Y más que tu media. Si cocinas 2 noches ahorras €Z" SÍ.
3. Si hay un cumpleaños/aniversario en los facts que está cerca, avisa.
4. Si no hay nada interesante, devuelve []. NO inventes insights vacíos.
5. Máximo 2 insights. Calidad > cantidad.
6. Tono: amigo que se preocupa, NUNCA juzga. Sugiere, no impone.
7. Si sugieres algo, pregunta "¿quieres que...?" al final.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    temperature: 0.7,
    messages: [{ role: "user", content: prompt }],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content || content === "[]") return 0;

  let insights: Array<{ text: string; type: string; priority: string }>;
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    insights = JSON.parse(cleaned);
    if (!Array.isArray(insights) || insights.length === 0) return 0;
  } catch {
    return 0;
  }

  // Send insights via push
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys")
    .eq("user_id", user.id);

  let sent = 0;
  for (const insight of insights.slice(0, 2)) {
    if (!insight.text) continue;

    // Push notification
    if (subs?.length) {
      for (const sub of subs) {
        await sendPush(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          { title: "DILO", body: insight.text.slice(0, 200), url: "/chat" }
        );
      }
    }

    // Save insight
    await supabase.from("analytics_events").insert({
      user_id: user.id,
      event_type: "daily_insight",
      event_data: { text: insight.text, type: insight.type, priority: insight.priority },
    });

    sent++;
  }

  return sent;
}

export const dynamic = "force-dynamic";
