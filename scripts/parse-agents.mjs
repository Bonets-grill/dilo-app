#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SRC = "/Users/lifeonmotus/Desktop/agency-agents-main";
const OUT = path.join(process.cwd(), "src/lib/experts/data/agents.json");

const CATEGORIES = [
  "academic", "design", "engineering", "finance", "game-development",
  "marketing", "paid-media", "product", "project-management", "sales",
  "spatial-computing", "specialized", "support", "testing",
];

const SKIP = new Set(["README.md", "CONTRIBUTING.md", "CONTRIBUTING_zh-CN.md", "SECURITY.md", "LICENSE"]);

function parseFrontmatter(txt) {
  const m = txt.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!mm) continue;
    fm[mm[1]] = mm[2].trim();
  }
  return { fm, body: m[2] };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".md") && !SKIP.has(e.name)) out.push(p);
  }
  return out;
}

const agents = [];
const seen = new Set();
for (const cat of CATEGORIES) {
  const dir = path.join(SRC, cat);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const txt = fs.readFileSync(file, "utf8");
    const parsed = parseFrontmatter(txt);
    if (!parsed || !parsed.fm.name || !parsed.fm.description) continue;

    const slug = slugify(parsed.fm.name);
    if (seen.has(slug)) continue;
    seen.add(slug);

    agents.push({
      slug,
      name: parsed.fm.name,
      description: parsed.fm.description.replace(/\s+/g, " ").trim(),
      category: cat,
      color: parsed.fm.color || "gray",
      emoji: parsed.fm.emoji || "🤖",
      vibe: parsed.fm.vibe || "",
      tools_declared: parsed.fm.tools ? parsed.fm.tools.split(",").map(s => s.trim()) : null,
      system_prompt: parsed.body.trim(),
    });
  }
}

agents.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
fs.writeFileSync(OUT, JSON.stringify(agents, null, 2));

// Static meta file (without system_prompt) — served from CDN edge, ~5x faster
const META_OUT = path.join(process.cwd(), "public/experts-meta.json");
const meta = agents.map(({ system_prompt: _sp, ...rest }) => rest);
const byCat = {};
for (const a of agents) byCat[a.category] = (byCat[a.category] || 0) + 1;
const categories = Object.entries(byCat)
  .map(([category, count]) => ({ category, count }))
  .sort((a, b) => a.category.localeCompare(b.category));
fs.writeFileSync(
  META_OUT,
  JSON.stringify({ experts: meta, total: meta.length, categories })
);

console.log(`Total agents: ${agents.length}`);
for (const [c, n] of Object.entries(byCat).sort()) console.log(`  ${c}: ${n}`);
console.log(`\nWrote: ${OUT}`);
console.log(`  Size: ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
console.log(`Wrote: ${META_OUT}`);
console.log(`  Size: ${(fs.statSync(META_OUT).size / 1024).toFixed(1)} KB (client-served)`);
