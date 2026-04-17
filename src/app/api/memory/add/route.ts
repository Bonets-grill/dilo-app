import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATEGORIES = [
  "identity", "preferences", "goals", "relationships",
  "health", "finance", "work", "location", "interests", "routines",
] as const;
type Category = typeof CATEGORIES[number];

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

/**
 * POST /api/memory/add
 * Body: { userId, fact, category? }
 * Manually add a memory fact. Auto-detects category via keyword heuristic
 * if not given.
 */
export async function POST(req: NextRequest) {
  const { userId, fact, category } = await req.json();
  if (!userId || typeof fact !== "string" || fact.trim().length < 3) {
    return NextResponse.json({ error: "Missing userId or fact (min 3 chars)" }, { status: 400 });
  }

  const cleaned = fact.trim();
  const cat: Category = (CATEGORIES.includes(category as Category) ? category : "preferences") as Category;

  // El embedding requiere OpenAI. Si la key está sin cuota (429) o hay
  // problema de red, preferimos guardar el hecho sin embedding a perderlo.
  // La búsqueda semántica se degrada para ese row hasta que se regenere,
  // pero el usuario nunca pierde lo que escribió a mano.
  let embedding: number[] | null = null;
  let embedError: string | null = null;
  try {
    embedding = await embed(cleaned);
  } catch (err) {
    embedError = err instanceof Error ? err.message : "embedding_failed";
    console.warn("[memory/add] embedding failed, storing without vector:", embedError);
  }

  const { data, error } = await supabase
    .from("memory_facts")
    .insert({
      user_id: userId,
      fact: cleaned,
      category: cat,
      confidence: 1.0,
      source: "manual",
      embedding,
    })
    .select("id, fact, category, confidence, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, memory: data, embedding_degraded: !!embedError, embedding_error: embedError });
}
