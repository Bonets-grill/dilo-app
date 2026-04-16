import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EMBEDDING_MODEL = "text-embedding-3-small";
const DIMS = 1024;

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: DIMS,
  });
  const vec = res.data[0].embedding;
  let sq = 0;
  for (const v of vec) sq += v * v;
  const norm = Math.sqrt(sq) || 1;
  return vec.map((v) => v / norm);
}

export interface RetrievedFact {
  id: string;
  fact: string;
  category: string;
  confidence: number;
  similarity: number;
}

export interface RetrieveOptions {
  userId: string;
  query: string;
  limit?: number;
  minSimilarity?: number;
}

/**
 * Returns the top-K memory facts most relevant to the query. Also always
 * includes core identity/location facts if they exist, so the assistant never
 * forgets who the user is even if the current turn is topic-specific.
 */
export async function retrieveMemory({
  userId,
  query,
  limit = 8,
  minSimilarity = 0.35,
}: RetrieveOptions): Promise<RetrievedFact[]> {
  if (!query || query.length < 3) {
    // Still want to return identity/location so the system prompt has the basics
    const { data } = await supabase
      .from("memory_facts")
      .select("id, fact, category, confidence")
      .eq("user_id", userId)
      .is("valid_to", null)
      .in("category", ["identity", "location", "work"])
      .order("confidence", { ascending: false })
      .limit(limit);
    return (data || []).map((d) => ({ ...d, similarity: 1 }));
  }

  const queryEmbedding = await embed(query);

  const { data: semantic } = await supabase.rpc("retrieve_memory_facts", {
    p_user_id: userId,
    p_query_embedding: queryEmbedding,
    p_limit: limit,
    p_min_similarity: minSimilarity,
  });

  const semanticIds = new Set<string>((semantic || []).map((d: { id: string }) => d.id));

  // Always pin identity + location facts regardless of similarity, so the
  // assistant can speak to the user by name / about their city.
  const { data: pinned } = await supabase
    .from("memory_facts")
    .select("id, fact, category, confidence")
    .eq("user_id", userId)
    .is("valid_to", null)
    .in("category", ["identity", "location"])
    .limit(3);

  const pinnedExtra = (pinned || [])
    .filter((p) => !semanticIds.has(p.id))
    .map((p) => ({ ...p, similarity: 1 }));

  return [...pinnedExtra, ...(semantic || [])].slice(0, limit + 3);
}

/** Build a compact, LLM-friendly block from retrieved facts. */
export function memoryBlock(facts: RetrievedFact[]): string {
  if (!facts.length) return "";
  const lines = facts
    .slice(0, 12)
    .map((f) => `- [${f.category}] ${f.fact}`)
    .join("\n");
  return `\n\nMEMORIA DEL USUARIO (hechos verificados de sesiones anteriores — úsalos naturalmente):\n${lines}`;
}
