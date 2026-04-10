import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/calls/history?userId=xxx
 * Devuelve las últimas 50 llamadas del usuario (como caller o callee).
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  // Obtener llamadas donde el usuario es caller o callee
  const { data: calls, error } = await supabase
    .from("call_log")
    .select("id, caller_id, callee_id, call_type, status, initiated_at, answered_at, ended_at, duration_seconds, end_reason")
    .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!calls || calls.length === 0) {
    return NextResponse.json({ calls: [] });
  }

  // Obtener IDs únicos de los otros usuarios
  const otherUserIds = [
    ...new Set(
      calls.map((c) => (c.caller_id === userId ? c.callee_id : c.caller_id))
    ),
  ];

  // Buscar info de los otros usuarios
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, avatar_url")
    .in("id", otherUserIds);

  const userMap = new Map(
    (users || []).map((u) => [
      u.id,
      {
        id: u.id,
        name: u.name || u.email?.split("@")[0] || "Usuario",
        avatar: u.avatar_url,
      },
    ])
  );

  const formatted = calls.map((c) => {
    const direction = c.caller_id === userId ? "outgoing" : "incoming";
    const otherId = direction === "outgoing" ? c.callee_id : c.caller_id;

    return {
      id: c.id,
      type: c.call_type as "voice" | "video",
      status: c.status,
      otherUser: userMap.get(otherId) || { id: otherId, name: "Usuario", avatar: null },
      duration: c.duration_seconds,
      time: c.initiated_at,
      direction: direction as "outgoing" | "incoming",
    };
  });

  return NextResponse.json({ calls: formatted });
}

export const dynamic = "force-dynamic";
