import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_PUBLIC !== "placeholder") {
  webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
}

export async function GET() {
  const now = new Date().toISOString();

  // Find reminders that are due
  const { data: reminders, error } = await supabase
    .from("reminders")
    .select("id, user_id, text, due_at, channel, repeat_count, repeats_sent")
    .eq("status", "pending")
    .lte("due_at", now)
    .limit(50);

  if (error || !reminders || reminders.length === 0) {
    return NextResponse.json({ status: "ok", processed: 0, at: now });
  }

  let sent = 0;

  for (const reminder of reminders) {
    try {
      if (reminder.channel === "push") {
        // Get user's push subscriptions
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
            } catch (pushErr) {
              console.error("Push failed:", pushErr);
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
      console.error("Reminder processing error:", e);
    }
  }

  return NextResponse.json({ status: "ok", processed: sent, total: reminders.length, at: now });
}

export const dynamic = "force-dynamic";
