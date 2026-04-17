import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import webpush from "web-push";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

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

export async function GET(req: NextRequest) {
  const gate = requireCronAuth(req); if (gate) return gate;
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
          .select("id, instance_name, phone, status")
          .eq("user_id", reminder.user_id)
          .eq("type", "whatsapp")
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();

        if (channel && evoUrl && evoKey) {
          try {
            const instName = channel.instance_name || `dilo_${reminder.user_id.slice(0, 8)}`;

            // Get user's own phone number from the connected WhatsApp instance
            let phone = channel.phone;
            if (!phone) {
              try {
                const infoRes = await fetch(`${evoUrl}/instance/fetchInstances`, {
                  headers: { apikey: evoKey },
                });
                if (infoRes.ok) {
                  const instances = await infoRes.json();
                  const inst = Array.isArray(instances) ? instances.find((i: Record<string, unknown>) => i.name === instName) : null;
                  if (inst?.ownerJid) {
                    phone = String(inst.ownerJid).replace("@s.whatsapp.net", "");
                    // Save phone for future use
                    await supabase.from("channels").update({ phone }).eq("id", channel.id);
                  }
                }
              } catch { /* skip */ }
            }

            if (phone) {
              const { safeSendWhatsAppText } = await import("@/lib/wa/anti-ban");
              const res = await safeSendWhatsAppText({
                instance: instName,
                to: phone,
                text: `⏰ Recordatorio de DILO:\n\n${reminder.text}`,
                userId: reminder.user_id,
                proactive: true,
              });
              if (res.ok) delivered = true;
              else if (res.reason && res.reason !== "error") console.warn("[reminders] WA skip:", res.reason);
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

  const { logCronResult } = await import("@/lib/cron/logger");
  await logCronResult("reminders", { processed: sent, total: reminders.length });
  return NextResponse.json({ status: "ok", processed: sent, total: reminders.length, at: now });
}

export const dynamic = "force-dynamic";
