import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  AudioManifestSchema,
  LessonFrontmatterSchema,
  type AudioManifest,
  type LessonFrontmatter,
} from "./schema";
import { findChapterBySlug } from "./slugs";

const ROOT = process.cwd();
export const CHAPTERS_DIR = path.join(ROOT, "content", "claude-de-cero", "chapters");
export const DRAFTS_DIR = path.join(ROOT, "content", "drafts");

/**
 * Audio manifests live in Supabase Storage (bucket `course-audio`) — each
 * chunk.url inside the manifest already points to the public CDN URL for
 * the corresponding MP3, so the browser can stream without us proxying.
 *
 * Base = https://<supabase>/storage/v1/object/public/course-audio
 * Path = cap-NN/manifest.json
 */
const COURSE_AUDIO_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL || ""}/storage/v1/object/public/course-audio`;

export type LoadedLesson = {
  frontmatter: LessonFrontmatter;
  mdxBody: string;
  filePath: string;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findLessonFile(slug: string): Promise<string | null> {
  // Gate de seguridad: solo slugs en el whitelist de CHAPTERS pueden resolverse.
  // Previene path traversal (`../etc/passwd`) desde URL params.
  const entry = findChapterBySlug(slug);
  if (!entry) return null;
  const padded = String(entry.chapterNumber).padStart(2, "0");
  const candidates = [
    path.join(CHAPTERS_DIR, `${padded}-${slug}.mdx`),
    path.join(CHAPTERS_DIR, `${slug}.mdx`),
    path.join(DRAFTS_DIR, `${padded}-${slug}.mdx`),
    path.join(DRAFTS_DIR, `${slug}.mdx`),
  ];
  for (const p of candidates) {
    if (await fileExists(p)) return p;
  }
  return null;
}

export async function getLesson(slug: string): Promise<LoadedLesson | null> {
  const filePath = await findLessonFile(slug);
  if (!filePath) return null;
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const frontmatter = LessonFrontmatterSchema.parse(parsed.data);
  return {
    frontmatter,
    mdxBody: parsed.content,
    filePath,
  };
}

export async function getAudioManifest(
  slug: string,
): Promise<AudioManifest | null> {
  const entry = findChapterBySlug(slug);
  if (!entry) return null;
  const padded = String(entry.chapterNumber).padStart(2, "0");
  const url = `${COURSE_AUDIO_BASE}/cap-${padded}/manifest.json`;
  try {
    // Cache the manifest for 5min at the edge — it changes only when we
    // regenerate audio (rare) and each chunk.url already has a content hash
    // so stale URLs keep pointing to the right file.
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = await res.json();
    return AudioManifestSchema.parse(json);
  } catch {
    return null;
  }
}

export async function listLessons(
  scope: "chapters" | "drafts" | "both" = "both",
): Promise<
  Array<{ frontmatter: LessonFrontmatter; source: "chapters" | "drafts" }>
> {
  const out: Array<{
    frontmatter: LessonFrontmatter;
    source: "chapters" | "drafts";
  }> = [];
  const scan = async (dir: string, src: "chapters" | "drafts") => {
    if (!(await fileExists(dir))) return;
    const entries = await fs.readdir(dir);
    for (const name of entries) {
      if (!name.endsWith(".mdx")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, name), "utf8");
        const parsed = matter(raw);
        const fm = LessonFrontmatterSchema.parse(parsed.data);
        out.push({ frontmatter: fm, source: src });
      } catch {
        // skip broken drafts silently in listing
      }
    }
  };
  if (scope === "chapters" || scope === "both") await scan(CHAPTERS_DIR, "chapters");
  if (scope === "drafts" || scope === "both") await scan(DRAFTS_DIR, "drafts");
  return out.sort(
    (a, b) => a.frontmatter.chapterNumber - b.frontmatter.chapterNumber,
  );
}
