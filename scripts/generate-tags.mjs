#!/usr/bin/env node
/**
 * For each agent, use GPT-4o-mini to generate ES/EN keyword tags
 * that a real user would type in natural language when they'd need
 * that specialist. This dramatically improves the embedding-based
 * router for Spanish queries (the descriptions are English-only).
 *
 * Writes back into src/lib/experts/data/agents.json, preserving
 * existing fields. Safe to re-run: skips agents that already have
 * `es_keywords` and `en_keywords`.
 */
import fs from "node:fs";
import path from "node:path";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error("OPENAI_API_KEY not set"); process.exit(1); }

const AGENTS = path.join(process.cwd(), "src/lib/experts/data/agents.json");
const agents = JSON.parse(fs.readFileSync(AGENTS, "utf8"));

const CONCURRENCY = 10;
const MODEL = "gpt-4o-mini";

async function generateTags(agent) {
  const systemHint = (agent.system_prompt || "").slice(0, 500);
  const prompt = `You are tagging an AI specialist so a routing system can find them when users ask questions in Spanish OR English.

Specialist:
  Name: ${agent.name}
  Description: ${agent.description}
  Vibe: ${agent.vibe || "(none)"}
  Category: ${agent.category}
  Excerpt: ${systemHint}

Task: return ~8 short phrases in ES and ~8 in EN that a REAL USER (not an expert) would type when they need this specialist. Think natural, conversational terms: "IRPF autónomo", "cuánto pago de impuestos", "tax deductions freelance", etc. Include domain-specific terms (legal codes, regulations, acronyms, brand names) that are common in each language.

Output ONLY valid JSON with this exact shape:
{
  "es_keywords": ["frase 1", "frase 2", ...],
  "en_keywords": ["phrase 1", "phrase 2", ...]
}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`${agent.slug}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices[0].message.content;
  const parsed = JSON.parse(raw);
  return {
    es_keywords: Array.isArray(parsed.es_keywords) ? parsed.es_keywords.slice(0, 10) : [],
    en_keywords: Array.isArray(parsed.en_keywords) ? parsed.en_keywords.slice(0, 10) : [],
  };
}

async function runBatch(batch) {
  return Promise.all(
    batch.map(async (a) => {
      try {
        const tags = await generateTags(a);
        a.es_keywords = tags.es_keywords;
        a.en_keywords = tags.en_keywords;
        return { ok: true, slug: a.slug };
      } catch (e) {
        return { ok: false, slug: a.slug, err: e.message };
      }
    })
  );
}

const todo = agents.filter((a) => !a.es_keywords || !a.en_keywords);
console.log(`Total agents: ${agents.length} · Needing tags: ${todo.length}`);

let done = 0, failed = 0;
for (let i = 0; i < todo.length; i += CONCURRENCY) {
  const batch = todo.slice(i, i + CONCURRENCY);
  const results = await runBatch(batch);
  for (const r of results) {
    if (r.ok) done++;
    else { failed++; console.error(`  ✗ ${r.slug}: ${r.err}`); }
  }
  process.stdout.write(`\r  progress: ${done + failed}/${todo.length} (ok=${done} fail=${failed})`);
  // Save incrementally so we don't lose work on interruption
  if ((i / CONCURRENCY) % 5 === 0) {
    fs.writeFileSync(AGENTS, JSON.stringify(agents, null, 2));
  }
}
fs.writeFileSync(AGENTS, JSON.stringify(agents, null, 2));

console.log(`\n\nDone. ok=${done} fail=${failed}`);
console.log(`Cost estimate: ~$${(done * 0.00025).toFixed(3)}`);
