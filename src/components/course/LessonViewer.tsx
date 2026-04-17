import { MDXRemote } from "next-mdx-remote/rsc";
import type { AudioManifest, LessonFrontmatter } from "@/lib/course/schema";
import { buildMDXComponents } from "./MDXComponents";

export type LessonViewerProps = {
  frontmatter: LessonFrontmatter;
  mdxBody: string;
  audioManifest: AudioManifest | null;
};

export function LessonViewer({
  frontmatter,
  mdxBody,
  audioManifest,
}: LessonViewerProps) {
  const components = buildMDXComponents(frontmatter.slug, audioManifest);
  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-10 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          Capítulo {frontmatter.chapterNumber} · {labelForPart(frontmatter.part)}
        </div>
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          {frontmatter.title}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span>⏱ {frontmatter.estimatedMinutes} min</span>
          <span>
            📖 págs. {frontmatter.sourcePagesFrom}–{frontmatter.sourcePagesTo}
          </span>
          {frontmatter.status !== "approved" && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
              borrador
            </span>
          )}
        </div>
      </header>
      <MDXRemote source={mdxBody} components={components} />
    </article>
  );
}

function labelForPart(part: LessonFrontmatter["part"]): string {
  switch (part) {
    case "fundamentos":
      return "Fundamentos";
    case "claude-ai":
      return "Claude.ai en profundidad";
    case "claude-code":
      return "Claude Code";
    case "avanzado":
      return "Avanzado y Desarrollador";
  }
}
