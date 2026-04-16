import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/study/heartbeat
 * Body: { sessionId: string, interaction: boolean, subject?: string }
 *
 * Llamado cada 30s desde el cliente. Suma al wall_seconds siempre y al
 * active_seconds solo si el usuario interactuó (tap/scroll/mensaje) en el
 * último intervalo. Cambiar de subject mid-session actualiza la fila.
 *
 * Server de record: calculamos delta_seconds desde last_heartbeat acotado
 * a 60 — así si el cliente falló o pausó más, no inflamos el tiempo.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { sessionId, interaction, subject } = await req.json().catch(() => ({}));
  if (!sessionId) return NextResponse.json({ error: "missing_sessionId" }, { status: 400 });

  const { data: s } = await admin
    .from("study_sessions")
    .select("id, user_id, last_heartbeat, active_seconds, wall_seconds, ended_at")
    .eq("id", sessionId)
    .single();

  if (!s || s.user_id !== auth.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (s.ended_at) {
    return NextResponse.json({ error: "session_closed" }, { status: 409 });
  }

  const now = Date.now();
  const last = new Date(s.last_heartbeat).getTime();
  const delta = Math.min(60, Math.max(0, Math.round((now - last) / 1000)));

  const wall = s.wall_seconds + delta;
  const active = s.active_seconds + (interaction ? delta : 0);

  const patch: Record<string, unknown> = {
    last_heartbeat: new Date(now).toISOString(),
    wall_seconds: wall,
    active_seconds: active,
  };
  if (subject && typeof subject === "string" && subject.length > 0) {
    patch.subject = subject.slice(0, 80);
  }

  await admin.from("study_sessions").update(patch).eq("id", sessionId);

  return NextResponse.json({ wall_seconds: wall, active_seconds: active });
}

export const dynamic = "force-dynamic";
