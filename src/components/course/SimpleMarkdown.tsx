import React from "react";

type Token =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "code"; value: string };

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: "text", value: line.slice(lastIndex, m.index) });
    }
    if (m[1]) tokens.push({ type: "strong", value: m[2] });
    else if (m[3]) tokens.push({ type: "em", value: m[4] });
    else if (m[5]) tokens.push({ type: "code", value: m[6] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) {
    tokens.push({ type: "text", value: line.slice(lastIndex) });
  }
  return tokens;
}

function renderTokens(tokens: Token[], keyPrefix: string): React.ReactNode[] {
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (t.type) {
      case "text":
        return <React.Fragment key={key}>{t.value}</React.Fragment>;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-slate-900 dark:text-slate-50">
            {t.value}
          </strong>
        );
      case "em":
        return (
          <em key={key} className="italic text-slate-800 dark:text-slate-200">
            {t.value}
          </em>
        );
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800 dark:bg-slate-800 dark:text-slate-200"
          >
            {t.value}
          </code>
        );
    }
  });
}

export function SimpleMarkdown({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="mb-5 text-lg leading-relaxed text-slate-700 dark:text-slate-300"
        >
          {renderTokens(tokenize(p), `p${i}`)}
        </p>
      ))}
    </>
  );
}

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}
