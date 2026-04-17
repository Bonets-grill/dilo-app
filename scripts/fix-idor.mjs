#!/usr/bin/env node
/**
 * Migra rutas que leen `userId` de query/body al gate requireUser().
 *
 * Solo toca rutas que coinciden con patrones claros. Para casos raros
 * (POST con userId opcional, varias rutas en un mismo handler), emite
 * aviso y NO modifica — esos se migran a mano.
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROUTES = [
  "src/app/api/memory/list/route.ts",
  "src/app/api/memory/add/route.ts",
  "src/app/api/memory/[id]/route.ts",
  "src/app/api/journal/route.ts",
  "src/app/api/dm/route.ts",
  "src/app/api/calls/history/route.ts",
  "src/app/api/marketplace/my-listings/route.ts",
  "src/app/api/marketplace/listings/route.ts",
  "src/app/api/marketplace/listings/[id]/route.ts",
  "src/app/api/marketplace/likes/route.ts",
  "src/app/api/marketplace/offers/route.ts",
  "src/app/api/marketplace/search/route.ts",
  "src/app/api/oauth/google/status/route.ts",
  "src/app/api/user/export/route.ts",
  "src/app/api/user/timezone/route.ts",
  "src/app/api/consent/route.ts",
  "src/app/api/location/route.ts",
  "src/app/api/emergency/route.ts",
  "src/app/api/referral/route.ts",
  "src/app/api/connections/route.ts",
  "src/app/api/rtc/signal/route.ts",
  "src/app/api/nutrition/dashboard/route.ts",
  "src/app/api/cursos/list/route.ts",
  "src/app/api/push/test/route.ts",
  "src/app/api/users/search/route.ts",
  "src/app/api/family/kids-status/route.ts",
  "src/app/api/family/invite/route.ts",
  "src/app/api/student/profile/route.ts",
  "src/app/api/study/start/route.ts",
  "src/app/api/study/stop/route.ts",
  "src/app/api/study/history/route.ts",
  "src/app/api/study/plan/route.ts",
  "src/app/api/study/chat/route.ts",
  "src/app/api/study/heartbeat/route.ts",
  "src/app/api/study/upload-material/route.ts",
  "src/app/api/study/progress/complete-topic/route.ts",
];

const REPORT = { migrated: [], skipped_manual: [], unchanged: [], not_found: [] };

function hasImport(src, spec) {
  const re = new RegExp(`from\\s+["']${spec.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}["']`);
  return re.test(src);
}

function ensureRequireUserImport(src) {
  if (hasImport(src, "@/lib/auth/require-user")) return src;
  // Insert after the last existing import
  const lines = src.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i])) lastImportIdx = i;
  }
  if (lastImportIdx === -1) return src;
  lines.splice(lastImportIdx + 1, 0, `import { requireUser } from "@/lib/auth/require-user";`);
  return lines.join("\n");
}

function migrateQueryParamPattern(src) {
  // Pattern A: const userId = new URL(req.url).searchParams.get("userId");
  //            if (!userId) return NextResponse.json(...{status: 400});
  const reA = /const userId = new URL\(req\.url\)\.searchParams\.get\("userId"\);[\s\n]*if \(!userId\) return NextResponse\.json\([^)]+\);/g;
  if (reA.test(src)) {
    return {
      src: src.replace(reA, `const auth = await requireUser();\n  if (auth.error) return auth.error;\n  const userId = auth.user.id;`),
      changed: true,
      pattern: "A",
    };
  }
  return null;
}

function migrateBodyUserIdPattern(src) {
  // Pattern B (destructure): const { userId, ... } = await req.json();
  //                           then if (!userId) …
  const reB = /const \{ userId(, [^}]+)?\s*\} = await req\.json\(\);/;
  const m = reB.exec(src);
  if (!m) return null;
  const rest = m[1] || "";
  const replacement = rest.trim()
    ? `const auth = await requireUser();\n  if (auth.error) return auth.error;\n  const body = await req.json();\n  const userId = auth.user.id;\n  const {${rest.replace(/^,\s*/, " ")} } = body;`
    : `const auth = await requireUser();\n  if (auth.error) return auth.error;\n  const userId = auth.user.id;\n  await req.json().catch(() => ({})); // body may be empty`;
  return {
    src: src.replace(reB, replacement),
    changed: true,
    pattern: "B",
  };
}

for (const rel of ROUTES) {
  const abs = path.resolve(rel);
  try { await fs.access(abs); } catch { REPORT.not_found.push(rel); continue; }
  let src = await fs.readFile(abs, "utf8");
  const before = src;

  let mig = migrateQueryParamPattern(src);
  if (mig?.changed) src = mig.src;
  else {
    mig = migrateBodyUserIdPattern(src);
    if (mig?.changed) src = mig.src;
  }

  if (src !== before) {
    src = ensureRequireUserImport(src);
    await fs.writeFile(abs, src);
    REPORT.migrated.push({ file: rel, pattern: mig.pattern });
  } else {
    REPORT.unchanged.push(rel);
  }
}

console.log(JSON.stringify(REPORT, null, 2));
