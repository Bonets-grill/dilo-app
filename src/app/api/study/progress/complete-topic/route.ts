import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";

const admin = getServiceRoleClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface SyllabusEntry {
  topic: string;
  description?: string;
  lessons?: number;
  completed?: boolean;
  completed_at?: string | null;
}

/**
 * POST /api/study/progress/complete-topic
 * Body: { subject: string }
 *
 * Cierra el tema actual del plan del alumno: genera un resumen pedagógico y
 * lista de conceptos que le costaron a partir de los mensajes recientes,
 * upsert a study_topic_progress, marca syllabus[i].completed y avanza
 * current_topic al siguiente. Devuelve el próximo tema (si hay).
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { subject } = await req.json().catch(() => ({}));
  if (!subject || typeof subject !== "string") {
    return NextResponse.json({ error: "missing_subject" }, { status: 400 });
  }

  const userId = auth.user.id;

  const { data: plan } = await admin
    .from("study_plans")
    .select("id, syllabus, current_topic")
    .eq("user_id", userId)
    .eq("subject", subject)
    .maybeSingle();

  if (!plan) return NextResponse.json({ error: "no_plan" }, { status: 404 });

  const syllabus: SyllabusEntry[] = Array.isArray(plan.syllabus) ? plan.syllabus : [];
  const currentIdx: number = plan.current_topic ?? 0;
  const currentTopic = syllabus[currentIdx];
  if (!currentTopic) return NextResponse.json({ error: "topic_out_of_range" }, { status: 400 });

  // Mensajes recientes del tema actual (últimos 40 turnos)
  const { data: msgRows } = await admin
    .from("study_messages")
    .select("role, content")
    .eq("user_id", userId)
    .eq("subject", subject)
    .eq("topic_idx", currentIdx)
    .order("created_at", { ascending: false })
    .limit(40);

  const transcript = (msgRows || [])
    .slice()
    .reverse()
    .map((m) => `${m.role === "user" ? "Alumno" : "Maestro"}: ${m.content}`)
    .join("\n");

  let summary: string | null = null;
  let struggled: string[] = [];
  if (transcript.length > 80) {
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Eres analista pedagógico. Lee la conversación y devuelve JSON con dos campos: " +
              '{"summary": "2-3 frases de qué aprendió el alumno en este tema, tono neutro", ' +
              '"struggled": ["concepto1","concepto2"] (máx 4, cosas que claramente le costaron o falló; ' +
              "array vacío si no hay dificultades claras)}. Solo JSON, nada más.",
          },
          {
            role: "user",
            content: `Tema: ${currentTopic.topic}\n\nConversación:\n${transcript.slice(0, 8000)}`,
          },
        ],
      });
      const raw = resp.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw);
      summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 600) : null;
      if (Array.isArray(parsed.struggled)) {
        struggled = (parsed.struggled as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((s: string) => s.slice(0, 80))
          .slice(0, 4);
      }
    } catch {
      // Seguimos sin summary si falla la IA; el progreso se registra igual
    }
  }

  const nowIso = new Date().toISOString();

  // Upsert progreso del tema
  await admin.from("study_topic_progress").upsert(
    {
      user_id: userId,
      subject,
      topic_idx: currentIdx,
      topic_name: currentTopic.topic,
      status: "completed",
      summary,
      struggled,
      last_studied_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "user_id,subject,topic_idx" }
  );

  // Marcar en el syllabus y avanzar current_topic
  const newSyllabus = syllabus.map((t, i) =>
    i === currentIdx ? { ...t, completed: true, completed_at: nowIso } : t
  );
  const nextIdx = currentIdx + 1 < syllabus.length ? currentIdx + 1 : currentIdx;
  const planFinished = currentIdx + 1 >= syllabus.length;

  await admin
    .from("study_plans")
    .update({
      syllabus: newSyllabus,
      current_topic: nextIdx,
      updated_at: nowIso,
    })
    .eq("id", plan.id);

  return NextResponse.json({
    completed_topic: { idx: currentIdx, name: currentTopic.topic, summary, struggled },
    next_topic: planFinished ? null : { idx: nextIdx, name: syllabus[nextIdx]?.topic },
    plan_finished: planFinished,
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
