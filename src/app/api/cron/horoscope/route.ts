import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateHoroscope } from "@/lib/horoscope/generate";
import { fetchExternalContext } from "@/lib/horoscope/context";
import { zodiacInfoBySign, type ZodiacSign } from "@/lib/zodiac";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/cron/horoscope
 * Se ejecuta cada mañana (ver vercel.json). Para cada usuario con birthdate:
 *   1. Si ya tiene horóscopo para la fecha → skip
 *   2. Lee hasta 8 facts de memory_facts como contexto personal
 *   3. Genera texto markdown + audio TTS con OpenAI
 *   4. Inserta en horoscopes (unique por user_id + for_date)
 *   5. Envía push notification linkando a /horoscope/today
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && auth !== expected) {
    // Vercel cron llega sin auth header por default; también permitimos
    // la cabecera automática x-vercel-cron como señal.
    if (!req.headers.get("x-vercel-cron")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: users } = await admin
    .from("users")
    .select("id, name, email, zodiac_sign")
    .not("birthdate", "is", null)
    .not("zodiac_sign", "is", null)
    .limit(500);

  if (!users || users.length === 0) {
    return NextResponse.json({ processed: 0, skipped: 0 });
  }

  let processed = 0;
  let skipped = 0;
  const errors: Array<{ userId: string; error: string }> = [];

  for (const u of users) {
    try {
      const { data: existing } = await admin
        .from("horoscopes")
        .select("id")
        .eq("user_id", u.id)
        .eq("for_date", today)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      const [{ data: facts }, extra] = await Promise.all([
        admin
          .from("memory_facts")
          .select("fact, category")
          .eq("user_id", u.id)
          .order("created_at", { ascending: false })
          .limit(8),
        fetchExternalContext(admin, u.id),
      ]);

      const mergedFacts: Array<{ fact: string; category: string }> = [
        ...extra, // Gmail + WhatsApp first — más recientes
        ...((facts as Array<{ fact: string; category: string }>) || []),
      ];

      const h = await generateHoroscope({
        userId: u.id,
        userName: (u.name as string) || (u.email as string)?.split("@")[0] || null,
        zodiac: u.zodiac_sign as ZodiacSign,
        facts: mergedFacts,
        forDate: today,
      });

      if (!h.text) { errors.push({ userId: u.id, error: "empty_text" }); continue; }

      await admin.from("horoscopes").insert({
        user_id: u.id,
        for_date: today,
        zodiac_sign: u.zodiac_sign,
        text: h.text,
        audio_url: h.audioBase64,
        meta: h.meta,
      });

      // Push notification
      try {
        const { data: subs } = await admin
          .from("push_subscriptions")
          .select("endpoint, keys")
          .eq("user_id", u.id);
        if (subs && subs.length > 0) {
          const info = zodiacInfoBySign(u.zodiac_sign as ZodiacSign);
          const webpush = (await import("web-push")).default;
          const VAPID_PUBLIC = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/=+$/, "");
          const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/=+$/, "");
          webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
          for (const sub of subs) {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
              JSON.stringify({
                title: `${info?.emoji || "✨"} Tu horóscopo de hoy — ${info?.name || ""}`,
                body: "Tu audio de motivación y carta astral están listos.",
                url: "/horoscope/today",
                tag: `horoscope-${today}`,
              })
            ).catch(() => {});
          }
        }
      } catch { /* push best-effort */ }

      processed++;
    } catch (err) {
      errors.push({ userId: u.id, error: err instanceof Error ? err.message : "unknown" });
    }
  }

  return NextResponse.json({ processed, skipped, errorsCount: errors.length, sample: errors.slice(0, 3) });
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;
