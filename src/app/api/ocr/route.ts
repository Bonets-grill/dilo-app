import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Max payload we're willing to forward to OpenAI vision. iPhones send 4-8 MB
// base64; OpenAI's practical cap is ~20 MB but larger = slower + higher failure
// rate. If the caller sends bigger, we log and degrade to detail:"low".
const MAX_BASE64_CHARS = 4_000_000; // ~3 MB

/**
 * POST /api/ocr — Analyze an image: read text, describe content, extract data
 * Body: { imageUrl: string (base64 data URL or https URL) }
 */
export async function POST(req: NextRequest) {
  const { imageUrl } = await req.json();
  if (!imageUrl) return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });

  const isBase64 = imageUrl.startsWith("data:");
  const size = imageUrl.length;
  const detail: "low" | "high" | "auto" = isBase64 && size > MAX_BASE64_CHARS ? "low" : "auto";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analiza esta imagen de forma completa y útil. Sigue estas reglas:

1. Si hay TEXTO visible (documento, recibo, captura de pantalla, cartel, menú): extrae TODO el texto de forma legible.
2. Si hay NÚMEROS o PRECIOS: destácalos claramente.
3. Si es un RECIBO o FACTURA: extrae el total, la tienda, la fecha, y los items.
4. Si es una CAPTURA DE PANTALLA: describe qué app es y qué muestra.
5. Si es una FOTO de algo (persona, lugar, objeto): describe qué se ve.
6. Si hay un PROBLEMA visible (error, avería, manchas): señálalo.

Responde en español. Sé conciso pero completo. Si hay texto, prioriza extraerlo.`,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl, detail },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "No pude analizar la imagen.";
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface a human message; include the provider error so failures are
    // diagnosable from a screenshot instead of "Analysis failed".
    console.error("[OCR] size:", size, "detail:", detail, "error:", msg);
    return NextResponse.json(
      {
        error: "No pude analizar la imagen.",
        detail: msg.slice(0, 200),
        size,
        mode: detail,
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
