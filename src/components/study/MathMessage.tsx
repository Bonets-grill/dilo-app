"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Renderiza un mensaje del maestro convirtiendo LaTeX a HTML con KaTeX.
 * Soporta:
 *  - $$...$$ → display mode (bloque centrado)
 *  - $...$ → inline
 *  - \begin{...}...\end{...} → display mode
 *  - \(...\) → inline
 *  - \[...\] → display mode
 */
export default function MathMessage({ text }: { text: string }) {
  const html = useMemo(() => renderMath(text), [text]);
  return (
    <div
      className="math-msg text-[13px] leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMath(input: string): string {
  if (!input) return "";
  let result = input;

  // Display: $$...$$
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => renderKatex(tex, true));

  // Display: \[...\]
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => renderKatex(tex, true));

  // Display: \begin{...}...\end{...}
  result = result.replace(/(\\begin\{[\s\S]+?\\end\{[^}]+\})/g, (_, tex) => renderKatex(tex, true));

  // Inline: \(...\)
  result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => renderKatex(tex, false));

  // Inline: $...$  (careful not to match $$)
  result = result.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, tex) => renderKatex(tex, false));

  // Convert markdown bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Convert newlines
  result = result.replace(/\n/g, "<br/>");

  return result;
}

function renderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      trust: true,
      strict: false,
    });
  } catch {
    return `<code>${tex}</code>`;
  }
}
