import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { routeToExperts } from "@/lib/experts/router";
import { limitLLM, rateLimitResponse } from "@/lib/rate-limit";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface Message {
  role: "me" | "them";
  content: string;
}

/**
 * POST /api/dm/suggest
 * Body: { userId: string, messages: Message[], contactName?: string }
 *
 * Returns 3 short reply suggestions, grounded in the most relevant expert's
 * system prompt when the conversation topic matches one strongly.
 */
export async function POST(req: NextRequest) {
  const { userId, messages, contactName } = (await req.json()) as {
    userId?: string;
    messages?: Message[];
    contactName?: string;
  };

  if (!userId || !messages?.length) {
    return NextResponse.json({ error: "Missing userId or messages" }, { status: 400 });
  }

  const rl = await limitLLM(userId);
  if (!rl.ok) return rateLimitResponse(rl);

  // Focus the expert router on what the other person said last — that's the
  // signal for what topic we're actually in.
  const lastThem = [...messages].reverse().find((m) => m.role === "them");
  let expertBlock = "";
  if (lastThem && lastThem.content.length > 10) {
    try {
      const matches = await routeToExperts(lastThem.content, { topK: 1, minScore: 0.35 });
      if (matches[0]?.expert) {
        const e = matches[0].expert;
        const prompt = (e.system_prompt || "").slice(0, 2000);
        expertBlock = `\n\n[Contexto de experto — ${e.name}]\n${prompt}`;
      }
    } catch (err) {
      console.error("[dm/suggest] router non-fatal:", err);
    }
  }

  const contextLines = messages
    .slice(-10)
    .map((m) => `${m.role === "me" ? "Yo" : contactName || "Otro"}: ${m.content}`)
    .join("\n");

  const system = `Eres DILO, sugiriendo respuestas para un chat entre dos personas. Genera exactamente 3 respuestas cortas, naturales, en el idioma del hilo, desde el punto de vista del usuario "Yo". Variarlas en tono: (1) directa y práctica, (2) cálida y empática, (3) creativa o con un giro. Máximo 20 palabras cada una. Sin emojis excesivos. No repitas el texto del interlocutor.${expertBlock}

FORMATO DE RESPUESTA (SOLO JSON VÁLIDO, sin markdown):
{"suggestions":["r1","r2","r3"]}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 250,
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Últimos mensajes del hilo:\n${contextLines}\n\nGenera 3 respuestas.` },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let suggestions: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.suggestions)) suggestions = parsed.suggestions.slice(0, 3);
  } catch {
    suggestions = [];
  }

  return NextResponse.json({
    suggestions,
    expert_used: expertBlock ? expertBlock.match(/— ([^\n]+)/)?.[1] || null : null,
  });
}
