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

// Small-talk / greetings / thanks — never route these to an expert, they'd
// always match something weakly (Support Responder, Language Translator,
// etc.) and degrade the reply with off-topic expert framing.
const SMALLTALK_PATTERNS = [
  /^(hola|hi|hey|hello|buenos?\s+(d[ií]as|tardes|noches)|buen[oa]s)\b/i,
  /^(gracias|thanks?|ty|ok|vale|perfecto|genial|entendido|bien)\b/i,
  /^(adi[oó]s|bye|chao|hasta\s+luego)\b/i,
  /^(s[ií]|no|quiz[aá]s?)[\s.!?]*$/i,
];

function isSmallTalk(msg: string): boolean {
  const t = msg.trim();
  if (t.length <= 3) return true;
  if (t.length <= 20 && SMALLTALK_PATTERNS.some((re) => re.test(t))) return true;
  return false;
}

/** Returns top-K experts most relevant to the user message. */
export async function routeToExperts(
  userMessage: string,
  opts: { topK?: number; minScore?: number } = {}
): Promise<RouteMatch[]> {
  if (isSmallTalk(userMessage)) return [];

  const topK = opts.topK ?? 3;
  // 0.33 with ES/EN keyword tags in the embedding: captures Spanish queries
  // like "IRPF autónomo" (0.341) / "contrato de alquiler" (0.312) / "invertir"
  // (0.313) that the English-only descriptions missed. Smalltalk/greetings
  // are filtered above so lowering threshold doesn't bring false positives.
  const minScore = opts.minScore ?? 0.33;

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
