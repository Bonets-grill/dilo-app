import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getTeacherPrompt } from "@/lib/study/teachers";

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
  let planTopic: string | undefined;

  // En modo plan, cargar el tema actual del syllabus
  if (studyMode === "plan") {
    const { data: plan } = await admin.from("study_plans")
      .select("syllabus, current_topic")
      .eq("user_id", auth.user.id)
      .eq("subject", subject || "")
      .maybeSingle();

    if (plan?.syllabus && Array.isArray(plan.syllabus)) {
      const idx = plan.current_topic || 0;
      const topic = plan.syllabus[idx];
      if (topic) {
        planTopic = `${topic.topic}: ${topic.description || ""}`;
      }
    }
  }

  const systemPrompt = getTeacherPrompt(
    subject || "Ciencias",
    studyMode,
    studyContext || undefined,
    planTopic
  );

  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.slice(-20).map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: llmMessages,
      max_tokens: 600,
      temperature: 0.7,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
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
