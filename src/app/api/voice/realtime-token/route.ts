import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/voice/realtime-token
 * Body: { userId }
 *
 * Creates an ephemeral session token for OpenAI's Realtime API. The client
 * uses this token to connect directly via WebRTC — the token lasts 1 minute
 * so the main OPENAI_API_KEY never leaves the server.
 *
 * Docs: https://platform.openai.com/docs/guides/realtime
 */
export async function POST(req: NextRequest) {
  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  try {
    // Tools the Realtime model can call. Format is the flat "function"
    // shape used by Realtime API (NOT the nested one from chat completions).
    const now = new Date();
    const tz = "Europe/Madrid";
    const tools = [
      {
        type: "function",
        name: "create_reminder",
        description: "Crea un recordatorio. ÚSALO SIEMPRE cuando el usuario pida 'recuérdame', 'agéndame', 'apúntame', o similar. El tiempo se parsea del lenguaje natural ('mañana a las 10', 'en 5 minutos', 'el jueves').",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Qué recordar, en primera persona del usuario" },
            due_at: { type: "string", description: `Fecha-hora ISO 8601 con timezone. Hora actual: ${now.toISOString()} (${tz}). Convierte relativas a absolutas.` },
          },
          required: ["text", "due_at"],
        },
      },
      {
        type: "function",
        name: "list_reminders",
        description: "Lista los recordatorios pendientes del usuario.",
        parameters: { type: "object", properties: {} },
      },
      {
        type: "function",
        name: "cancel_reminder",
        description: "Cancela un recordatorio pendiente que coincida por texto.",
        parameters: {
          type: "object",
          properties: {
            text_match: { type: "string", description: "Palabras del recordatorio a buscar" },
          },
          required: ["text_match"],
        },
      },
      {
        type: "function",
        name: "create_expense",
        description: "Registra un gasto. Usa cuando el usuario diga 'apunta X gasté Y', 'gasté X en Y'.",
        parameters: {
          type: "object",
          properties: {
            amount: { type: "number", description: "Cantidad en EUR" },
            description: { type: "string", description: "Qué fue el gasto" },
            category: { type: "string", enum: ["comida", "transporte", "ocio", "hogar", "salud", "suscripciones", "otros"] },
          },
          required: ["amount", "description"],
        },
      },
      {
        type: "function",
        name: "list_expenses",
        description: "Consulta gastos del usuario de un periodo.",
        parameters: {
          type: "object",
          properties: {
            period: { type: "string", enum: ["today", "week", "month"] },
          },
        },
      },
    ];

    const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-realtime-preview-2024-12-17",
        voice: "alloy",
        instructions: `Eres DILO, un asistente personal cálido y directo. Habla natural, tuteando al usuario. Respuestas cortas en voz — el usuario está hablando, no leyendo.

REGLA DURA: si el usuario pide un recordatorio, gasto o similar, USA la tool correspondiente ANTES de confirmar verbalmente. Jamás digas "lo apunto" sin llamar la función. Si la función devuelve error, avísale al usuario.

HORA ACTUAL: ${now.toISOString()} (${tz}). Cuando el usuario diga hora relativa ("mañana", "en 5 min", "a las 10"), conviértela a ISO 8601 absoluta.`,
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
        tools,
        tool_choice: "auto",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[realtime-token] openai error:", err);
      return NextResponse.json({ error: "Realtime session creation failed", detail: err.slice(0, 300) }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({
      client_secret: data.client_secret?.value,
      expires_at: data.client_secret?.expires_at,
      model: data.model,
      session_id: data.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
