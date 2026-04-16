"use client";

import { useState } from "react";
import { Check, X, Trophy, RotateCcw } from "lucide-react";

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number; // index of correct option
  explanation: string;
}

export default function Quiz({
  questions,
  onFinish,
}: {
  questions: QuizQuestion[];
  onFinish: (score: number, total: number) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const q = questions[current];

  function select(idx: number) {
    if (showAnswer) return;
    setSelected(idx);
    setShowAnswer(true);
    if (idx === q.correct) setScore((s) => s + 1);
  }

  function next() {
    if (current + 1 >= questions.length) {
      const finalScore = score + (selected === q?.correct ? 0 : 0); // score already updated
      setFinished(true);
      onFinish(score, questions.length);
      return;
    }
    setCurrent((c) => c + 1);
    setSelected(null);
    setShowAnswer(false);
  }

  function restart() {
    setCurrent(0);
    setSelected(null);
    setShowAnswer(false);
    setScore(0);
    setFinished(false);
  }

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    const emoji = pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "📚";
    return (
      <div className="rounded-2xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/5 border border-[var(--accent)]/40 p-5 text-center space-y-3">
        <p className="text-4xl">{emoji}</p>
        <p className="text-2xl font-bold">
          {score}/{questions.length}
        </p>
        <p className="text-sm text-[var(--muted)]">
          {pct >= 80 ? "¡Excelente! Dominas el tema." : pct >= 50 ? "Bien, pero repasa los errores." : "Necesitas repasar. ¡No te rindas!"}
        </p>
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-xs font-medium"
        >
          <RotateCcw size={12} /> Repetir quiz
        </button>
      </div>
    );
  }

  if (!q) return null;

  return (
    <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--dim)]">
          Pregunta {current + 1}/{questions.length}
        </span>
        <span className="text-[10px] text-green-400 font-medium">{score} correctas</span>
      </div>

      <p className="text-sm font-medium leading-relaxed">{q.question}</p>

      <div className="space-y-2">
        {q.options.map((opt, idx) => {
          let cls = "bg-[var(--bg3)] border-[var(--border)] text-[var(--muted)]";
          if (showAnswer && idx === q.correct) cls = "bg-green-500/20 border-green-500/40 text-green-400";
          if (showAnswer && idx === selected && idx !== q.correct) cls = "bg-red-500/20 border-red-500/40 text-red-400";
          return (
            <button
              key={idx}
              type="button"
              onClick={() => select(idx)}
              disabled={showAnswer}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition ${cls}`}
            >
              <span className="inline-flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[10px] flex-shrink-0">
                  {showAnswer && idx === q.correct ? <Check size={10} className="text-green-400" /> : showAnswer && idx === selected ? <X size={10} className="text-red-400" /> : String.fromCharCode(65 + idx)}
                </span>
                {opt}
              </span>
            </button>
          );
        })}
      </div>

      {showAnswer && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5">
          <p className="text-[11px] text-blue-300 leading-relaxed">{q.explanation}</p>
        </div>
      )}

      {showAnswer && (
        <button
          type="button"
          onClick={next}
          className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold"
        >
          {current + 1 < questions.length ? "Siguiente →" : "Ver resultado"}
        </button>
      )}
    </div>
  );
}
