import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * POST /api/ocr — Analyze an image: read text, describe content, extract data
 * Body: { imageUrl: string (base64 data URL or https URL) }
 */
export async function POST(req: NextRequest) {
  const { imageUrl } = await req.json();
  if (!imageUrl) return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1000,
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
              image_url: { url: imageUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "No pude analizar la imagen.";
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[OCR] Error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
