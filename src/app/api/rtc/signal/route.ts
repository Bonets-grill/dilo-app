import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * WebRTC Signaling Server for PTT
 * POST: Send a signal (offer/answer/ice candidate)
 * GET: Poll for pending signals
 *
 * Uses Supabase as a simple message relay (no WebSocket needed).
 * Signals auto-expire after 30 seconds.
 */
export async function POST(req: NextRequest) {
  const { fromUserId, toUserId, type, data } = await req.json();
  if (!fromUserId || !toUserId || !type) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Store signal in a lightweight way using analytics_events (reuse existing table)
  await supabase.from("analytics_events").insert({
    user_id: toUserId,
    event_type: "rtc_signal",
    event_data: {
      from: fromUserId,
      type, // offer, answer, ice-candidate, ptt-start, ptt-end
      data,
      expires: new Date(Date.now() + 30000).toISOString(),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // Get pending signals for this user
  const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
  const { data: signals } = await supabase
    .from("analytics_events")
    .select("id, event_data, created_at")
    .eq("user_id", userId)
    .eq("event_type", "rtc_signal")
    .gte("created_at", thirtySecondsAgo)
    .order("created_at", { ascending: true })
    .limit(20);

  // Delete consumed signals
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
