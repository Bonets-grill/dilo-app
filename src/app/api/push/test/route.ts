import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Strip base64 padding ("=") — web-push requires URL-safe base64 without padding
const VAPID_PUBLIC = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/=+$/, "");
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/=+$/, "");

/**
 * GET /api/push/test?userId=xxx — Diagnose push notification setup
 * POST /api/push/test?userId=xxx — Send a test push notification
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // 1. Check VAPID keys
  const vapidOk = VAPID_PUBLIC && VAPID_PRIVATE && VAPID_PUBLIC !== "placeholder" && VAPID_PRIVATE !== "placeholder";

  // 2. Check push subscriptions for this user
  const { data: subs, error: subsErr } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, user_agent, created_at")
    .eq("user_id", userId);

  // 3. Check pending reminders
  const { data: reminders } = await supabase
    .from("reminders")
    .select("id, text, due_at, status, channel")
    .eq("user_id", userId)
    .order("due_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    diagnosis: {
      vapid_configured: vapidOk,
      vapid_public_key_prefix: VAPID_PUBLIC.slice(0, 10) + "...",
      push_subscriptions: subs?.length || 0,
      subscriptions: subs?.map(s => ({
        id: s.id,
        endpoint_prefix: s.endpoint?.slice(0, 60) + "...",
        user_agent: s.user_agent?.slice(0, 50),
        created_at: s.created_at,
      })) || [],
      subscriptions_error: subsErr?.message || null,
      recent_reminders: reminders || [],
    },
    verdict: !vapidOk
      ? "VAPID keys not configured — push disabled"
      : (subs?.length || 0) === 0
      ? "No push subscriptions found for this user — browser never registered or permission denied"
      : "Push should work — try POST to this endpoint to send a test notification",
  });
}

export async function POST(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  try {
    webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    return NextResponse.json({ error: "VAPID setup failed", details: String(e) }, { status: 500 });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: "No push subscriptions for this user" }, { status: 404 });
  }

  const results = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
        JSON.stringify({ title: "DILO — Test Push", body: "Si ves esto, las push notifications funcionan.", url: "/chat" })
      );
      results.push({ endpoint: sub.endpoint.slice(0, 50), status: "sent" });
    } catch (err) {
      results.push({ endpoint: sub.endpoint.slice(0, 50), status: "failed", error: String(err) });
    }
  }

  return NextResponse.json({ results });
}

export const dynamic = "force-dynamic";
