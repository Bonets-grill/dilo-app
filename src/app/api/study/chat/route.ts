import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getTeacherPrompt, type TopicHistoryEntry } from "@/lib/study/teachers";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * POST /api/study/chat
 * Body: { messages, subject, mode, studyContext, sessionId }
 *
 * Chat con maestro especializado. En modo plan, carga el temario y da
 * la clase del tema actual. En modo school, tutoriza sobre el material.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { messages, subject, mode, studyContext, sessionId } = await req.json().catch(() => ({}));
  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages required" }), { status: 400 });
  }

  const studyMode = mode === "plan" ? "plan" : "school";
  const subjectKey = (subject || "Ciencias").toString();
  const userId = auth.user.id;

  let planTopic: string | undefined;
  let currentTopicIdx: number | null = null;

  // En modo plan, cargar el tema actual del syllabus
  if (studyMode === "plan") {
    const { data: plan } = await admin.from("study_plans")
      .select("syllabus, current_topic")
      .eq("user_id", userId)
      .eq("subject", subjectKey)
      .maybeSingle();

    if (plan?.syllabus && Array.isArray(plan.syllabus)) {
      const idx = plan.current_topic || 0;
      currentTopicIdx = idx;
      const topic = plan.syllabus[idx];
      if (topic) {
        planTopic = `${topic.topic}: ${topic.description || ""}`;
      }
    }
  }

  // Cargar historial pedagógico: temas completados + en progreso (excepto el actual)
  let history: TopicHistoryEntry[] = [];
  const { data: progressRows } = await admin
    .from("study_topic_progress")
    .select("topic_idx, topic_name, summary, struggled, status, last_studied_at")
    .eq("user_id", userId)
    .eq("subject", subjectKey)
    .in("status", ["completed", "in_progress"])
    .order("topic_idx", { ascending: true });

  if (progressRows) {
    history = progressRows
      .filter((r) => r.topic_idx !== currentTopicIdx || r.status === "completed")
      .map((r) => ({
        topic_idx: r.topic_idx,
        topic_name: r.topic_name,
        summary: r.summary,
        struggled: Array.isArray(r.struggled) ? r.struggled : [],
      }));
  }

  // Es el primer turno del alumno en esta conversación → activar check-in
  const userTurns = messages.filter((m: { role: string }) => m?.role === "user").length;
  const isOpening = userTurns <= 1;

  const systemPrompt = getTeacherPrompt(
    subjectKey,
    studyMode,
    studyContext || undefined,
    planTopic,
    history,
    isOpening
  );

  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.slice(-20).map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Persistir el último mensaje del alumno (el turno actual que llega en messages)
  const lastUserMsg = [...messages].reverse().find((m) => m?.role === "user");
  if (lastUserMsg?.content && typeof lastUserMsg.content === "string") {
    await admin.from("study_messages").insert({
      user_id: userId,
      subject: subjectKey,
      session_id: sessionId || null,
      topic_idx: currentTopicIdx,
      role: "user",
      content: lastUserMsg.content.slice(0, 8000),
    });
  }

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: llmMessages,
      max_tokens: 600,
      temperature: 0.7,
      stream: true,
    });

    const encoder = new TextEncoder();
    let assistantFull = "";
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) {
            assistantFull += text;
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();

        // Persistir respuesta completa del maestro tras cerrar el stream
        if (assistantFull.trim().length > 0) {
          await admin.from("study_messages").insert({
            user_id: userId,
            subject: subjectKey,
            session_id: sessionId || null,
            topic_idx: currentTopicIdx,
            role: "assistant",
            content: assistantFull.slice(0, 8000),
          });
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "error" }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
