import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * POST /api/study/upload-material
 * Body: { sessionId, imageBase64 }
 *
 * El hijo sube foto de libro/tarea/apuntes. Se analiza con GPT-4o-mini
 * vision para extraer el contenido + generar un resumen corto.
 * Devuelve el texto y resumen para que la UI lo muestre y lo pase al chat.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { sessionId, imageBase64 } = await req.json().catch(() => ({}));
  if (!sessionId || !imageBase64) {
    return NextResponse.json({ error: "sessionId and imageBase64 required" }, { status: 400 });
  }

  // Verificar que la sesión pertenece al usuario y está abierta
  const { data: session } = await admin
    .from("study_sessions")
    .select("id, subject")
    .eq("id", sessionId)
    .eq("user_id", auth.user.id)
    .is("ended_at", null)
    .single();

  if (!session) {
    return NextResponse.json({ error: "session_not_found_or_closed" }, { status: 404 });
  }

  try {
    // GPT-4o-mini vision — extrae contenido + resume para padre
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: `Eres un tutor que analiza material escolar. El alumno estudia: ${session.subject}.

Responde con DOS secciones exactas:

**CONTENIDO:**
(Transcribe fielmente todo el texto visible en la imagen — enunciados, ejercicios, definiciones, todo lo que se pueda leer)

**RESUMEN:**
(1-2 frases para el reporte al padre: qué tema es, qué tipo de material — ej: "Ejercicios de ecuaciones de segundo grado, página de libro de texto")`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analiza este material de estudio:" },
            { type: "image_url", image_url: { url: imageBase64, detail: "high" } },
          ],
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content || "";
    const contentMatch = raw.match(/\*\*CONTENIDO:\*\*\s*([\s\S]*?)(?:\*\*RESUMEN:|$)/i);
    const summaryMatch = raw.match(/\*\*RESUMEN:\*\*\s*([\s\S]*)/i);
    const ocrText = contentMatch?.[1]?.trim() || raw;
    const summary = summaryMatch?.[1]?.trim() || ocrText.slice(0, 120);

    // Guardar material
    const { data: mat, error } = await admin
      .from("study_materials")
      .insert({
        session_id: sessionId,
        user_id: auth.user.id,
        ocr_text: ocrText.slice(0, 8000),
        summary: summary.slice(0, 300),
      })
      .select("id, ocr_text, summary, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      material: mat,
      study_context: ocrText,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "analysis_failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
