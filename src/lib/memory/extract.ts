import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type MemoryCategory =
  | "identity"
  | "preferences"
  | "goals"
  | "relationships"
  | "health"
  | "finance"
  | "work"
  | "location"
  | "interests"
  | "routines";

export interface ExtractedFact {
  fact: string;
  category: MemoryCategory;
  confidence: number; // 0..1
}

const EXTRACTION_PROMPT = `Eres un extractor de hechos personales para un asistente de IA que recuerda información del usuario entre sesiones.

Tu trabajo: dado un par de mensajes (usuario + respuesta del asistente), identifica HECHOS ATÓMICOS y PERSISTENTES del usuario que merezcan ser recordados.

QUÉ ES UN HECHO VÁLIDO:
- Algo que define al usuario a largo plazo (dónde vive, qué trabajo tiene, qué le gusta, qué objetivos tiene, cumpleaños, relaciones, salud, rutinas).
- Preferencias claras ("me gusta X", "odio Y", "prefiero Z").
- Planes concretos con fecha ("me mudo en junio a Madrid").

QUÉ NO ES UN HECHO:
- Saludos, cortesías, preguntas puntuales.
- Detalles efímeros de una tarea ("ahora mismo estoy haciendo X").
- Opiniones del asistente, no del usuario.

CATEGORÍAS (elige la más precisa):
- identity: nombre, edad, idioma, género, personalidad
- location: dónde vive, países visitados recientemente
- work: profesión, empresa, autónomo, industria
- finance: ingresos, estado fiscal (IRPF, autónomo, pymes), método de pago
- health: condiciones médicas, alergias, dieta, ejercicio
- relationships: familia, pareja, hijos, mascotas, amigos cercanos
- preferences: cosas que le gustan / no le gustan
- goals: objetivos de corto/medio/largo plazo
- routines: horarios, hábitos recurrentes
- interests: aficiones, temas que le apasionan

CONFIDENCE: 1.0 si el usuario lo afirma directo; 0.7 si se infiere con seguridad; 0.5 si es ambiguo; <0.5 no lo incluyas.

SALIDA: JSON { "facts": [ { "fact": "Mario vive en Tenerife", "category": "location", "confidence": 1.0 } ] }
Si no hay hechos nuevos, devuelve { "facts": [] }.
Redacta cada fact en TERCERA PERSONA usando el nombre si se conoce (si no, "el usuario"). Máx 20 palabras. Sin emojis.`;

export async function extractFacts(
  userMessage: string,
  assistantReply: string,
  userName?: string
): Promise<ExtractedFact[]> {
  const context = `${userName ? `Nombre del usuario: ${userName}\n\n` : ""}Usuario: ${userMessage}\n\nAsistente: ${assistantReply}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 400,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: context },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(raw) as { facts?: ExtractedFact[] };
    if (!Array.isArray(parsed.facts)) return [];
    return parsed.facts
      .filter(
        (f): f is ExtractedFact =>
          typeof f?.fact === "string" &&
          f.fact.length > 2 &&
          f.fact.length < 200 &&
          typeof f?.category === "string" &&
          typeof f?.confidence === "number" &&
          f.confidence >= 0.5
      )
      .slice(0, 10);
  } catch {
    return [];
  }
}
