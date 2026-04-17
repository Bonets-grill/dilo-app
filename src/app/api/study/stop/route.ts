import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";

const admin = getServiceRoleClient();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * POST /api/study/stop
 * Body: { sessionId: string, transcript?: string }
 *
 * Cierra la sesión de estudio. Si el cliente pasa transcript (lo que el kid
 * habló con DILO durante la sesión), lo resumimos con GPT-4o-mini para
 * dejar constancia pedagógica para el padre — NO transcripción literal,
 * solo "qué materia tocó, qué conceptos, qué le costó".
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { sessionId, transcript } = await req.json().catch(() => ({}));
  if (!sessionId) return NextResponse.json({ error: "missing_sessionId" }, { status: 400 });

  const { data: s } = await admin
    .from("study_sessions")
    .select("id, user_id, subject, started_at, active_seconds, wall_seconds, ended_at")
    .eq("id", sessionId)
    .single();

  if (!s || s.user_id !== auth.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (s.ended_at) {
    return NextResponse.json({ error: "already_closed" }, { status: 200 });
  }

  // Generar resumen pedagógico si hay transcript
  let summary: string | null = null;
  if (transcript && typeof transcript === "string" && transcript.length > 50) {
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "Resume en 3-4 frases qué estudió este alumno en esta sesión. Solo materia, conceptos y dificultades — NO citas textuales ni cosas personales. En español neutro.",
          },
          {
            role: "user",
            content: `Materia: ${s.subject}\n\nConversación:\n${transcript.slice(0, 8000)}`,
          },
        ],
      });
      summary = resp.choices[0]?.message?.content?.trim() || null;
    } catch {
      summary = null;
    }
  }

  const { data } = await admin
    .from("study_sessions")
    .update({
      ended_at: new Date().toISOString(),
      llm_summary: summary,
    })
    .eq("id", sessionId)
    .select("id, subject, active_seconds, wall_seconds, llm_summary, ended_at")
    .single();

  return NextResponse.json({ session: data });
}

export const dynamic = "force-dynamic";
