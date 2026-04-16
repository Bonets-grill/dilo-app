import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * POST /api/study/chat
 * Body: { messages, subject, studyContext, sessionId }
 *
 * Chat dedicado para el modo estudio. DILO actúa como maestro/tutor
 * especializado en la materia y basado en el material que el alumno subió.
 * No es el chat general — aquí DILO pregunta, explica, corrige y evalúa.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { messages, subject, studyContext, sessionId } = await req.json().catch(() => ({}));
  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages required" }), { status: 400 });
  }

  const materialBlock = studyContext
    ? `\n\nMATERIAL DEL ALUMNO (extraído de sus fotos de libro/tarea):\n---\n${String(studyContext).slice(0, 6000)}\n---\nBasa tus preguntas y explicaciones en ESTE material exacto. No inventes ejercicios de otros temas.`
    : "";

  const systemPrompt = `Eres el MAESTRO de ${subject || "esta materia"} del alumno. Tu trabajo es:

1. PREGUNTAR sobre el material — hazle preguntas para comprobar que entiende.
2. EXPLICAR conceptos que no entienda — con ejemplos claros y sencillos.
3. CORREGIR errores — si responde mal, explícale por qué y dale la respuesta correcta.
4. PRACTICAR — proponle ejercicios similares a los del libro/tarea.
5. MOTIVAR — celebra cuando acierte, anímale cuando falle.

Reglas:
- Habla de tú, tono cercano pero educativo. Eres exigente pero simpático.
- Respuestas CORTAS — el alumno está en el móvil, no quiere párrafos enormes.
- Si el alumno sube una tarea con ejercicios, resuélvelos paso a paso CON ÉL (no le des la respuesta directa — pregúntale primero qué cree).
- Al empezar, saluda brevemente y haz la primera pregunta sobre el material.
- Si no hay material subido, pregúntale qué tema están dando en clase.${materialBlock}`;

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
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Session-Id": sessionId || "" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "error" }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
