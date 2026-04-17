import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/require-user";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
 * DELETE /api/memory/:id
 * Body: { userId }
 * Soft-deletes: marks valid_to = NOW() so the fact no longer appears in
 * retrieval but history is preserved for audit.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  await req.json().catch(() => ({})); // body may be empty
  if (!userId || !id) return NextResponse.json({ error: "Missing userId or id" }, { status: 400 });

  const { error } = await supabase
    .from("memory_facts")
    .update({ valid_to: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/memory/:id
 * Body: { userId, fact?, category? }
 * Re-embeds if fact text changes.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, fact, category } = await req.json();
  if (!userId || !id) return NextResponse.json({ error: "Missing userId or id" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof fact === "string" && fact.trim().length > 2) {
    update.fact = fact.trim();
    update.embedding = await embed(fact.trim());
  }
  if (typeof category === "string") update.category = category;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("memory_facts")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
