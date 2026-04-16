import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { routeToExperts } from "@/lib/experts/router";
import { limitLLM, rateLimitResponse } from "@/lib/rate-limit";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * POST /api/chat/suggest
 * Body: { userId: string, messages: Message[] }
 *
 * Returns 3 short "next prompt" suggestions the user could send to DILO,
 * based on the recent chat context. When the conversation is empty, returns
 * ice-breaker examples that showcase DILO's real capabilities.
 */
export async function POST(req: NextRequest) {
  const { userId, messages } = (await req.json()) as {
    userId?: string;
    messages?: Message[];
  };

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const rl = await limitLLM(userId);
  if (!rl.ok) return rateLimitResponse(rl);

  // Empty-state: hand-crafted examples covering DILO's main verticals
  if (!messages || messages.length === 0) {
    return NextResponse.json({
      suggestions: [
        "Apúntame un gasto de 45€ en gasolina",
        "¿Cuáles son las gasolineras más baratas cerca?",
        "Ayúdame a decidir si acepto una oferta de trabajo",
      ],
      expert_used: null,
    });
  }

  // Find the most recent assistant turn — that's the opening we want to build on
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  let expertBlock = "";
  if (lastAssistant && lastAssistant.content.length > 15) {
    try {
      const matches = await routeToExperts(lastAssistant.content, { topK: 1, minScore: 0.35 });
      if (matches[0]?.expert) {
        const e = matches[0].expert;
        const prompt = (e.system_prompt || "").slice(0, 1500);
        expertBlock = `\n\n[Área detectada — ${e.name}]\n${prompt}`;
      }
    } catch (err) {
      console.error("[chat/suggest] router non-fatal:", err);
    }
  }

  const contextLines = messages
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Usuario" : "DILO"}: ${m.content}`)
    .join("\n");

  const system = `Eres DILO. Mira la conversación y sugiere 3 próximas peticiones útiles que el usuario podría hacerte, en PRIMERA PERSONA del usuario. Cortas (máx 12 palabras cada una), variadas, prácticas. Aprovecha el contexto. Sin repetir lo ya pedido.${expertBlock}

FORMATO (SOLO JSON VÁLIDO, sin markdown):
{"suggestions":["petición 1","petición 2","petición 3"]}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Conversación:\n${contextLines}\n\nGenera 3 sugerencias.` },
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
