import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const langNames: Record<string, string> = {
  es: "español", en: "English", fr: "français", it: "italiano", de: "Deutsch",
};

export async function POST(req: NextRequest) {
  const { messages, locale = "es" } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing messages", { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "placeholder") {
    return new Response("API key not configured", { status: 500 });
  }

  const lang = locale.split("-")[0] || "es";
  const langName = langNames[lang] || "español";

  const systemPrompt = `Eres DILO, un asistente personal inteligente.

IDIOMA: Responde SIEMPRE en ${langName}.

ESTILO:
- Respuestas cortas y directas. No hagas listas largas a menos que te lo pidan.
- Usa markdown con moderación: negritas para énfasis, listas solo cuando sean necesarias.
- Habla como un amigo inteligente, no como un manual. Tutea al usuario.
- Máximo 2-3 párrafos cortos por respuesta.

CAPACIDADES:
- Responder preguntas, traducir, calcular, recetas, redactar textos, explicar cosas, conversar.
- Si piden enviar WhatsApp, recordatorios avanzados o control de gastos, menciona que pueden activarlo en la tienda de skills.

REGLA: No inventes datos. Si no sabes, dilo.`;

  const client = new Anthropic({ apiKey });

  const stream = await client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error";
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
