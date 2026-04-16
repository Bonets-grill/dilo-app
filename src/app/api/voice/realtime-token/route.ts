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
    const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-realtime-preview-2024-12-17",
        voice: "alloy",
        instructions:
          "Eres DILO, un asistente personal cálido y directo. Habla natural, tuteando al usuario. Respuestas cortas en voz — el usuario está hablando, no leyendo. Si necesitas más de 2 frases, divídelo en turnos.",
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
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
