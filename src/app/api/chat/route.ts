import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing messages", { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // If no real API key, return mock streaming response for development
  if (!apiKey || apiKey === "placeholder") {
    const lastMessage = messages[messages.length - 1]?.content || "";
    const mockResponse = getMockResponse(lastMessage);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const char of mockResponse) {
          controller.enqueue(encoder.encode(char));
          await new Promise((r) => setTimeout(r, 15));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Real Claude API with streaming
  const client = new Anthropic({ apiKey });

  const stream = await client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: "You are DILO, a personal AI assistant. Be helpful, concise, and friendly. Respond in the same language the user writes in.",
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function getMockResponse(input: string): string {
  const lower = input.toLowerCase();

  if (lower.includes("hola") || lower.includes("hello") || lower.includes("bonjour"))
    return "¡Hola! Soy DILO, tu asistente personal. ¿En qué puedo ayudarte hoy? Puedo enviar mensajes por WhatsApp, crear recordatorios, controlar tus gastos y mucho más.";

  if (lower.includes("whatsapp") || lower.includes("mensaje") || lower.includes("send"))
    return "Para enviar mensajes por WhatsApp necesitas el skill **Mensajería WhatsApp** (€1.99/mes). Con él puedo:\n\n→ Enviar mensajes a tus contactos por ti\n→ Leer y resumir tus chats\n→ Programar mensajes\n→ Auto-responder cuando no estés\n\n[Ver en tienda →](/store)";

  if (lower.includes("recordar") || lower.includes("remind"))
    return "Para recordatorios avanzados (múltiples alertas, recurrentes, por WhatsApp) necesitas el skill **Recordatorios Pro** (€0.99/mes).\n\nComo recordatorio básico gratuito: anotado. Te recordaré la próxima vez que abras la app.";

  if (lower.includes("gast") || lower.includes("spent") || lower.includes("expense"))
    return "Para controlar tus gastos necesitas el skill **Finanzas Personales** (€1.49/mes). Con él puedo registrar gastos por voz, ver resúmenes por categoría, establecer presupuestos y dividir cuentas.\n\n[Ver en tienda →](/store)";

  return "Entendido. ¿Hay algo más en lo que pueda ayudarte? Recuerda que puedo hacer mucho más con los skills de la tienda — traducciones, recetas, viajes, y más.";
}
