import OpenAI from "openai";
import type { ExtractedFact } from "./extract";
import { getServiceRoleClient } from "@/lib/supabase/service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = getServiceRoleClient();

const EMBEDDING_MODEL = "text-embedding-3-small";
const DIMS = 1024;

/** Embed many texts in a single batched call. L2-normalized for cosine search. */
async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: DIMS,
  });
  return res.data.map((d) => {
    let sq = 0;
    for (const v of d.embedding) sq += v * v;
    const norm = Math.sqrt(sq) || 1;
    return d.embedding.map((v) => v / norm);
  });
}

interface StoredFact {
  id: string;
  fact: string;
  category: string;
  embedding: number[];
}

async function findSimilarExisting(
  userId: string,
  category: string,
  embedding: number[],
  threshold = 0.85
): Promise<StoredFact | null> {
  const { data } = await supabase.rpc("retrieve_memory_facts", {
    p_user_id: userId,
    p_query_embedding: embedding,
    p_limit: 3,
    p_min_similarity: threshold,
  });
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const same = data.find((d: { category: string }) => d.category === category);
  return same ? (same as StoredFact) : null;
}

export interface StoreFactsOptions {
  userId: string;
  facts: ExtractedFact[];
  sourceMessageId?: string;
}

export async function storeFacts({ userId, facts, sourceMessageId }: StoreFactsOptions): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
}> {
  if (!facts.length) return { inserted: 0, updated: 0, skipped: 0 };

  const embeddings = await embedBatch(facts.map((f) => f.fact));
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    const emb = embeddings[i];

    // Near-duplicate (>0.95) in the same category → skip
    const dupe = await findSimilarExisting(userId, f.category, emb, 0.95);
    if (dupe) {
      skipped++;
      continue;
    }

    // Semantic overlap (0.85..0.95) in same category → supersede
    const overlap = await findSimilarExisting(userId, f.category, emb, 0.85);
    if (overlap) {
      const { data: newRow } = await supabase
        .from("memory_facts")
        .insert({
          user_id: userId,
          fact: f.fact,
          category: f.category,
          confidence: f.confidence,
          source: "chat",
          source_message_id: sourceMessageId ?? null,
          embedding: emb,
        })
        .select("id")
        .single();

      if (newRow?.id) {
        await supabase
          .from("memory_facts")
          .update({ valid_to: new Date().toISOString(), superseded_by: newRow.id })
          .eq("id", overlap.id);
        updated++;
      }
      continue;
    }

    // New fact
    const { error } = await supabase.from("memory_facts").insert({
      user_id: userId,
      fact: f.fact,
      category: f.category,
      confidence: f.confidence,
      source: "chat",
      source_message_id: sourceMessageId ?? null,
      embedding: emb,
    });
    if (!error) inserted++;
  }

  return { inserted, updated, skipped };
}
