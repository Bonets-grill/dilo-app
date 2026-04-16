import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DISCOVER_PROMPT = `Eres un creador de "expertos" especializados para un asistente personal (DILO). Dado un mensaje del usuario donde pregunta sobre un dominio que no conocemos, genera un experto de ese dominio.

Reglas:
- El experto debe ser un NICHO ESPECÍFICO, no genérico. Ej: si el user pregunta sobre "cómo vender en Wallapop", el experto es "Wallapop Seller Expert", NO "Marketing General".
- El system_prompt debe ser útil y aterrizado al dominio: contexto del nicho, metodologías típicas, qué información suele faltar.
- Nada de "soy una IA". El experto habla en primera persona como profesional del área.
- Máximo 1500 caracteres en system_prompt.

Formato SOLO JSON:
{
  "slug": "wallapop-seller-expert",
  "name": "Wallapop Seller Expert",
  "description": "Ayuda a vender rápido en Wallapop: fotografía, precios, descripciones, respuestas a compradores, logística y seguridad.",
  "category": "marketing",
  "emoji": "🛒",
  "system_prompt": "Eres un vendedor experimentado en Wallapop..."
}

Categorías válidas: marketing, finance, legal, health, tech, education, home, travel, food, sports, creative, relationships, work, fitness, misc`;

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    dimensions: 1024,
  });
  const vec = res.data[0].embedding;
  let sq = 0;
  for (const v of vec) sq += v * v;
  const norm = Math.sqrt(sq) || 1;
  return vec.map((v) => v / norm);
}

export interface DynamicExpert {
  slug: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  system_prompt: string;
}

/**
 * Try to find an already-discovered dynamic expert that matches the query.
 * Returns null if none is close enough.
 */
export async function findDynamicExpert(userMessage: string): Promise<DynamicExpert | null> {
  try {
    const queryEmbedding = await embed(userMessage);
    const { data } = await supabase.rpc("retrieve_dynamic_experts", {
      p_query_embedding: queryEmbedding,
      p_limit: 1,
      p_min_similarity: 0.45,
    });
    if (data && Array.isArray(data) && data.length > 0) {
      const row = data[0];
      // Bump usage count (fire-and-forget)
      supabase
        .from("dynamic_experts")
        .update({ usage_count: (row.usage_count || 0) + 1 })
        .eq("slug", row.slug)
        .then(() => {});
      return {
        slug: row.slug,
        name: row.name,
        description: row.description,
        category: row.category,
        emoji: row.emoji,
        system_prompt: row.system_prompt,
      };
    }
  } catch (e) {
    console.error("[discover] retrieve failed:", e);
  }
  return null;
}

/**
 * Generate + persist a new expert for this query. Only call when BOTH the
 * pre-loaded expert router AND findDynamicExpert() came up empty.
 * Returns the new expert, or null on failure (chat continues without it).
 */
export async function discoverExpert(
  userMessage: string,
  userId: string | null
): Promise<DynamicExpert | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DISCOVER_PROMPT },
        { role: "user", content: `Mensaje del usuario:\n${userMessage}\n\nGenera el experto adecuado.` },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as Partial<DynamicExpert>;

    if (
      !parsed.slug ||
      !parsed.name ||
      !parsed.description ||
      !parsed.category ||
      !parsed.system_prompt
    ) return null;

    const expert: DynamicExpert = {
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description,
      category: parsed.category,
      emoji: parsed.emoji || "🧠",
      system_prompt: parsed.system_prompt.slice(0, 1500),
    };

    // Embed the expert description for future retrieval
    const embedding = await embed(`${expert.name} — ${expert.description} — category: ${expert.category}`);

    // Upsert (avoids race if two users ask the same thing at once)
    const { data } = await supabase
      .from("dynamic_experts")
      .upsert(
        {
          slug: expert.slug,
          name: expert.name,
          description: expert.description,
          category: expert.category,
          emoji: expert.emoji,
          system_prompt: expert.system_prompt,
          embedding,
          created_by: userId,
          usage_count: 1,
        },
        { onConflict: "slug" }
      )
      .select("slug, name, description, category, emoji, system_prompt")
      .single();

    if (data) return data as DynamicExpert;
    return expert;
  } catch (e) {
    console.error("[discover] generate failed:", e);
    return null;
  }
}

/** Build the context block to inject into the chat's system prompt. */
export function dynamicExpertBlock(expert: DynamicExpert): string {
  return `\n\n## Expert context — consulting: ${expert.emoji} ${expert.name}\n_${expert.description}_\n\nUse the following expert knowledge to ground your answer. Keep DILO's warm, direct tone.\n\n${expert.system_prompt}`;
}
