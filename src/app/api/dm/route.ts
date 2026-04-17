import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/require-user";
import { isUuid } from "@/lib/auth/validate";

const supabase = getServiceRoleClient();

/**
 * GET /api/dm?otherId=yyy&limit=50 — Messages in a conversation between the
 * authenticated user and otherId. `otherId` must be a UUID (validated to
 * prevent PostgREST .or() filter injection).
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const otherId = req.nextUrl.searchParams.get("otherId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
  if (!otherId || !isUuid(otherId)) return NextResponse.json({ error: "Missing or invalid otherId" }, { status: 400 });

  // Verify connection exists and is accepted
  const { data: conn } = await supabase
    .from("user_connections")
    .select("status")
    .or(`and(requester_id.eq.${userId},receiver_id.eq.${otherId}),and(requester_id.eq.${otherId},receiver_id.eq.${userId})`)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle();

  if (!conn) return NextResponse.json({ error: "Not connected" }, { status: 403 });

  // Get messages
  const { data: messages } = await supabase
    .from("direct_messages")
    .select("id, sender_id, content, message_type, media_url, read_at, created_at")
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Mark received messages as read
  await supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_id", otherId)
    .eq("receiver_id", userId)
    .is("read_at", null);

  // Get other user info
  const { data: other } = await supabase
    .from("users")
    .select("id, name, email, avatar_url")
    .eq("id", otherId)
    .single();

  return NextResponse.json({
    other: {
      id: other?.id,
      name: other?.name || other?.email?.split("@")[0] || "Usuario",
      avatar_url: other?.avatar_url,
    },
    messages: (messages || []).reverse().map(m => ({
      id: m.id,
      fromMe: m.sender_id === userId,
      content: m.content,
      type: m.message_type,
      mediaUrl: m.media_url,
      read: !!m.read_at,
      time: m.created_at,
    })),
  });
}

/**
 * POST /api/dm — Send a direct message. Sender is the authenticated user;
 * receiverId must be UUID (PostgREST filter injection vector).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { receiverId, content, messageType = "text", mediaUrl } = body;
  if (!receiverId || !content) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!isUuid(receiverId)) {
    return NextResponse.json({ error: "Invalid receiverId" }, { status: 400 });
  }

  // Verify connection
  const { data: conn } = await supabase
    .from("user_connections")
    .select("status")
    .or(`and(requester_id.eq.${userId},receiver_id.eq.${receiverId}),and(requester_id.eq.${receiverId},receiver_id.eq.${userId})`)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle();

  if (!conn) return NextResponse.json({ error: "Not connected" }, { status: 403 });

  // Insert message
  const { data: msg, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: userId,
      receiver_id: receiverId,
      content,
      message_type: messageType,
      media_url: mediaUrl || null,
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("[dm.send]", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // Send push notification to receiver
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys")
    .eq("user_id", receiverId);

  if (subs && subs.length > 0) {
    const { data: sender } = await supabase.from("users").select("name").eq("id", userId).single();
    const preview = messageType === "image" ? "[Imagen]" : content.slice(0, 100);
    const webpush = (await import("web-push")).default;
    const VAPID_PUBLIC = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/=+$/, "");
    const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/=+$/, "");
    try {
      webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
      for (const sub of subs) {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          JSON.stringify({ title: sender?.name || "Mensaje", body: preview, url: "/dm" })
        ).catch(() => {});
      }
    } catch { /* skip */ }
  }

  return NextResponse.json({ ok: true, messageId: msg?.id, time: msg?.created_at });
}

export const dynamic = "force-dynamic";
