"use client";

import { useEffect, useRef, useState } from "react";
import katex from "katex";

interface Step {
  text: string;
  math?: string;
}

/**
 * Pizarra interactiva — simula una clase. Muestra pasos uno a uno con
 * animación de escritura. Las ecuaciones se renderizan con KaTeX sobre
 * fondo oscuro tipo pizarrón.
 */
export default function Whiteboard({ steps, onDone }: { steps: Step[]; onDone?: () => void }) {
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [typing, setTyping] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibleSteps >= steps.length) {
      setTyping(false);
      onDone?.();
      return;
    }
    const delay = Math.min(2000, 800 + (steps[visibleSteps]?.text?.length || 0) * 15);
    const timer = setTimeout(() => {
      setVisibleSteps((v) => v + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [visibleSteps, steps, onDone]);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleSteps]);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl bg-[#1a2332] border border-[#2a3a4a] p-4 overflow-y-auto max-h-[300px] space-y-3 font-mono"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-[10px] text-green-400/70 uppercase tracking-wider">Pizarra</span>
      </div>
      {steps.slice(0, visibleSteps).map((step, i) => (
        <div key={i} className="animate-in fade-in slide-in-from-left duration-500">
          <p className="text-[12px] text-[#8bb8e8] mb-1">{step.text}</p>
          {step.math && (
            <div
              className="text-white text-center py-2"
              dangerouslySetInnerHTML={{
                __html: renderKatexSafe(step.math, true),
              }}
            />
          )}
        </div>
      ))}
      {typing && visibleSteps < steps.length && (
        <div className="flex items-center gap-1 text-[#8bb8e8]/50 text-xs">
          <span className="animate-pulse">✍️ escribiendo...</span>
        </div>
      )}
    </div>
  );
}

function renderKatexSafe(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      trust: true,
      strict: false,
    });
  } catch {
    return `<code class="text-yellow-300">${tex}</code>`;
  }
}

/**
 * Parsea un mensaje del maestro en Steps para la pizarra.
 * Busca patrones numerados (1. 2. 3.) y separa texto de math.
 */
export function parseSteps(message: string): Step[] {
  const lines = message.split("\n").filter((l) => l.trim());
  const steps: Step[] = [];
  let currentText = "";
  let currentMath = "";

  for (const line of lines) {
    const trimmed = line.trim();
    // Numbered step
    const numMatch = trimmed.match(/^(\d+)\.\s*\*?\*?(.+)/);
    if (numMatch) {
      if (currentText) steps.push({ text: currentText.trim(), math: currentMath || undefined });
      currentText = numMatch[2].replace(/\*\*/g, "");
      currentMath = "";
      continue;
    }
    // LaTeX block
    const mathMatch = trimmed.match(/^\$\$(.+)\$\$$/);
    if (mathMatch) {
      currentMath = mathMatch[1];
      continue;
    }
    // Inline equation line (starts with - or contains = prominently)
    if (/^[-•]\s/.test(trimmed) || /^\\/.test(trimmed)) {
      const clean = trimmed.replace(/^[-•]\s*/, "");
      if (/[=\\]/.test(clean)) {
        currentMath = (currentMath ? currentMath + " \\\\ " : "") + clean;
      } else {
        currentText += " " + clean;
      }
      continue;
    }
    currentText += " " + trimmed;
  }
  if (currentText) steps.push({ text: currentText.trim(), math: currentMath || undefined });
  if (steps.length === 0 && message.trim()) {
    steps.push({ text: message.trim() });
  }
  return steps;
}
