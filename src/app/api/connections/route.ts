import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/connections?userId=xxx — List connections + pending requests
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // Accepted connections
  const { data: accepted } = await supabase
    .from("user_connections")
    .select("id, requester_id, receiver_id, created_at")
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq("status", "accepted")
    .order("updated_at", { ascending: false });

  // Pending received requests
  const { data: pending } = await supabase
    .from("user_connections")
    .select("id, requester_id, created_at")
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Get user details for connections
  const otherIds = new Set<string>();
  accepted?.forEach(c => {
    otherIds.add(c.requester_id === userId ? c.receiver_id : c.requester_id);
  });
  pending?.forEach(c => otherIds.add(c.requester_id));

  const userMap: Record<string, { name: string; avatar_url: string | null }> = {};
  if (otherIds.size > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, name, email, avatar_url")
      .in("id", Array.from(otherIds));
    users?.forEach(u => {
      userMap[u.id] = { name: u.name || u.email?.split("@")[0] || "Usuario", avatar_url: u.avatar_url };
    });
  }

  // Get last message + unread count for each connection
  const contacts = [];
  for (const conn of accepted || []) {
    const otherId = conn.requester_id === userId ? conn.receiver_id : conn.requester_id;
    const other = userMap[otherId] || { name: "Usuario", avatar_url: null };

    const { data: lastMsg } = await supabase
      .from("direct_messages")
      .select("content, message_type, sender_id, created_at")
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: unread } = await supabase
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", otherId)
      .eq("receiver_id", userId)
      .is("read_at", null);

    contacts.push({
      connectionId: conn.id,
      userId: otherId,
      name: other.name,
      avatar_url: other.avatar_url,
      lastMessage: lastMsg ? {
        content: lastMsg.message_type === "image" ? "[Imagen]" : lastMsg.content.slice(0, 60),
        fromMe: lastMsg.sender_id === userId,
        time: lastMsg.created_at,
      } : null,
      unread: unread || 0,
    });
  }

  // Sort by last message time
  contacts.sort((a, b) => {
    const ta = a.lastMessage?.time || "0";
    const tb = b.lastMessage?.time || "0";
    return tb.localeCompare(ta);
  });

  const pendingRequests = (pending || []).map(p => ({
    connectionId: p.id,
    userId: p.requester_id,
    name: userMap[p.requester_id]?.name || "Usuario",
    avatar_url: userMap[p.requester_id]?.avatar_url || null,
    time: p.created_at,
  }));

  return NextResponse.json({ contacts, pendingRequests });
}

/**
 * POST /api/connections — Send connection request or accept/block
 */
export async function POST(req: NextRequest) {
  const { userId, targetId, action } = await req.json();
  if (!userId || !targetId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  if (action === "request") {
    // Check existing
    const { data: existing } = await supabase
      .from("user_connections")
      .select("id, status")
      .or(`and(requester_id.eq.${userId},receiver_id.eq.${targetId}),and(requester_id.eq.${targetId},receiver_id.eq.${userId})`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Connection already exists", status: existing.status });
    }

    await supabase.from("user_connections").insert({
      requester_id: userId,
      receiver_id: targetId,
      status: "pending",
    });

    // Send push notification to target
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", targetId);

    if (subs && subs.length > 0) {
      const { data: sender } = await supabase.from("users").select("name").eq("id", userId).single();
      const webpush = (await import("web-push")).default;
      const VAPID_PUBLIC = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/=+$/, "");
      const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/=+$/, "");
      try {
        webpush.setVapidDetails("mailto:hello@dilo.app", VAPID_PUBLIC, VAPID_PRIVATE);
        for (const sub of subs) {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
            JSON.stringify({ title: "DILO", body: `${sender?.name || "Alguien"} quiere conectar contigo`, url: "/channels" })
          ).catch(() => {});
        }
      } catch { /* skip */ }
    }

    return NextResponse.json({ ok: true, status: "pending" });
  }

  if (action === "accept") {
    await supabase.from("user_connections")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("receiver_id", userId)
      .eq("requester_id", targetId)
      .eq("status", "pending");
    return NextResponse.json({ ok: true, status: "accepted" });
  }

  if (action === "block") {
    await supabase.from("user_connections")
      .update({ status: "blocked", updated_at: new Date().toISOString() })
      .or(`and(requester_id.eq.${userId},receiver_id.eq.${targetId}),and(requester_id.eq.${targetId},receiver_id.eq.${userId})`);
    return NextResponse.json({ ok: true, status: "blocked" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export const dynamic = "force-dynamic";
