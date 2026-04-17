import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const admin = getServiceRoleClient();

/**
 * POST /api/image-edit
 * Body: { imageBase64: string (data:image/...;base64,...), prompt: string, conversationId?: string }
 *
 * Usa OpenAI gpt-image-1 edit — preserva identidad (cara, pelo, ropa general)
 * y modifica solo lo que el prompt describe. Equivale a lo que hace ChatGPT
 * cuando adjuntas una foto y le pides "sin cambiar X, modifica Y".
 *
 * Coste aprox: ~$0.19 por edición 1024x1024 quality medium.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { imageBase64, prompt, conversationId } = await req.json().catch(() => ({}));
  if (!imageBase64 || !prompt) {
    return NextResponse.json({ error: "imageBase64 and prompt required" }, { status: 400 });
  }

  // Extraer los bytes del data URL
  const match = String(imageBase64).match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: "invalid_image_base64" }, { status: 400 });
  }
  const ext = match[1];
  const bytes = Buffer.from(match[2], "base64");

  try {
    const file = await toFile(bytes, `input.${ext}`, { type: `image/${ext}` });

    const resp = await openai.images.edit({
      model: "gpt-image-1",
      image: file,
      prompt: String(prompt).slice(0, 1000),
      n: 1,
      size: "1024x1024",
      // quality "medium" es el equilibrio calidad/coste — ChatGPT usa algo similar
      quality: "medium",
    });

    const b64 = resp.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "no_output" }, { status: 500 });
    }
    const dataUrl = `data:image/png;base64,${b64}`;

    // Persistir como mensaje del asistente si hay conversación
    if (conversationId) {
      try {
        await admin.from("messages").insert({
          conversation_id: conversationId,
          user_id: auth.user.id,
          role: "assistant",
          content: `__IMAGE__${dataUrl}`,
          model: "gpt-image-1-edit",
        });
      } catch { /* best-effort */ }
    }

    return NextResponse.json({ image_url: dataUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "edit_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
