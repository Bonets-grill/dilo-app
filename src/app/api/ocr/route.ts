import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * POST /api/ocr — Extract text from an image using GPT-4o-mini vision
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
              text: "Extract ALL text from this image. Return only the text, preserve the layout as much as possible. If there are numbers, prices, dates, or any important data, include them. If there's no readable text, say 'No text found'.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "No text found";
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[OCR] Error:", err);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
