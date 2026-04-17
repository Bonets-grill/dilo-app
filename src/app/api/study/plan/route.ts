import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { sanitizeError } from "@/lib/errors";

const admin = getServiceRoleClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * GET /api/study/plan?subject=Matemáticas
 * Returns existing plan or 404
 *
 * POST /api/study/plan { subject }
 * Generates a new study plan (syllabus) for the student's grade+region.
 * Each plan has ~15-20 topics in order, with description.
 */
export async function GET(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const subject = new URL(req.url).searchParams.get("subject");
  if (!subject) return NextResponse.json({ error: "missing subject" }, { status: 400 });

  const { data } = await admin.from("study_plans")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("subject", subject)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "no_plan" }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { subject } = await req.json().catch(() => ({}));
  if (!subject) return NextResponse.json({ error: "missing subject" }, { status: 400 });

  // Get student profile
  const { data: user } = await admin.from("users")
    .select("grade, school_region")
    .eq("id", auth.user.id)
    .single();

  const grade = user?.grade || "2° ESO";
  const region = user?.school_region || "ES";

  // Check existing
  const { data: existing } = await admin.from("study_plans")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("subject", subject)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "plan_exists", id: existing.id }, { status: 409 });
  }

  // Generate syllabus with GPT
  const regionNames: Record<string, string> = {
    ES: "España (LOMLOE)", MX: "México (SEP)", CO: "Colombia", US: "USA", FR: "Francia", IT: "Italia", DE: "Alemania",
  };

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content: `Eres experto en pedagogía y currículos escolares. Genera un plan de estudio completo para un alumno.`,
        },
        {
          role: "user",
          content: `Genera un temario de "${subject}" para ${grade} en ${regionNames[region] || region}.
Devuelve SOLO un JSON array con 15-20 temas en orden lógico de aprendizaje:
[{"topic":"Nombre del tema","description":"Qué aprenderá en 1 frase","lessons":3}]
donde "lessons" es cuántas clases estimadas necesita ese tema.
Solo el JSON, nada más.`,
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content || "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    const topics = match ? JSON.parse(match[0]) : [];

    const syllabus = topics.map((t: { topic: string; description: string; lessons: number }) => ({
      topic: t.topic,
      description: t.description,
      lessons: t.lessons || 2,
      completed: false,
      completed_at: null,
    }));

    const { data, error } = await admin.from("study_plans").insert({
      user_id: auth.user.id,
      subject,
      grade,
      region,
      syllabus,
      current_topic: 0,
    }).select("*").single();

    if (error) return sanitizeError(error, "study.plan", 500);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "generation_failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
