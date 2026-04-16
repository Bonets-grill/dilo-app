import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const GRADE_SYSTEMS: Record<string, string[]> = {
  ES: ["1° Primaria","2° Primaria","3° Primaria","4° Primaria","5° Primaria","6° Primaria","1° ESO","2° ESO","3° ESO","4° ESO","1° Bachillerato","2° Bachillerato"],
  MX: ["1° Primaria","2° Primaria","3° Primaria","4° Primaria","5° Primaria","6° Primaria","1° Secundaria","2° Secundaria","3° Secundaria","1° Preparatoria","2° Preparatoria","3° Preparatoria"],
  CO: ["1° Primaria","2° Primaria","3° Primaria","4° Primaria","5° Primaria","6°","7°","8°","9°","10°","11°"],
  US: ["1st Grade","2nd Grade","3rd Grade","4th Grade","5th Grade","6th Grade","7th Grade","8th Grade","9th Grade","10th Grade","11th Grade","12th Grade"],
  FR: ["CP","CE1","CE2","CM1","CM2","6ème","5ème","4ème","3ème","2nde","1ère","Terminale"],
  IT: ["1ª Primaria","2ª Primaria","3ª Primaria","4ª Primaria","5ª Primaria","1ª Media","2ª Media","3ª Media","1° Superiore","2° Superiore","3° Superiore","4° Superiore","5° Superiore"],
  DE: ["1. Klasse","2. Klasse","3. Klasse","4. Klasse","5. Klasse","6. Klasse","7. Klasse","8. Klasse","9. Klasse","10. Klasse","11. Klasse","12. Klasse","13. Klasse"],
};

// Cache simple en memoria (region+grade → subjects)
const cache = new Map<string, { subjects: string[]; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * GET /api/curriculum/subjects?region=ES&grade=2° ESO
 * POST /api/curriculum/subjects { region, grade }
 *
 * Devuelve los grados disponibles para esa región + las asignaturas
 * para ese grado. Usa GPT para generar las asignaturas si no están
 * cacheadas (basándose en el currículo oficial de cada país).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const region = url.searchParams.get("region") || "ES";
  const grade = url.searchParams.get("grade") || "";

  const grades = GRADE_SYSTEMS[region] || GRADE_SYSTEMS.ES;

  if (!grade) {
    return NextResponse.json({ region, grades });
  }

  // Check cache
  const key = `${region}:${grade}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ region, grade, grades, subjects: cached.subjects });
  }

  // Ask GPT for subjects
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: "Eres experto en currículos escolares internacionales. Devuelve SOLO un JSON array de strings con los nombres de las asignaturas oficiales. Sin explicaciones, solo el array.",
        },
        {
          role: "user",
          content: `Lista las asignaturas oficiales del grado "${grade}" en ${regionName(region)} según el currículo vigente. Solo nombres, en español. JSON array.`,
        },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    const subjects: string[] = match ? JSON.parse(match[0]) : [];

    if (subjects.length > 0) {
      cache.set(key, { subjects, ts: Date.now() });
    }

    return NextResponse.json({ region, grade, grades, subjects });
  } catch {
    return NextResponse.json({ region, grade, grades, subjects: defaultSubjects() });
  }
}

function regionName(code: string): string {
  const map: Record<string, string> = {
    ES: "España (LOMLOE)", MX: "México (SEP)", CO: "Colombia (MEN)",
    US: "Estados Unidos", FR: "Francia", IT: "Italia", DE: "Alemania",
  };
  return map[code] || code;
}

function defaultSubjects(): string[] {
  return ["Matemáticas", "Lengua", "Ciencias Naturales", "Ciencias Sociales", "Inglés", "Educación Física", "Arte"];
}

export const dynamic = "force-dynamic";
