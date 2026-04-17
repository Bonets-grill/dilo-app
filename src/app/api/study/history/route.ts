import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/study/history?subject=X&limit=60
 * Devuelve los últimos N mensajes del maestro para (user, subject) en orden
 * cronológico ASC, más el tema actual del plan y el nombre del tema anterior
 * (para que el front pueda mostrar "¿cómo te fue con X?").
 */
export async function GET(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const subject = url.searchParams.get("subject");
  const limitRaw = parseInt(url.searchParams.get("limit") || "60", 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 60 : limitRaw, 10), 200);
  if (!subject) return NextResponse.json({ error: "missing_subject" }, { status: 400 });

  const userId = auth.user.id;

  // Últimos N mensajes (DESC), luego los invertimos a ASC
  const { data: msgRows } = await admin
    .from("study_messages")
    .select("id, role, content, topic_idx, created_at")
    .eq("user_id", userId)
    .eq("subject", subject)
    .order("created_at", { ascending: false })
    .limit(limit);

  const messages = (msgRows || []).slice().reverse();

  // Plan actual + nombre del tema
  const { data: plan } = await admin
    .from("study_plans")
    .select("syllabus, current_topic")
    .eq("user_id", userId)
    .eq("subject", subject)
    .maybeSingle();

  let currentTopic: number | null = null;
  let currentTopicName: string | null = null;
  let previousTopicName: string | null = null;
  if (plan?.syllabus && Array.isArray(plan.syllabus)) {
    const idx: number = plan.current_topic ?? 0;
    currentTopic = idx;
    const cur = plan.syllabus[idx];
    currentTopicName = cur?.topic || null;
    if (idx > 0) {
      const prev = plan.syllabus[idx - 1];
      previousTopicName = prev?.topic || null;
    }
  }

  return NextResponse.json({
    messages,
    currentTopic,
    currentTopicName,
    previousTopicName,
  });
}

export const dynamic = "force-dynamic";
