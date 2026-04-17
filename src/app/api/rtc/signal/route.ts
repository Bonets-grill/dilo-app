import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/require-user";
import { isUuid } from "@/lib/auth/validate";

const supabase = getServiceRoleClient();

/**
 * WebRTC Signaling Server for PTT (walkie-talkie).
 * POST: send a signal (offer/answer/ice candidate). `fromUserId` is
 *   always the authenticated user — the client cannot spoof identity.
 *   `toUserId` must be a UUID (prevents malformed IDs from polluting the
 *   analytics_events relay table).
 * GET : poll for pending signals addressed to the authenticated user only.
 *
 * Signals auto-expire after 30 s.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const fromUserId = auth.user.id;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { toUserId, type, data } = body;
  if (!toUserId || !type) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!isUuid(toUserId)) {
    return NextResponse.json({ error: "Invalid toUserId" }, { status: 400 });
  }

  await supabase.from("analytics_events").insert({
    user_id: toUserId,
    event_type: "rtc_signal",
    event_data: {
      from: fromUserId,
      type,
      data,
      expires: new Date(Date.now() + 30000).toISOString(),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
  const { data: signals } = await supabase
    .from("analytics_events")
    .select("id, event_data, created_at")
    .eq("user_id", userId)
    .eq("event_type", "rtc_signal")
    .gte("created_at", thirtySecondsAgo)
    .order("created_at", { ascending: true })
    .limit(20);

  if (signals && signals.length > 0) {
    const ids = signals.map(s => s.id);
    await supabase.from("analytics_events").delete().in("id", ids);
  }

  return NextResponse.json({
    signals: (signals || []).map(s => ({
      from: (s.event_data as Record<string, unknown>).from,
      type: (s.event_data as Record<string, unknown>).type,
      data: (s.event_data as Record<string, unknown>).data,
    })),
  });
}

export const dynamic = "force-dynamic";
