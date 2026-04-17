#!/usr/bin/env node
/**
 * Sube todos los MP3 + manifest.json del curso claude-de-cero al bucket
 * `course-audio` de Supabase. Los manifest.json son reescritos al vuelo
 * para que cada chunk.url apunte al CDN público de Supabase en vez del
 * /audio/... local de Next.js.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-course-audio.mjs [--source /path] [--concurrency 8]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const SOURCE = args.source || path.resolve(process.env.HOME, "Projects/claude-de-cero/public/audio");
const CONCURRENCY = Number(args.concurrency || 8);
const BUCKET = "course-audio";
const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPA_URL || !SRK) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const publicBase = `${SUPA_URL}/storage/v1/object/public/${BUCKET}`;

function rewriteManifest(raw) {
  const json = JSON.parse(raw);
  for (const chunk of json.chunks || []) {
    // /audio/cap-01/sec-intro-XX.mp3 → https://<supa>/storage/v1/object/public/course-audio/cap-01/sec-intro-XX.mp3
    if (typeof chunk.url === "string" && chunk.url.startsWith("/audio/")) {
      chunk.url = publicBase + chunk.url.replace(/^\/audio/, "");
    }
  }
  return JSON.stringify(json, null, 2);
}

async function uploadOne({ relPath, body, contentType }) {
  const url = `${SUPA_URL}/storage/v1/object/${BUCKET}/${relPath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${res.status} ${relPath}: ${t.slice(0, 200)}`);
  }
}

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

async function main() {
  console.log(`source:       ${SOURCE}`);
  console.log(`bucket:       ${BUCKET}`);
  console.log(`public base:  ${publicBase}`);
  console.log(`concurrency:  ${CONCURRENCY}\n`);

  const files = (await walk(SOURCE)).filter((f) => f.endsWith(".mp3") || f.endsWith(".json"));
  console.log(`Found ${files.length} files (mp3 + manifest.json)\n`);

  let done = 0;
  let failed = 0;
  const errors = [];

  const queue = [...files];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const file = queue.shift();
      if (!file) break;
      const rel = path.relative(SOURCE, file).split(path.sep).join("/");
      try {
        const isMp3 = file.endsWith(".mp3");
        const body = isMp3
          ? await fs.readFile(file)
          : rewriteManifest(await fs.readFile(file, "utf8"));
        await uploadOne({
          relPath: rel,
          body,
          contentType: isMp3 ? "audio/mpeg" : "application/json",
        });
        done++;
        if (done % 20 === 0) {
          process.stdout.write(`  ${done}/${files.length} (${Math.round((done / files.length) * 100)}%)\n`);
        }
      } catch (err) {
        failed++;
        errors.push({ file: rel, msg: String(err.message || err).slice(0, 200) });
      }
    }
  });

  const t0 = Date.now();
  await Promise.all(workers);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n=== Summary ===`);
  console.log(`ok=${done}  failed=${failed}  elapsed=${elapsed}s`);
  if (errors.length > 0) {
    console.log(`\nFirst 5 errors:`);
    for (const e of errors.slice(0, 5)) console.log(`  ${e.file}: ${e.msg}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
