import OpenAI from "openai";
import { zodiacInfoBySign, type ZodiacSign } from "@/lib/zodiac";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface HoroscopeInput {
  userId: string;
  userName: string | null;
  zodiac: ZodiacSign;
  facts: Array<{ fact: string; category: string }>;
  forDate: string; // YYYY-MM-DD
}

export interface HoroscopeOutput {
  text: string;                // markdown completo
  meta: {
    luckyColor?: string;
    luckyNumber?: number;
    compatibility?: string[];
    moonPhase?: string;
    tarot?: string;
  };
  audioBase64: string | null;  // data:audio/mpeg;base64,...
}

/** Genera el texto Markdown del horóscopo del día con GPT-4o-mini */
async function generateText(input: HoroscopeInput): Promise<{ text: string; meta: HoroscopeOutput["meta"] }> {
  const info = zodiacInfoBySign(input.zodiac);
  const name = info?.name || input.zodiac;
  const emoji = info?.emoji || "✨";

  const factsBlock = input.facts.length > 0
    ? input.facts.slice(0, 8).map((f) => `- [${f.category}] ${f.fact}`).join("\n")
    : "(sin contexto adicional del usuario)";

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.8,
    max_tokens: 700,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres un astrólogo cálido y motivador. Generas un horóscopo diario personalizado en español para un usuario. " +
          "Incluyes: una carta del tarot inventada (nombre + emoji), una lectura de ~3 párrafos cortos conectada con el contexto del usuario (facts), " +
          "una semilla de motivación concreta y accionable, y datos: color de suerte, número sagrado, compatibilidad (dos signos), fase lunar. " +
          "NUNCA prometas eventos concretos (ganarás X, conocerás a Y). Tono cálido, breve, optimista, sin palabras como 'garantizado', 'dominarás'. " +
          "Devuelve JSON con campos: text (markdown completo con emojis y negritas) y meta: { luckyColor, luckyNumber (int), compatibility (array de 2 strings), moonPhase, tarot }.",
      },
      {
        role: "user",
        content:
          `Signo: ${emoji} ${name}\n` +
          `Nombre del usuario: ${name}\n`.replace(name, input.userName || "usuario") +
          `Fecha: ${input.forDate}\n\n` +
          `Contexto del usuario (facts que conoces):\n${factsBlock}\n\n` +
          "Genera el horóscopo personalizado para HOY en ese formato JSON.",
      },
    ],
  });

  const raw = resp.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  const text = typeof parsed.text === "string" ? parsed.text : "";
  const meta: HoroscopeOutput["meta"] = {};
  if (parsed.meta && typeof parsed.meta === "object") {
    if (typeof parsed.meta.luckyColor === "string") meta.luckyColor = parsed.meta.luckyColor;
    if (typeof parsed.meta.luckyNumber === "number") meta.luckyNumber = parsed.meta.luckyNumber;
    if (Array.isArray(parsed.meta.compatibility)) meta.compatibility = parsed.meta.compatibility.filter((x: unknown): x is string => typeof x === "string").slice(0, 3);
    if (typeof parsed.meta.moonPhase === "string") meta.moonPhase = parsed.meta.moonPhase;
    if (typeof parsed.meta.tarot === "string") meta.tarot = parsed.meta.tarot;
  }
  return { text, meta };
}

/** Convierte texto a voz con OpenAI TTS. Devuelve data URL audio/mpeg. */
async function generateAudio(text: string): Promise<string | null> {
  // Limitamos el texto al núcleo motivacional (los primeros 600 chars)
  // para mantener el audio bajo 30-40s y el coste manejable.
  const spoken = text
    .replace(/[#*_`>]/g, "")          // quitar markdown
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
  try {
    const res = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "nova",
      input: spoken,
      instructions: "Voz femenina cálida, ritmo pausado, tono inspirador y optimista, como un mensaje de motivación matutino.",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:audio/mpeg;base64,${buf.toString("base64")}`;
  } catch (err) {
    console.warn("[horoscope] TTS failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function generateHoroscope(input: HoroscopeInput): Promise<HoroscopeOutput> {
  const { text, meta } = await generateText(input);
  const audioBase64 = text ? await generateAudio(text) : null;
  return { text, meta, audioBase64 };
}
