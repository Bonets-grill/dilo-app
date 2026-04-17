"use client";

import { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProgress } from "@/lib/progress/store";

export type TerminalTaskProps = {
  chapterSlug: string;
  id: string;
  instruction: string;
  command?: string;
  expectedOutcome: string;
  verifyHint?: string;
};

export function TerminalTask(props: TerminalTaskProps) {
  const { chapterSlug, id, instruction, command, expectedOutcome, verifyHint } = props;
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");

  const priorDone = useProgress((s) => s.chapters[chapterSlug]?.tasksDone[id]);
  const markTaskDone = useProgress((s) => s.markTaskDone);

  const done = !!priorDone;

  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // silently ignore clipboard denial
    }
  };

  const toggle = () => {
    if (done) return;
    markTaskDone(chapterSlug, id, note.trim() ? note.trim() : undefined);
  };

  return (
    <div
      className={cn(
        "my-8 rounded-2xl border-2 p-6 shadow-sm transition",
        done
          ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
          : "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
        <Terminal className="h-4 w-4" />
        Tarea en tu terminal
      </div>
      <h3 className="mb-3 text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
        {instruction}
      </h3>

      {command && (
        <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-sm text-slate-100">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 select-none text-slate-500">$</span>
            <code className="flex-1 whitespace-pre-wrap break-all">{command}</code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-200 transition hover:bg-slate-700"
              aria-label="Copiar comando"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> copiar
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 rounded-lg bg-white/70 p-3 text-sm text-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Resultado esperado
        </div>
        <div className="leading-relaxed">{expectedOutcome}</div>
        {verifyHint && (
          <div className="mt-2 text-xs italic text-slate-500">💡 {verifyHint}</div>
        )}
      </div>

      {!done && (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notas personales (opcional): qué observaste, qué falló, qué aprendiste..."
            className="w-full resize-none rounded-lg border border-slate-200 bg-white/80 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
            rows={2}
          />
          <button
            type="button"
            onClick={toggle}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700"
          >
            <Check className="h-4 w-4" />
            Marcar como hecho en mi terminal
          </button>
        </div>
      )}

      {done && (
        <div className="flex items-start gap-3 rounded-lg bg-emerald-100/70 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <Check className="h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">Hecho</div>
            {priorDone?.note && (
              <div className="mt-1 whitespace-pre-wrap text-emerald-800/90 dark:text-emerald-200/90">
                {priorDone.note}
              </div>
            )}
            <div className="mt-1 text-xs opacity-70">
              {new Date(priorDone!.doneAt).toLocaleString("es-ES")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
