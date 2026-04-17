import type { Part } from "./schema";

export type ChapterEntry = {
  chapterNumber: number;
  slug: string;
  title: string;
  part: Part;
};

export const CHAPTERS: ChapterEntry[] = [
  { chapterNumber: 1, slug: "que-es-claude", title: "Qué es Claude", part: "fundamentos" },
  { chapterNumber: 2, slug: "primeros-pasos", title: "Primeros Pasos con Claude", part: "fundamentos" },
  { chapterNumber: 3, slug: "modelos-de-claude", title: "Los Modelos de Claude", part: "fundamentos" },
  { chapterNumber: 4, slug: "prompting-basico", title: "Prompting Básico", part: "fundamentos" },
  { chapterNumber: 5, slug: "interfaz-claude-ai", title: "La Interfaz de Claude.ai", part: "claude-ai" },
  { chapterNumber: 6, slug: "proyectos", title: "Proyectos y Organización", part: "claude-ai" },
  { chapterNumber: 7, slug: "artifacts", title: "Artifacts: Crea Cosas Reales con Claude", part: "claude-ai" },
  { chapterNumber: 8, slug: "memoria", title: "Memoria y Personalización", part: "claude-ai" },
  { chapterNumber: 9, slug: "archivos-busqueda", title: "Archivos, Búsqueda y Conversaciones", part: "claude-ai" },
  { chapterNumber: 10, slug: "planes-y-precios", title: "Planes y Precios", part: "claude-ai" },
  { chapterNumber: 11, slug: "empezar-claude-code", title: "Empezar con Claude Code", part: "claude-code" },
  { chapterNumber: 12, slug: "comandos-cli", title: "Comandos y Flags del CLI", part: "claude-code" },
  { chapterNumber: 13, slug: "config-settings", title: "Configuración y Settings", part: "claude-code" },
  { chapterNumber: 14, slug: "claude-md-memoria", title: "CLAUDE.md y Memoria del Proyecto", part: "claude-code" },
  { chapterNumber: 15, slug: "permisos-seguridad", title: "Permisos y Seguridad", part: "claude-code" },
  { chapterNumber: 16, slug: "skills-slash", title: "Skills y Slash Commands", part: "claude-code" },
  { chapterNumber: 17, slug: "hooks", title: "Hooks", part: "claude-code" },
  { chapterNumber: 18, slug: "mcp-servers", title: "MCP Servers", part: "claude-code" },
  { chapterNumber: 19, slug: "integraciones-ide", title: "Integraciones con IDEs", part: "claude-code" },
  { chapterNumber: 20, slug: "agentes", title: "Agentes y Subagentes", part: "claude-code" },
  { chapterNumber: 21, slug: "api-claude", title: "La API de Claude", part: "avanzado" },
  { chapterNumber: 22, slug: "construir-con-claude", title: "Construir con Claude", part: "avanzado" },
  { chapterNumber: 23, slug: "cowork-automatizacion", title: "Cowork y Automatización", part: "avanzado" },
  { chapterNumber: 24, slug: "enterprise", title: "Enterprise y Equipos", part: "avanzado" },
  { chapterNumber: 25, slug: "troubleshooting", title: "Troubleshooting y Mejores Prácticas", part: "avanzado" },
];

export function findChapterBySlug(slug: string): ChapterEntry | undefined {
  return CHAPTERS.find((c) => c.slug === slug);
}

export function findChapterByNumber(n: number): ChapterEntry | undefined {
  return CHAPTERS.find((c) => c.chapterNumber === n);
}

export const PARTS: Array<{ id: Part; label: string }> = [
  { id: "fundamentos", label: "Parte 1 · Fundamentos" },
  { id: "claude-ai", label: "Parte 2 · Claude.ai en profundidad" },
  { id: "claude-code", label: "Parte 3 · Claude Code" },
  { id: "avanzado", label: "Parte 4 · Avanzado y Desarrollador" },
];
