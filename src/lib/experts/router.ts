import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { getExpertBySlug, type Expert } from "./registry";
import indexJson from "./embeddings-index.json";

const EMBEDDING_MODEL = "text-embedding-3-small";
const DIMS = indexJson.dims;
const SLUGS: string[] = indexJson.slugs;

// Load Float32Array once per process (Node caches require'd modules, not files —
// we use fs.readFileSync once on module init).
let MATRIX: Float32Array | null = null;
function loadMatrix(): Float32Array {
  if (MATRIX) return MATRIX;
  const p = path.join(process.cwd(), "public/expert-embeddings.bin");
  const buf = fs.readFileSync(p);
  MATRIX = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return MATRIX;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function embed(text: string): Promise<Float32Array> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: DIMS,
  });
  const vec = res.data[0].embedding;
  // Normalize so dot product = cosine similarity
  let sq = 0;
  for (const v of vec) sq += v * v;
  const norm = Math.sqrt(sq) || 1;
  const out = new Float32Array(DIMS);
  for (let i = 0; i < DIMS; i++) out[i] = vec[i] / norm;
  return out;
}

export interface RouteMatch {
  slug: string;
  score: number; // cosine similarity in [-1, 1], ~0-1 for related texts
  expert: Expert | undefined;
}

/** Returns top-K experts most relevant to the user message. */
export async function routeToExperts(
  userMessage: string,
  opts: { topK?: number; minScore?: number } = {}
): Promise<RouteMatch[]> {
  const topK = opts.topK ?? 3;
  // 0.35 empirically: matches when the user asks about a domain the expert
  // owns ("LinkedIn post", "Meta Ads", "backend architecture") but rejects
  // greetings/short smalltalk (which would otherwise match weakly to random
  // specialists). Queries below threshold fall through to the base DILO chat.
  const minScore = opts.minScore ?? 0.35;

  const matrix = loadMatrix();
  const query = await embed(userMessage);

  const scores: RouteMatch[] = new Array(SLUGS.length);
  for (let i = 0; i < SLUGS.length; i++) {
    let dot = 0;
    const off = i * DIMS;
    for (let j = 0; j < DIMS; j++) dot += query[j] * matrix[off + j];
    scores[i] = { slug: SLUGS[i], score: dot, expert: undefined };
  }

  scores.sort((a, b) => b.score - a.score);
  const out = scores.slice(0, topK).filter((s) => s.score >= minScore);
  for (const m of out) m.expert = getExpertBySlug(m.slug);
  return out;
}

/** Build a compact system-prompt section to inject into the main chat. */
export function expertContextBlock(
  matches: RouteMatch[],
  maxTotalChars = 4500
): string {
  if (!matches.length) return "";
  const top = matches[0];
  if (!top.expert) return "";

  const prompt = top.expert.system_prompt;
  const truncated =
    prompt.length > maxTotalChars ? prompt.slice(0, maxTotalChars) + "…" : prompt;

  return [
    "",
    `## Expert context — consulting: ${top.expert.emoji} ${top.expert.name}`,
    `_${top.expert.description}_`,
    "",
    "Use the following expert knowledge to ground your answer. Keep DILO's warm, direct tone — don't break character into the expert's voice. Blend the expertise naturally into your reply as DILO.",
    "",
    truncated,
  ].join("\n");
}
