import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * POST /api/tts
 * Body: { text: string }
 *
 * Convierte texto a voz con OpenAI TTS (tts-1, voz "nova" — cálida y
 * pedagógica). Devuelve audio/mpeg directamente para <audio> playback.
 * ~$0.015 por 1000 chars.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text } = await req.json().catch(() => ({}));
  if (!text) return NextResponse.json({ error: "missing text" }, { status: 400 });

  // Strip LaTeX and markdown for cleaner speech
  const clean = String(text)
    .replace(/\$\$[\s\S]+?\$\$/g, " ecuación ")
    .replace(/\$[^$]+\$/g, " expresión ")
    .replace(/\\begin\{[\s\S]+?\\end\{[^}]+\}/g, " sistema de ecuaciones ")
    .replace(/\\\([\s\S]+?\\\)/g, " expresión ")
    .replace(/\\\[[\s\S]+?\\\]/g, " ecuación ")
    .replace(/\*\*/g, "")
    .replace(/\n+/g, ". ")
    .slice(0, 4000);

  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: clean,
      speed: 1.0,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "tts_failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
