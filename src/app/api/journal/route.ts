import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * GET /api/journal?userId=xxx&limit=20 — Get journal entries
 * POST /api/journal — Send a journal message, DILO responds as mentor
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const { data: entries } = await supabase
    .from("user_journal")
    .select("id, content, dilo_response, mood, category, extracted_lessons, extracted_goals, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: goals } = await supabase
    .from("user_goals")
    .select("id, goal, status, progress_pct, next_check_in")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const { data: lessons } = await supabase
    .from("user_lessons")
    .select("id, lesson, category, times_relevant")
    .eq("user_id", userId)
    .eq("active", true)
    .order("times_relevant", { ascending: false })
    .limit(10);

  return NextResponse.json({
    entries: entries || [],
    activeGoals: goals || [],
    topLessons: lessons || [],
  });
}

export async function POST(req: NextRequest) {
  const { userId, content } = await req.json();
  if (!userId || !content) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Get user context
  const [userRes, lessonsRes, goalsRes, recentRes] = await Promise.all([
    supabase.from("users").select("name, language").eq("id", userId).single(),
    supabase.from("user_lessons").select("lesson").eq("user_id", userId).eq("active", true).order("times_relevant", { ascending: false }).limit(10),
    supabase.from("user_goals").select("goal, status, progress_pct").eq("user_id", userId).eq("status", "active"),
    supabase.from("user_journal").select("content, dilo_response, mood, category").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
  ]);

  const name = userRes.data?.name || "amigo";
  const lang = userRes.data?.language || "es";
  const lessons = lessonsRes.data?.map(l => l.lesson) || [];
  const goals = goalsRes.data || [];
  const recent = recentRes.data || [];

  const systemPrompt = `Eres DILO, el mentor personal de ${name}. Tu rol en este espacio es ESCUCHAR, APRENDER, y ACONSEJAR.

REGLAS:
1. Escucha con empatía genuina. Nunca juzgues.
2. Extrae lecciones de lo que te dice — identifica patrones.
3. Si detectas un error que ya cometió antes, díselo con tacto.
4. Si detectas una meta, anímale y haz seguimiento.
5. Si detectas una decisión importante, pregunta los detalles para hacer seguimiento después.
6. Celebra los logros, por pequeños que sean.
7. Sé conciso pero profundo — máximo 4-5 líneas.
8. Haz UNA pregunta al final para profundizar.
9. Responde en ${lang === "es" ? "español" : lang}.
10. Tono: amigo sabio, NO terapeuta ni coach corporativo.

LECCIONES APRENDIDAS DE ${name.toUpperCase()} (úsalas si son relevantes):
${lessons.length > 0 ? lessons.map(l => `- ${l}`).join("\n") : "- Aún ninguna"}

METAS ACTIVAS:
${goals.length > 0 ? goals.map(g => `- ${g.goal} (${g.progress_pct}%)`).join("\n") : "- Ninguna definida"}

CONVERSACIONES RECIENTES:
${recent.map(r => `[${r.mood || "?"}] Usuario: ${r.content?.slice(0, 100)}\nDILO: ${r.dilo_response?.slice(0, 100)}`).join("\n\n")}

Al final de tu respuesta, SIEMPRE incluye un bloque JSON oculto con tu análisis:
<!--DILO_ANALYSIS
{
  "mood": "positive|negative|neutral|mixed",
  "category": "personal|professional|financial|health|relationship|general",
  "lessons": ["lección 1", "lección 2"],
  "goals": ["meta detectada"],
  "decisions": [{"text": "decisión", "follow_up_days": 30}],
  "follow_up_days": null
}
-->`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    temperature: 0.8,
    messages: [
      { role: "system", content: systemPrompt },
      ...recent.slice(0, 3).reverse().flatMap(r => [
        { role: "user" as const, content: r.content || "" },
        { role: "assistant" as const, content: r.dilo_response || "" },
      ]).filter(m => m.content),
      { role: "user", content },
    ],
  });

  const fullResponse = completion.choices[0]?.message?.content || "Cuéntame más...";

  // Extract analysis from hidden JSON block
  let mood = "neutral";
  let category = "general";
  let extractedLessons: string[] = [];
  let extractedGoals: string[] = [];
  let extractedDecisions: Array<{ text: string; follow_up_days: number }> = [];
  let followUpDays: number | null = null;

  const analysisMatch = fullResponse.match(/<!--DILO_ANALYSIS\s*([\s\S]*?)\s*-->/);
  if (analysisMatch) {
    try {
      const analysis = JSON.parse(analysisMatch[1]);
      mood = analysis.mood || "neutral";
      category = analysis.category || "general";
      extractedLessons = analysis.lessons || [];
      extractedGoals = analysis.goals || [];
      extractedDecisions = analysis.decisions || [];
      followUpDays = analysis.follow_up_days || null;
    } catch { /* skip */ }
  }

  // Clean response (remove hidden JSON)
  const cleanResponse = fullResponse.replace(/<!--DILO_ANALYSIS[\s\S]*?-->/, "").trim();

  // Calculate follow-up date
  const followUpDate = followUpDays ? new Date(Date.now() + followUpDays * 86400000).toISOString().slice(0, 10) : null;

  // Save journal entry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entry } = await (supabase.from("user_journal") as any).insert({
    user_id: userId,
    content,
    dilo_response: cleanResponse,
    extracted_lessons: extractedLessons,
    extracted_goals: extractedGoals,
    extracted_decisions: extractedDecisions,
    mood,
    category,
    follow_up_date: followUpDate,
  }).select("id").single();

  // Save extracted lessons
  for (const lesson of extractedLessons) {
    if (lesson && lesson.length > 5) {
      // Check if similar lesson exists
      const { data: existing } = await supabase
        .from("user_lessons")
        .select("id, times_relevant")
        .eq("user_id", userId)
        .ilike("lesson", `%${lesson.slice(0, 30)}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Increment relevance
        await supabase.from("user_lessons").update({
          times_relevant: (existing.times_relevant || 0) + 1,
        }).eq("id", existing.id);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("user_lessons") as any).insert({
          user_id: userId,
          lesson,
          source_journal_id: entry?.id,
          category,
        });
      }
    }
  }

  // Save extracted goals
  for (const goal of extractedGoals) {
    if (goal && goal.length > 5) {
      const nextCheckIn = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("user_goals") as any).insert({
        user_id: userId,
        goal,
        source_journal_id: entry?.id,
        next_check_in: nextCheckIn,
      });
    }
  }

  return NextResponse.json({
    response: cleanResponse,
    mood,
    category,
    lessonsExtracted: extractedLessons.length,
    goalsDetected: extractedGoals.length,
  });
}

export const dynamic = "force-dynamic";
