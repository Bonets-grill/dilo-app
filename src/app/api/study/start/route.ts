import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/study/start
 * Body: { subject: string }
 *
 * Abre una sesión de estudio para el kid. Si ya tiene una sesión abierta,
 * la devuelve (no duplica). El padre podrá ver esto en su card de Hijos.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { subject } = await req.json().catch(() => ({}));
  if (!subject || typeof subject !== "string") {
    return NextResponse.json({ error: "missing_subject" }, { status: 400 });
  }

  // Reusar sesión abierta si es la MISMA materia
  const { data: existing } = await admin
    .from("study_sessions")
    .select("id, subject, started_at, last_heartbeat, active_seconds, wall_seconds")
    .eq("user_id", auth.user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.subject === subject.slice(0, 80)) {
      return NextResponse.json({ reused: true, session: existing });
    }
    // Materia diferente → cerrar la sesión vieja
    await admin.from("study_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  const { data, error } = await admin
    .from("study_sessions")
    .insert({ user_id: auth.user.id, subject: subject.slice(0, 80) })
    .select("id, subject, started_at, last_heartbeat, active_seconds, wall_seconds")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export const dynamic = "force-dynamic";
