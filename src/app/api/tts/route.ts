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

  // Convertir LaTeX a texto hablado real (no "expresión")
  const clean = String(text)
    // Block math: $$...$$ y \[...\] — extraer y convertir
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => ` ${latexToSpeech(m)} `)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => ` ${latexToSpeech(m)} `)
    // \begin{cases}...\end{cases} — leer como sistema
    .replace(/\\begin\{cases\}([\s\S]+?)\\end\{cases\}/g, (_, m) => {
      const lines = m.split("\\\\").map((l: string) => latexToSpeech(l.replace(/&/g, "")));
      return ` el sistema: ${lines.join(", y ")} `;
    })
    .replace(/\\begin\{[\s\S]+?\\end\{[^}]+\}/g, (_, m) => ` ${latexToSpeech(m || "")} `)
    // Inline: \(...\) y $...$
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => ` ${latexToSpeech(m)} `)
    .replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, m) => ` ${latexToSpeech(m)} `)
    .replace(/\*\*/g, "")
    .replace(/\n+/g, ". ")
    .replace(/\s{2,}/g, " ")
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

/**
 * Convierte LaTeX a texto natural para hablar.
 * No perfecto pero mucho mejor que "expresión".
 */
function latexToSpeech(tex: string): string {
  return tex
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 sobre $2")
    .replace(/\\sqrt\{([^}]+)\}/g, "raíz de $1")
    .replace(/\\sqrt\[(\d+)\]\{([^}]+)\}/g, "raíz $1 de $2")
    .replace(/\\cdot/g, " por ")
    .replace(/\\times/g, " por ")
    .replace(/\\div/g, " entre ")
    .replace(/\\pm/g, " más menos ")
    .replace(/\\mp/g, " menos más ")
    .replace(/\\leq?/g, " menor o igual que ")
    .replace(/\\geq?/g, " mayor o igual que ")
    .replace(/\\neq/g, " distinto de ")
    .replace(/\\approx/g, " aproximadamente ")
    .replace(/\\infty/g, " infinito ")
    .replace(/\\pi/g, " pi ")
    .replace(/\\alpha/g, " alfa ")
    .replace(/\\beta/g, " beta ")
    .replace(/\\theta/g, " theta ")
    .replace(/\\Delta/g, " delta ")
    .replace(/\\sum/g, " la suma de ")
    .replace(/\\int/g, " la integral de ")
    .replace(/\\left|\\right/g, "")
    .replace(/\\[a-zA-Z]+/g, " ")   // otros comandos LaTeX → espacio
    .replace(/\{|\}/g, "")           // llaves
    .replace(/\^(\w)/g, " elevado a $1 ")
    .replace(/\^{([^}]+)}/g, " elevado a $1 ")
    .replace(/_(\w)/g, " sub $1 ")
    .replace(/_{([^}]+)}/g, " sub $1 ")
    .replace(/=/g, " igual a ")
    .replace(/\+/g, " más ")
    .replace(/-/g, " menos ")
    .replace(/\*/g, " por ")
    .replace(/\//g, " entre ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
