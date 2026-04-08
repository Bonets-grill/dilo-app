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

  const systemPrompt = `Eres DILO, un asistente personal inteligente por chat.

REGLAS IMPORTANTES:
- SIEMPRE responde en ${langName}. El usuario habla ${langName}.
- Sé conciso y útil. Respuestas cortas y directas.
- Usa formato Markdown cuando sea útil (listas, negritas).
- Si el usuario te pide enviar un mensaje por WhatsApp, recordatorios avanzados, controlar gastos, u otras funciones premium, dile que necesita activar el skill correspondiente en la tienda.
- Puedes ayudar con: preguntas generales, traducciones básicas, cálculos, recetas, consejos, redacción de textos, explicaciones, y conversación general.
- Sé amigable pero profesional. Tutea al usuario.
- NO inventes información que no sepas. Si no sabes algo, dilo.`;

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
