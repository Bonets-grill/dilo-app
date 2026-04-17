import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";

const admin = getServiceRoleClient();

/**
 * GET /api/family/kids-status
 *
 * Devuelve, para cada hijo vinculado al padre autenticado:
 *  - estado actual: si hay sesión abierta, qué materia, tiempo activo y wall
 *  - tiempo total activo hoy, última sesión cerrada
 *  - si heartbeat >3 min, estado = "idle" (el cron debería cerrarla pronto)
 */
export async function GET(_req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Hijos vinculados al padre
  const { data: kids } = await admin
    .from("users")
    .select("id, name, email")
    .eq("parent_user_id", auth.user.id)
    .eq("family_role", "kid");

  if (!kids || kids.length === 0) {
    return NextResponse.json({ kids: [] });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayIso = startOfToday.toISOString();

  const result = [];
  for (const kid of kids) {
    // Sesión abierta
    const { data: open } = await admin
      .from("study_sessions")
      .select("id, subject, started_at, last_heartbeat, active_seconds, wall_seconds")
      .eq("user_id", kid.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let status: "studying" | "idle" | "offline" = "offline";
    let current = null;
    if (open) {
      const secSinceHb = (Date.now() - new Date(open.last_heartbeat).getTime()) / 1000;
      status = secSinceHb <= 60 ? "studying" : secSinceHb <= 180 ? "idle" : "offline";
      current = {
        session_id: open.id,
        subject: open.subject,
        started_at: open.started_at,
        last_heartbeat: open.last_heartbeat,
        active_seconds: open.active_seconds,
        wall_seconds: open.wall_seconds,
      };
    }

    // Total hoy (sumando cerradas + abierta)
    const { data: today } = await admin
      .from("study_sessions")
      .select("active_seconds, wall_seconds, subject, ended_at")
      .eq("user_id", kid.id)
      .gte("started_at", startOfTodayIso);

    const todayActive = (today || []).reduce((s, r) => s + (r.active_seconds || 0), 0);
    const todayWall = (today || []).reduce((s, r) => s + (r.wall_seconds || 0), 0);
    const subjectsToday = Array.from(
      new Set((today || []).map((r) => r.subject).filter(Boolean))
    );

    // Última cerrada
    const { data: last } = await admin
      .from("study_sessions")
      .select("subject, started_at, ended_at, active_seconds, wall_seconds, llm_summary")
      .eq("user_id", kid.id)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    result.push({
      id: kid.id,
      name: kid.name || (kid.email as string | null)?.split("@")[0] || "Hijo",
      status,
      current,
      today: {
        active_seconds: todayActive,
        wall_seconds: todayWall,
        subjects: subjectsToday,
      },
      last_closed: last,
    });
  }

  return NextResponse.json({ kids: result });
}

export const dynamic = "force-dynamic";
