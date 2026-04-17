import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

const EVO_URL = process.env.EVOLUTION_API_URL || "";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "";

/**
 * Daily 8PM cron: For users with wellness activity but no mood check-in today,
 * send a WhatsApp reminder to check in.
 */
export async function GET(req: NextRequest) {
  const gate = requireCronAuth(req); if (gate) return gate;
  try {
    const today = new Date().toISOString().split("T")[0];

    // Users who have wellness_stats (active users) but no mood_log today
    const { data: activeUsers } = await supabase
      .from("wellness_stats")
      .select("user_id")
      .not("last_activity_date", "is", null);

    if (!activeUsers?.length) {
      return NextResponse.json({ status: "ok", processed: 0 });
    }

    const userIds = activeUsers.map((u) => u.user_id);

    // Find which of those users already checked in today
    const { data: todayCheckins } = await supabase
      .from("mood_log")
      .select("user_id")
      .in("user_id", userIds)
      .eq("date", today);

    const checkedInIds = new Set((todayCheckins || []).map((c) => c.user_id));
    const needReminder = userIds.filter((id) => !checkedInIds.has(id));

    if (needReminder.length === 0) {
      return NextResponse.json({ status: "ok", processed: 0, message: "All active users checked in" });
    }

    // Get user details for those needing reminder
    const { data: users } = await supabase
      .from("users")
      .select("id, name, language, locale")
      .in("id", needReminder);

    let sent = 0;

    for (const user of users || []) {
      try {
        // Check if user has WhatsApp connected
        const { data: wa } = await supabase
          .from("whatsapp_sessions")
          .select("instance_name, phone")
          .eq("user_id", user.id)
          .eq("status", "connected")
          .single();

        if (!wa?.phone) continue;

        const locale = (user.locale || user.language || "es").substring(0, 2);
        const messages: Record<string, string> = {
          es: `Hola ${user.name || ""}! Como te sientes hoy? Haz tu check-in de bienestar en DILO para mantener tu racha.`,
          en: `Hi ${user.name || ""}! How are you feeling today? Do your wellness check-in on DILO to keep your streak.`,
          fr: `Salut ${user.name || ""}! Comment te sens-tu aujourd'hui? Fais ton check-in bien-etre sur DILO.`,
          it: `Ciao ${user.name || ""}! Come ti senti oggi? Fai il tuo check-in benessere su DILO.`,
          de: `Hallo ${user.name || ""}! Wie fuhlst du dich heute? Mach dein Wellness Check-in auf DILO.`,
        };

        const msg = messages[locale] || messages.es;

        if (EVO_URL && EVO_KEY) {
          const { safeSendWhatsAppText } = await import("@/lib/wa/anti-ban");
          const r = await safeSendWhatsAppText({
            instance: wa.instance_name,
            to: wa.phone,
            text: msg,
            userId: user.id,
            proactive: true,
          });
          if (r.ok) sent++;
          else if (r.reason && r.reason !== "error") console.warn("[wellness] WA skip:", r.reason);
        }
      } catch (err) {
        console.error(`[Wellness Cron] Error for user ${user.id}:`, err);
      }
    }

    return NextResponse.json({ status: "ok", processed: needReminder.length, sent });
  } catch (err) {
    console.error("[Wellness Cron] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
