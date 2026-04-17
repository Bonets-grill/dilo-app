"use client";

import { useState, useMemo, useCallback } from "react";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProgress } from "@/lib/progress/store";

export type QuizProps = {
  chapterSlug: string;
  id: string;
  question: string;
  options: string[] | string;
  correctIndex: number | number[] | string;
  explanation: string;
  multiple?: boolean | string;
};

function parseOptions(raw: string[] | string): string[] {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split("|").map((s) => s.trim()).filter(Boolean);
  }
}

function parseCorrect(raw: number | number[] | string): number[] {
  if (typeof raw === "number") return [raw];
  if (Array.isArray(raw)) return raw;
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? [n] : [];
}

function parseMultiple(raw: boolean | string | undefined): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw === "true" || raw === "1";
  return false;
}

export function Quiz(props: QuizProps) {
  const {
    chapterSlug,
    id,
    question,
    explanation,
  } = props;
  const options = parseOptions(props.options);
  const correctArr = parseCorrect(props.correctIndex);
  const multiple = parseMultiple(props.multiple);

  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const priorAnswer = useProgress((s) => s.chapters[chapterSlug]?.quizAnswers[id]);
  const recordQuizAnswer = useProgress((s) => s.recordQuizAnswer);

  const resetLocal = useCallback(() => {
    setSelected([]);
    setSubmitted(false);
  }, []);

  const correctSet = useMemo(() => new Set(correctArr), [correctArr]);

  const isCorrect = useMemo(() => {
    if (!submitted) return false;
    if (multiple) {
      if (selected.length !== correctSet.size) return false;
      return selected.every((i) => correctSet.has(i));
    }
    return selected.length === 1 && correctSet.has(selected[0]);
  }, [submitted, selected, correctSet, multiple]);

  const locked = submitted;

  const toggle = (i: number) => {
    if (locked) return;
    setSelected((prev) => {
      if (multiple) {
        return prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i];
      }
      return prev[0] === i ? [] : [i];
    });
  };

  const submit = () => {
    if (selected.length === 0) return;
    const correct = multiple
      ? selected.length === correctSet.size &&
        selected.every((i) => correctSet.has(i))
      : correctSet.has(selected[0]);
    recordQuizAnswer(chapterSlug, id, { correct });
    setSubmitted(true);
  };

  return (
    <div className="my-8 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
        <span>Pregunta rápida</span>
        {priorAnswer && !submitted && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              priorAnswer.correct
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
            )}
          >
            {priorAnswer.correct ? "acertada antes" : `fallada antes · ${priorAnswer.attempts} intento${priorAnswer.attempts === 1 ? "" : "s"}`}
          </span>
        )}
      </div>
      <h3 className="mb-4 text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
        {question}
      </h3>
      <ul className="space-y-2">
        {options.map((opt, i) => {
          const chosen = selected.includes(i);
          const showCorrect = submitted && correctSet.has(i);
          const showIncorrect = submitted && chosen && !correctSet.has(i);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                disabled={locked}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                  "border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-800 dark:hover:bg-slate-800",
                  chosen && !submitted && "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40",
                  showCorrect && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
                  showIncorrect && "border-rose-500 bg-rose-50 dark:bg-rose-950/40",
                  locked && "cursor-not-allowed opacity-90",
                )}
                aria-pressed={chosen}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-semibold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 text-slate-800 dark:text-slate-200">{opt}</span>
                  {showCorrect && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                  {showIncorrect && <XCircle className="h-5 w-5 text-rose-600" />}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {!submitted && (
        <button
          type="button"
          onClick={submit}
          disabled={selected.length === 0}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Comprobar respuesta
        </button>
      )}

      {submitted && (
        <>
          <div
            className={cn(
              "mt-4 rounded-xl px-4 py-3 text-sm",
              isCorrect
                ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
            )}
          >
            <div className="mb-1 font-semibold">
              {isCorrect ? "Correcto" : "No del todo"}
            </div>
            <div className="leading-relaxed opacity-90">{explanation}</div>
          </div>
          <button
            type="button"
            onClick={resetLocal}
            className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            <RotateCcw className="h-3 w-3" /> Intentar de nuevo
          </button>
        </>
      )}
    </div>
  );
}
