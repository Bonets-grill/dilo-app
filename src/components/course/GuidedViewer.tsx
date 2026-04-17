"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, X, Sparkles, CheckCircle2 } from "lucide-react";
import type { GuidedStep } from "@/lib/course/parseSteps";
import { useProgress } from "@/lib/progress/store";
import { cn } from "@/lib/utils";
import { SimpleMarkdown, stripMarkdownForSpeech } from "./SimpleMarkdown";
import { AutoNarrator } from "./AutoNarrator";
import { Quiz } from "./Quiz";
import { TerminalTask } from "./TerminalTask";
import { ArtifactEmbed } from "./ArtifactEmbed";

type Props = {
  chapterSlug: string;
  chapterTitle: string;
  chapterNumber: number;
  steps: GuidedStep[];
  audioBySectionId: Record<string, string>;
};

export function GuidedViewer({
  chapterSlug,
  chapterTitle,
  chapterNumber,
  steps,
  audioBySectionId,
}: Props) {
  const [index, setIndex] = useState(0);
  const [voiceEnded, setVoiceEnded] = useState(false);
  const step = steps[index];
  const total = steps.length;

  const chapterProgress = useProgress((s) => s.chapters[chapterSlug]);

  const isStepDone = useCallback(
    (s: GuidedStep): boolean => {
      if (!chapterProgress) return false;
      switch (s.type) {
        case "narrated":
          return chapterProgress.sectionsViewed.includes(s.id);
        case "quiz":
          return !!chapterProgress.quizAnswers[s.id];
        case "task":
          return !!chapterProgress.tasksDone[s.id];
        case "artifact":
          return chapterProgress.sectionsViewed.includes(s.id);
      }
    },
    [chapterProgress],
  );

  const canAdvance = useMemo(() => {
    if (!step) return false;
    switch (step.type) {
      case "narrated":
        return voiceEnded || isStepDone(step);
      case "quiz":
        return isStepDone(step);
      case "task":
        return isStepDone(step);
      case "artifact":
        return true;
    }
  }, [step, voiceEnded, isStepDone]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setVoiceEnded(false);
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(total - 1, i + 1));
    setVoiceEnded(false);
  }, [total]);

  // Mark narrated as viewed when entering
  const markSectionViewed = useProgress((s) => s.markSectionViewed);
  useEffect(() => {
    if (step?.type === "narrated" || step?.type === "artifact") {
      markSectionViewed(chapterSlug, step.id);
    }
  }, [step, chapterSlug, markSectionViewed]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (canAdvance) goNext();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAdvance, goNext, goPrev]);

  if (!step) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Sin pasos para guiar.</p>
      </div>
    );
  }

  const progressPct = ((index + 1) / total) * 100;
  const isLast = index === total - 1;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Sparkles className="h-3.5 w-3.5" />
              Modo guiado · Capítulo {chapterNumber}
            </div>
            <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
              {chapterTitle}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-slate-500">
              {index + 1} / {total}
            </span>
            <Link
              href={`/c/${chapterSlug}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Salir del modo guiado"
            >
              <X className="h-3.5 w-3.5" /> Salir
            </Link>
          </div>
        </div>
        <div className="mx-auto mt-3 h-1 w-full max-w-4xl overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 py-10">
        <div
          key={step.id}
          className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500"
        >
          <StepRenderer
            step={step}
            chapterSlug={chapterSlug}
            audioUrl={
              step.type === "narrated" ? audioBySectionId[step.id] : undefined
            }
            onVoiceEnded={() => setVoiceEnded(true)}
          />
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-slate-200 bg-white/90 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> Anterior
          </button>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-800">
              ←
            </kbd>{" "}
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-800">
              →
            </kbd>
            <span>para navegar</span>
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={!canAdvance || isLast}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
              canAdvance && !isLast
                ? "bg-indigo-600 text-white shadow hover:bg-indigo-700"
                : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
              "disabled:cursor-not-allowed",
            )}
          >
            {isLast ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Fin del capítulo
              </>
            ) : (
              <>
                Siguiente <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

function StepRenderer({
  step,
  chapterSlug,
  audioUrl,
  onVoiceEnded,
}: {
  step: GuidedStep;
  chapterSlug: string;
  audioUrl?: string;
  onVoiceEnded: () => void;
}) {
  switch (step.type) {
    case "narrated":
      return (
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-12">
          {step.heading && (
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {step.heading}
            </h1>
          )}
          <AutoNarrator
            className="mb-6"
            text={stripMarkdownForSpeech(step.body)}
            audioUrl={audioUrl}
            autoPlay
            onEnded={onVoiceEnded}
          />
          <SimpleMarkdown text={step.body} />
          {step.sourcePage && (
            <div className="mt-6 text-xs text-slate-400">
              📖 pág. {step.sourcePage} del libro fuente
            </div>
          )}
        </section>
      );
    case "quiz":
      return (
        <section>
          <Quiz
            chapterSlug={chapterSlug}
            id={step.id}
            question={step.question}
            options={step.options}
            correctIndex={step.correctIndex}
            explanation={step.explanation}
            multiple={step.multiple}
          />
        </section>
      );
    case "task":
      return (
        <section>
          <TerminalTask
            chapterSlug={chapterSlug}
            id={step.id}
            instruction={step.instruction}
            command={step.command}
            expectedOutcome={step.expectedOutcome}
            verifyHint={step.verifyHint}
          />
        </section>
      );
    case "artifact":
      return (
        <section>
          <ArtifactEmbed
            url={step.url}
            title={step.title}
            fallbackDescription={step.fallbackDescription}
          />
        </section>
      );
  }
}
