#!/usr/bin/env node
/**
 * Computes OpenAI embeddings for all experts using text-embedding-3-small
 * at 256 dimensions (good enough for routing, 6× smaller than default 1536).
 *
 * Inputs:  src/lib/experts/data/agents.json
 * Outputs:
 *   public/expert-embeddings.bin        — Float32Array [N x 256] row-major
 *   src/lib/experts/embeddings-index.json  — { model, dims, slugs: string[] }
 *
 * Slugs array ORDER matches row order in the .bin so the router can map back.
 */
import fs from "node:fs";
import path from "node:path";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("OPENAI_API_KEY not set");
  process.exit(1);
}

const DIMS = 1024;
const MODEL = "text-embedding-3-small";
const BATCH_SIZE = 50; // Smaller batch with longer texts

const AGENTS_JSON = path.join(process.cwd(), "src/lib/experts/data/agents.json");
const BIN_OUT = path.join(process.cwd(), "public/expert-embeddings.bin");
const INDEX_OUT = path.join(process.cwd(), "src/lib/experts/embeddings-index.json");

const agents = JSON.parse(fs.readFileSync(AGENTS_JSON, "utf8"));
console.log(`Computing embeddings for ${agents.length} agents…`);

// Text to embed: rich signal — name + vibe + description + category + first 800 chars
// of the system prompt (captures domain language/keywords beyond the terse description).
function textFor(a) {
  const systemHint = (a.system_prompt || "").slice(0, 800);
  return [
    a.name,
    a.vibe,
    a.description,
    `category: ${a.category}`,
    systemHint,
  ].filter(Boolean).join(" — ");
}

async function embedBatch(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIMS }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

const slugs = agents.map((a) => a.slug);
const all = [];
for (let i = 0; i < agents.length; i += BATCH_SIZE) {
  const batch = agents.slice(i, i + BATCH_SIZE).map(textFor);
  process.stdout.write(`  batch ${i / BATCH_SIZE + 1}/${Math.ceil(agents.length / BATCH_SIZE)}… `);
  const embs = await embedBatch(batch);
  all.push(...embs);
  console.log(`ok (${embs.length})`);
}

if (all.length !== agents.length) throw new Error(`length mismatch: ${all.length} vs ${agents.length}`);

// Pack into Float32Array row-major
const f32 = new Float32Array(agents.length * DIMS);
for (let i = 0; i < all.length; i++) {
  const vec = all[i];
  if (vec.length !== DIMS) throw new Error(`dim mismatch row ${i}: ${vec.length}`);
  // L2 normalize (so dot product = cosine similarity)
  let sq = 0;
  for (const v of vec) sq += v * v;
  const norm = Math.sqrt(sq) || 1;
  for (let j = 0; j < DIMS; j++) f32[i * DIMS + j] = vec[j] / norm;
}

fs.writeFileSync(BIN_OUT, Buffer.from(f32.buffer));
fs.writeFileSync(
  INDEX_OUT,
  JSON.stringify({ model: MODEL, dims: DIMS, count: agents.length, slugs }, null, 2)
);

console.log(`\nWrote: ${BIN_OUT} (${(fs.statSync(BIN_OUT).size / 1024).toFixed(1)} KB)`);
console.log(`Wrote: ${INDEX_OUT}`);
console.log(`Cost estimate: ~$${(agents.length * 0.00002 * 0.1).toFixed(4)} (text-embedding-3-small)`);
