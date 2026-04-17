import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

// Different types of friendly messages
const messageTypes = [
  "greeting", // Buenos días, cómo estás
  "motivation", // Frase motivacional
  "checkup", // Cómo va tu día
  "joke", // Chiste o dato curioso
  "gratitude", // Recordar algo positivo
];

export async function GET() {
  try {
    // Get users who have WhatsApp connected
    const { data: channels } = await supabase
      .from("channels")
      .select("user_id, instance_name, phone")
      .eq("type", "whatsapp")
      .eq("status", "connected");

    if (!channels?.length) {
      return NextResponse.json({ status: "ok", sent: 0, reason: "no connected users" });
    }

    // Get user details
    const userIds = channels.map(c => c.user_id);
    const { data: users } = await supabase
      .from("users")
      .select("id, name, language, locale")
      .in("id", userIds);

    if (!users?.length) {
      return NextResponse.json({ status: "ok", sent: 0 });
    }

    let sent = 0;
    const type = messageTypes[Math.floor(Math.random() * messageTypes.length)];

    for (const user of users) {
      const channel = channels.find(c => c.user_id === user.id);
      if (!channel?.instance_name || !channel?.phone) continue;

      try {
        // Generate a personal friendly message
        const lang = user.language || "es";
        const name = user.name || "amigo";

        const prompt = type === "greeting"
          ? `Write a warm, friendly good morning message for ${name} in ${lang}. Be natural, like a caring friend. 1-2 sentences max. No emojis overload, max 1-2.`
          : type === "motivation"
          ? `Write a short motivational message for ${name} in ${lang}. Something uplifting but not cheesy. 1-2 sentences. Like a wise friend.`
          : type === "checkup"
          ? `Write a friendly check-in message for ${name} in ${lang}. Ask how their day is going, show genuine interest. 1-2 sentences. Like a good friend texting.`
          : type === "joke"
          ? `Tell ${name} a short, clean, funny joke or curious fact in ${lang}. Make them smile. Keep it brief.`
          : `Write a short gratitude reminder for ${name} in ${lang}. Help them appreciate something small in life. 1-2 sentences. Warm and genuine.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 150,
          messages: [
            { role: "system", content: "You are DILO, a caring personal AI friend. Write brief, warm messages. Be genuine, not corporate. Like texting a close friend." },
            { role: "user", content: prompt },
          ],
        });

        const message = completion.choices[0]?.message?.content?.trim();
        if (!message) continue;

        // Send via WhatsApp through the anti-ban layer (proactive → respects
        // warmup + daily cap + typing simulation).
        const { safeSendWhatsAppText } = await import("@/lib/wa/anti-ban");
        const res = await safeSendWhatsAppText({
          instance: channel.instance_name,
          to: channel.phone,
          text: message,
          userId: user.id,
          proactive: true,
        });
        if (res.ok) sent++;
        else if (res.reason && res.reason !== "error") console.warn("[friendly] WA skip:", res.reason);
      } catch (e) {
        console.error(`[Friendly] Failed for user ${user.id}:`, e);
      }
    }

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("friendly", { sent, type, total_users: users.length });
    return NextResponse.json({ status: "ok", sent, type, total_users: users.length });
  } catch (e) {
    console.error("[Friendly Cron] Error:", e);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("friendly", (e as Error).message);
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}

export const dynamic = "force-dynamic";
