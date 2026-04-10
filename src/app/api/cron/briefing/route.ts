import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { sendPush } from "@/lib/push/send";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const EVO_URL = process.env.EVOLUTION_API_URL || "";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "";

export async function GET() {
  try {
    // Get all active users
    const { data: users } = await supabase
      .from("users")
      .select("id, name, language, locale, timezone");

    if (!users?.length) {
      return NextResponse.json({ status: "ok", processed: 0 });
    }

    let processed = 0;

    for (const user of users) {
      try {
        await generateDailyInsight(user);
        processed++;
      } catch (err) {
        console.error(`[Briefing] Failed for ${user.id}:`, err);
      }
    }

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("briefing", { processed, total: users.length });
    return NextResponse.json({ status: "ok", processed, total: users.length });
  } catch (err) {
    console.error("[Briefing Cron] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("briefing", (err as Error).message);
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}

async function generateDailyInsight(user: {
  id: string;
  name: string | null;
  language: string | null;
  locale: string | null;
  timezone: string | null;
}) {
  const lang = user.language || "es";
  const name = user.name || "amigo";
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Gather data in parallel
  const [expenses, reminders, facts, recentMsgCount] = await Promise.all([
    // Yesterday's expenses
    supabase.from("expenses").select("amount, category, description")
      .eq("user_id", user.id).eq("date", yesterday),

    // Today's pending reminders
    supabase.from("reminders").select("text, due_at")
      .eq("user_id", user.id).eq("status", "pending")
      .gte("due_at", today + "T00:00:00")
      .lte("due_at", today + "T23:59:59")
      .order("due_at", { ascending: true }),

    // User's top facts
    supabase.from("user_facts").select("category, fact")
      .eq("user_id", user.id)
      .gte("confidence", 0.5)
      .order("confidence", { ascending: false })
      .limit(15),

    // How many messages yesterday (activity level)
    supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("role", "user")
      .gte("created_at", yesterday + "T00:00:00")
      .lte("created_at", yesterday + "T23:59:59"),
  ]);

  // Build context for the AI
  const expenseTotal = expenses.data?.reduce((s, e) => s + Number(e.amount), 0) || 0;
  const expenseList = expenses.data?.map(e => `${e.description}: €${Number(e.amount).toFixed(2)}`) || [];
  const reminderList = reminders.data?.map(r => `${r.text} (${new Date(r.due_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })})`) || [];
  const factList = facts.data?.map(f => f.fact) || [];
  const msgCount = recentMsgCount.count || 0;

  // Skip if user had zero activity yesterday and no reminders today
  if (expenseTotal === 0 && msgCount === 0 && reminderList.length === 0 && factList.length === 0) {
    return;
  }

  // Get monthly expense average for comparison
  const monthStart = today.slice(0, 7) + "-01";
  const { data: monthExp } = await supabase.from("expenses").select("amount, date")
    .eq("user_id", user.id).gte("date", monthStart);

  const monthTotal = monthExp?.reduce((s, e) => s + Number(e.amount), 0) || 0;
  const daysInMonth = new Date().getDate();
  const dailyAvg = daysInMonth > 1 ? monthTotal / (daysInMonth - 1) : 0;

  const prompt = `Eres DILO, el asistente personal de ${name}. Genera un briefing matutino BREVE y ÚTIL.

DATOS DE AYER:
${expenseTotal > 0 ? `- Gastos: €${expenseTotal.toFixed(2)} (${expenseList.join(", ")})` : "- Sin gastos registrados"}
${dailyAvg > 0 ? `- Media diaria este mes: €${dailyAvg.toFixed(2)}` : ""}
${expenseTotal > dailyAvg * 1.5 && dailyAvg > 0 ? `- ⚠️ Ayer gastó ${Math.round((expenseTotal / dailyAvg - 1) * 100)}% más de lo normal` : ""}
- Mensajes con DILO: ${msgCount}

HOY:
${reminderList.length > 0 ? `- Recordatorios: ${reminderList.join(", ")}` : "- Sin recordatorios pendientes"}

LO QUE SABES DE ${name.toUpperCase()}:
${factList.length > 0 ? factList.map(f => `- ${f}`).join("\n") : "- Aún poco, es usuario nuevo"}

REGLAS:
1. Idioma: ${lang === "es" ? "español" : lang}
2. Máximo 3-4 líneas. Sé conciso.
3. Si hay un patrón interesante en los gastos, menciónalo naturalmente.
4. Si hay un recordatorio hoy, recuérdaselo de forma amigable.
5. Si sabes algo personal (cumpleaños cercano, hábito), úsalo.
6. Tono: amigo cercano, NO asistente corporativo.
7. NO uses "Buenos días", varía el saludo.
8. Incluye 1 insight o consejo útil basado en los datos.
9. Si no hay casi datos, sé breve y cálido, no inventes.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    temperature: 0.8,
    messages: [{ role: "user", content: prompt }],
  });

  const briefing = completion.choices[0]?.message?.content?.trim();
  if (!briefing) return;

  // Send via Push notification
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys")
    .eq("user_id", user.id);

  if (subs?.length) {
    for (const sub of subs) {
      await sendPush(
        { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
        { title: `DILO — Tu día`, body: briefing.slice(0, 200), url: "/chat" }
      );
    }
  }

  // Also send via WhatsApp if connected
  if (EVO_URL && EVO_KEY) {
    const { data: channel } = await supabase
      .from("channels")
      .select("instance_name, phone")
      .eq("user_id", user.id)
      .eq("type", "whatsapp")
      .eq("status", "connected")
      .maybeSingle();

    if (channel?.instance_name && channel?.phone) {
      try {
        await fetch(`${EVO_URL}/message/sendText/${channel.instance_name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVO_KEY },
          body: JSON.stringify({ number: channel.phone, text: `🌅 ${briefing}` }),
        });
      } catch { /* WhatsApp send is best-effort */ }
    }
  }

  // Save as analytics event
  await supabase.from("analytics_events").insert({
    user_id: user.id,
    event_type: "daily_briefing",
    event_data: {
      briefing,
      expenses_yesterday: expenseTotal,
      daily_avg: dailyAvg,
      reminders_today: reminderList.length,
      facts_count: factList.length,
    },
  });
}

export const dynamic = "force-dynamic";
