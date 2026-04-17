import type { AudioManifest } from "./schema";

export type GuidedStep =
  | {
      type: "narrated";
      id: string;
      heading?: string;
      sourcePage?: number;
      body: string;
    }
  | {
      type: "quiz";
      id: string;
      question: string;
      options: string[];
      correctIndex: number[];
      explanation: string;
      multiple: boolean;
    }
  | {
      type: "task";
      id: string;
      instruction: string;
      command?: string;
      expectedOutcome: string;
      verifyHint?: string;
    }
  | {
      type: "artifact";
      id: string;
      url: string;
      title: string;
      fallbackDescription: string;
    };

function parseAttrs(attrString: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /([a-zA-Z][a-zA-Z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString)) !== null) {
    const [, name, dq, sq, expr] = m;
    result[name] = dq ?? sq ?? (expr ? expr.trim() : "");
  }
  return result;
}

function tolerantParseOptions(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const decoded = raw.replace(/&apos;/g, "'");
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split("|").map((s) => s.trim()).filter(Boolean);
  }
}

function tolerantParseCorrect(raw: string | undefined): number[] {
  if (!raw) return [];
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

export function parseMdxSteps(mdxBody: string): GuidedStep[] {
  const steps: GuidedStep[] = [];
  const re =
    /<(NarratedSection|Quiz|TerminalTask|ArtifactEmbed)((?:\s[^>]*?)?)(?:\s*\/>|>([\s\S]*?)<\/\1>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mdxBody)) !== null) {
    const [, tag, attrRaw, body] = m;
    const attrs = parseAttrs(attrRaw ?? "");
    switch (tag) {
      case "NarratedSection":
        steps.push({
          type: "narrated",
          id: attrs.id ?? `narrated-${steps.length}`,
          heading: attrs.heading,
          sourcePage: attrs.sourcePage ? Number(attrs.sourcePage) : undefined,
          body: (body ?? "").trim(),
        });
        break;
      case "Quiz": {
        const options = tolerantParseOptions(attrs.options);
        const correctIndex = tolerantParseCorrect(attrs.correctIndex);
        if (options.length === 0 || correctIndex.length === 0) continue;
        steps.push({
          type: "quiz",
          id: attrs.id ?? `quiz-${steps.length}`,
          question: attrs.question ?? "",
          options,
          correctIndex,
          explanation: attrs.explanation ?? "",
          multiple: attrs.multiple === "true",
        });
        break;
      }
      case "TerminalTask":
        steps.push({
          type: "task",
          id: attrs.id ?? `task-${steps.length}`,
          instruction: attrs.instruction ?? "",
          command: attrs.command,
          expectedOutcome: attrs.expectedOutcome ?? "",
          verifyHint: attrs.verifyHint,
        });
        break;
      case "ArtifactEmbed":
        steps.push({
          type: "artifact",
          id: attrs.id ?? `artifact-${steps.length}`,
          url: attrs.url ?? "#",
          title: attrs.title ?? "",
          fallbackDescription: attrs.fallbackDescription ?? "",
        });
        break;
    }
  }
  return steps;
}

/**
 * Construye un índice sectionId → audio URL público.
 * Normaliza las URLs a rutas que Next sirve desde /public (p. ej. `/audio/cap-01/...mp3`).
 * Si varios chunks comparten sectionId, se queda con el primero (sección única).
 */
export function buildAudioIndex(
  manifest: AudioManifest | null,
): Record<string, string> {
  const index: Record<string, string> = {};
  if (!manifest) return index;
  for (const c of manifest.chunks) {
    if (!index[c.sectionId]) {
      index[c.sectionId] = `/${c.url.replace(/^\/+/, "")}`;
    }
  }
  return index;
}
