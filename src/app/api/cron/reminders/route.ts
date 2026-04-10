import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Strip base64 padding ("=") — web-push requires URL-safe base64 without padding
const VAPID_PUBLIC = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/=+$/, "");
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/=+$/, "");

let pushEnabled = false;
try {
  if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_PUBLIC !== "placeholder") {
    webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
    pushEnabled = true;
  }
} catch (e) { console.error("[Push] VAPID setup failed:", e); }

export async function GET() {
  const now = new Date().toISOString();

  // Find reminders that are due
  const { data: reminders, error } = await supabase
    .from("reminders")
    .select("id, user_id, text, due_at, channel, repeat_count, repeats_sent, target_phone")
    .eq("status", "pending")
    .lte("due_at", now)
    .limit(50);

  if (error || !reminders || reminders.length === 0) {
    return NextResponse.json({ status: "ok", processed: 0, at: now });
  }

  const evoUrl = process.env.EVOLUTION_API_URL || "";
  const evoKey = process.env.EVOLUTION_API_KEY || "";
  let sent = 0;

  for (const reminder of reminders) {
    try {
      let delivered = false;

      // ── WhatsApp delivery (priority if user has WhatsApp connected) ──
      if (reminder.channel === "whatsapp" || reminder.channel === "push") {
        // Check if user has WhatsApp connected
        const { data: channel } = await supabase
          .from("channels")
          .select("instance_name, phone, status")
          .eq("user_id", reminder.user_id)
          .eq("type", "whatsapp")
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();

        if (channel && evoUrl && evoKey) {
          try {
            const instName = channel.instance_name || `dilo_${reminder.user_id.slice(0, 8)}`;
            // Send to user's own WhatsApp number
            const phone = channel.phone || reminder.target_phone;
            if (phone) {
              const res = await fetch(`${evoUrl}/message/sendText/${instName}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evoKey },
                body: JSON.stringify({ number: phone, text: `⏰ Recordatorio de DILO:\n\n${reminder.text}` }),
              });
              if (res.ok) delivered = true;
            }
          } catch (waErr) {
            console.error("[Reminder] WhatsApp send failed:", waErr);
          }
        }
      }

      // ── Push delivery (fallback or if channel is push) ──
      if (!delivered && pushEnabled) {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("endpoint, keys")
          .eq("user_id", reminder.user_id);

        if (subs && subs.length > 0) {
          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
                JSON.stringify({ title: "DILO - Recordatorio", body: reminder.text, url: "/chat" })
              );
              delivered = true;
            } catch (pushErr) {
              console.error("[Reminder] Push failed:", pushErr);
            }
          }
        }
      }

      // Update reminder
      const newSent = (reminder.repeats_sent || 0) + 1;
      if (newSent >= (reminder.repeat_count || 1)) {
        await supabase.from("reminders").update({ status: "sent", repeats_sent: newSent }).eq("id", reminder.id);
      } else {
        await supabase.from("reminders").update({ repeats_sent: newSent }).eq("id", reminder.id);
      }

      sent++;
    } catch (e) {
      console.error("[Reminder] Processing error:", e);
    }
  }

  return NextResponse.json({ status: "ok", processed: sent, total: reminders.length, at: now });
}

export const dynamic = "force-dynamic";
