#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/lib/experts/data/agents.json");
const META_OUT = path.join(process.cwd(), "public/experts-meta.json");

// Sources: each entry is { root, scanPaths, origin, defaultCategory? }
const SOURCES = [
  {
    origin: "agency-agents",
    root: "/Users/lifeonmotus/Desktop/agency-agents-main",
    scanPaths: [
      "academic", "design", "engineering", "finance", "game-development",
      "marketing", "paid-media", "product", "project-management", "sales",
      "spatial-computing", "specialized", "support", "testing",
    ],
    categoryFromPath: (relPath) => relPath.split("/")[0],
  },
  {
    origin: "wshobson",
    root: "/tmp/wshobson-agents",
    scanPaths: ["plugins"],
    // wshobson structure: plugins/<plugin-name>/agents/*.md — category = plugin name
    categoryFromPath: (relPath) => {
      const parts = relPath.split("/");
      // plugins/<name>/agents/file.md → <name>
      if (parts[0] === "plugins" && parts[2] === "agents") return parts[1];
      return "misc";
    },
  },
];

const SKIP_FILES = new Set([
  "README.md", "CONTRIBUTING.md", "CONTRIBUTING_zh-CN.md", "SECURITY.md", "LICENSE",
]);

function parseFrontmatter(txt) {
  const m = txt.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!mm) continue;
    let val = mm[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    fm[mm[1]] = val;
  }
  return { fm, body: m[2] };
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".md") && !SKIP_FILES.has(e.name)) out.push(p);
  }
  return out;
}

const agents = [];
const seen = new Set();

for (const src of SOURCES) {
  let added = 0;
  let skipped = 0;
  for (const scanPath of src.scanPaths) {
    const base = path.join(src.root, scanPath);
    for (const file of walk(base)) {
      const rel = path.relative(src.root, file);
      const txt = fs.readFileSync(file, "utf8");
      const parsed = parseFrontmatter(txt);
      if (!parsed || !parsed.fm.name || !parsed.fm.description) {
        skipped++;
        continue;
      }

      const name = parsed.fm.name;
      const slug = slugify(name);
      if (seen.has(slug)) {
        skipped++;
        continue;
      }
      seen.add(slug);

      agents.push({
        slug,
        name,
        description: parsed.fm.description.replace(/\s+/g, " ").trim(),
        category: src.categoryFromPath(rel),
        color: parsed.fm.color || "gray",
        emoji: parsed.fm.emoji || "🤖",
        vibe: parsed.fm.vibe || "",
        tools_declared: parsed.fm.tools
          ? parsed.fm.tools.split(",").map((s) => s.trim())
          : null,
        origin: src.origin,
        system_prompt: parsed.body.trim(),
      });
      added++;
    }
  }
  console.log(`  ${src.origin}: +${added} (${skipped} skipped)`);
}

agents.sort(
  (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
);
fs.writeFileSync(OUT, JSON.stringify(agents, null, 2));

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

console.log(`\nTotal unique agents: ${agents.length}`);
console.log(`Categories: ${categories.length}`);
console.log(`Wrote: ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
console.log(`Wrote: ${META_OUT} (${(fs.statSync(META_OUT).size / 1024).toFixed(1)} KB)`);
