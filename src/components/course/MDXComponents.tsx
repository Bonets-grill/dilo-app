import type { MDXComponents } from "mdx/types";
import { Quiz, type QuizProps } from "./Quiz";
import { TerminalTask, type TerminalTaskProps } from "./TerminalTask";
import { NarratedSection, type NarratedSectionProps } from "./NarratedSection";
import { ArtifactEmbed } from "./ArtifactEmbed";
import { DiagramSVG } from "./DiagramSVG";
import type { AudioManifest } from "@/lib/course/schema";
import { buildAudioIndex } from "@/lib/course/parseSteps";

export function buildMDXComponents(
  chapterSlug: string,
  audioManifest: AudioManifest | null,
): MDXComponents {
  const audioBySectionId = buildAudioIndex(audioManifest);

  return {
    Quiz: (p: Omit<QuizProps, "chapterSlug">) => (
      <Quiz {...p} chapterSlug={chapterSlug} />
    ),
    TerminalTask: (p: Omit<TerminalTaskProps, "chapterSlug">) => (
      <TerminalTask {...p} chapterSlug={chapterSlug} />
    ),
    NarratedSection: (p: Omit<NarratedSectionProps, "chapterSlug" | "audioUrl">) => (
      <NarratedSection
        {...p}
        chapterSlug={chapterSlug}
        audioUrl={audioBySectionId[p.id]}
      />
    ),
    ArtifactEmbed,
    DiagramSVG,
    h1: (props) => (
      <h1
        {...props}
        className="mb-6 mt-2 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
      />
    ),
    h2: (props) => (
      <h2
        {...props}
        className="mb-4 mt-10 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
      />
    ),
    h3: (props) => (
      <h3
        {...props}
        className="mb-3 mt-8 text-xl font-semibold text-slate-900 dark:text-slate-100"
      />
    ),
    p: (props) => (
      <p
        {...props}
        className="mb-4 text-base leading-relaxed text-slate-700 dark:text-slate-300"
      />
    ),
    ul: (props) => (
      <ul {...props} className="mb-4 ml-6 list-disc space-y-1 text-slate-700 dark:text-slate-300" />
    ),
    ol: (props) => (
      <ol {...props} className="mb-4 ml-6 list-decimal space-y-1 text-slate-700 dark:text-slate-300" />
    ),
    li: (props) => <li {...props} className="leading-relaxed" />,
    strong: (props) => (
      <strong {...props} className="font-semibold text-slate-900 dark:text-slate-50" />
    ),
    em: (props) => <em {...props} className="italic" />,
    code: (props) => (
      <code
        {...props}
        className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800 dark:bg-slate-800 dark:text-slate-200"
      />
    ),
    pre: (props) => (
      <pre
        {...props}
        className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100 dark:border-slate-800"
      />
    ),
    blockquote: (props) => (
      <blockquote
        {...props}
        className="my-4 border-l-4 border-indigo-400 bg-indigo-50/50 py-2 pl-4 text-slate-700 dark:bg-indigo-950/20 dark:text-slate-300"
      />
    ),
    a: (props) => (
      <a
        {...props}
        className="text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-500 dark:text-indigo-400"
      />
    ),
  };
}
