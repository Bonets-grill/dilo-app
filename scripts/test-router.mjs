import fs from "node:fs";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error("OPENAI_API_KEY not set"); process.exit(1); }

const index = JSON.parse(fs.readFileSync("src/lib/experts/embeddings-index.json", "utf8"));
const agents = JSON.parse(fs.readFileSync("src/lib/experts/data/agents.json", "utf8"));
const bySlug = Object.fromEntries(agents.map((a) => [a.slug, a]));
const buf = fs.readFileSync("public/expert-embeddings.bin");
const matrix = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const DIMS = index.dims;

async function embed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: index.model, input: text, dimensions: DIMS }),
  });
  const data = await res.json();
  const vec = data.data[0].embedding;
  let sq = 0; for (const v of vec) sq += v * v;
  const norm = Math.sqrt(sq) || 1;
  return vec.map((v) => v / norm);
}

async function route(q, topK = 2, minScore = 0.3) {
  const query = await embed(q);
  const scores = [];
  for (let i = 0; i < index.slugs.length; i++) {
    let dot = 0;
    const off = i * DIMS;
    for (let j = 0; j < DIMS; j++) dot += query[j] * matrix[off + j];
    scores.push({ slug: index.slugs[i], score: dot });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK).filter((s) => s.score >= minScore);
}

const queries = [
  "Soy autónomo en España, ¿cuánto debo pagar de IRPF?",
  "Me mandaron un contrato de alquiler, ¿qué cláusulas son abusivas?",
  "Quiero escribir un post de LinkedIn sobre mi nuevo proyecto",
  "Cómo optimizo mi campaña de Meta Ads que está quemando dinero",
  "Diseña la arquitectura de backend para mi SaaS",
  "Me duele la cabeza desde hace 3 días",
  "¿Cómo gestiono un inquilino que no paga?",
  "Hola, ¿cómo estás?",
  "Apúntame un gasto de 12€ en gasolina",
  "Quiero invertir 5000€ a largo plazo",
];

for (const q of queries) {
  const matches = await route(q);
  console.log(`\nQ: ${q}`);
  if (!matches.length) { console.log("  (sin experto — pasa directo a DILO base)"); continue; }
  for (const m of matches) {
    const a = bySlug[m.slug];
    console.log(`  ${m.score.toFixed(3)} · ${a?.emoji || "?"} ${a?.name || m.slug} [${a?.category}]`);
  }
}
