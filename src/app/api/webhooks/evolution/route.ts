import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

let pushEnabled = false;
try {
  if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_PUBLIC !== "placeholder") {
    webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
    pushEnabled = true;
  }
} catch { /* VAPID keys invalid */ }

export async function POST(req: NextRequest) {
  // Evolution sends an `apikey` header on every webhook delivery. We require
  // it matches our configured secret — otherwise any JSON POST could forge
  // inbound messages on behalf of any connected WhatsApp instance.
  const evoSecret = process.env.EVOLUTION_WEBHOOK_SECRET || process.env.EVOLUTION_API_KEY;
  if (evoSecret && evoSecret !== "placeholder") {
    const got = req.headers.get("apikey");
    if (got !== evoSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await req.json();
    const event = body.event;

    if (event === "messages.upsert" || body.data?.messageType) {
      const msg = body.data || body;
      const key = msg.key || {};
      const fromMe = key.fromMe;
      const remoteJid = key.remoteJid || "";
      const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || msg.message?.imageMessage?.caption
        || "";
      const pushName = msg.pushName || "";
      const instanceName = body.instance || body.instanceName || "";

      if (!fromMe && text) {

        // Find user by instance name pattern dilo_XXXXXXXX
        const shortId = instanceName.replace("dilo_", "");

        // Find all users whose ID starts with this prefix
        const { data: users } = await supabase
          .from("users")
          .select("id")
          .like("id", `${shortId}%`)
          .limit(1);

        const userId = users?.[0]?.id;

        // Store incoming message
        await supabase.from("analytics_events").insert({
          user_id: userId || null,
          event_type: "whatsapp_incoming",
          event_data: {
            from_phone: phone,
            from_name: pushName,
            text,
            instance: instanceName,
            timestamp: new Date().toISOString(),
          },
        });

        // Track for proactive intelligence (unanswered messages, commitments)
        if (userId) {
          // Detect commitments: "te lo envío el lunes", "quedamos el jueves", "nos vemos a las 9"
          const commitmentMatch = text.match(/(?:te\s+(?:lo\s+)?(?:envío|mando|paso|doy)|quedamos|nos\s+vemos|te\s+llamo|te\s+escribo|te\s+confirmo|lo\s+tengo\s+(?:el|para))\s+.*?(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo|mañana|hoy|esta\s+tarde|esta\s+noche|\d{1,2}(?::\d{2})?)/i);
          const hasCommitment = !!commitmentMatch;

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from("whatsapp_tracking") as any).insert({
              user_id: userId,
              phone,
              contact_name: pushName || null,
              direction: "in",
              message_preview: text.slice(0, 200),
              has_commitment: hasCommitment,
              commitment_text: hasCommitment ? commitmentMatch![0] : null,
              responded: false,
            });
          } catch { /* skip */ }

          // Mark previous outgoing messages to this contact as "conversation active"
          // (they responded, so user doesn't need "unanswered" alert for their messages)
        }

        // Send PUSH notification to user
        if (userId) {
          const { data: subs } = await supabase
            .from("push_subscriptions")
            .select("endpoint, keys")
            .eq("user_id", userId);

          if (subs && subs.length > 0) {
            const payload = JSON.stringify({
              title: `💬 ${pushName || phone}`,
              body: text.slice(0, 200),
              url: "/chat",
              tag: `wa-${phone}`,
            });

            for (const sub of subs) {
              try {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
                  payload
                );
              } catch (e) {
                console.error("[Push] Failed:", e);
                // Remove invalid subscription
                if ((e as { statusCode?: number }).statusCode === 410) {
                  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[Evolution Webhook] Error:", err);
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
