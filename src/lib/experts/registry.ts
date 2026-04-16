import agentsData from "./data/agents.json";

export type ExpertCategory =
  | "academic" | "design" | "engineering" | "finance" | "game-development"
  | "marketing" | "paid-media" | "product" | "project-management" | "sales"
  | "spatial-computing" | "specialized" | "support" | "testing";

export interface Expert {
  slug: string;
  name: string;
  description: string;
  category: ExpertCategory;
  color: string;
  emoji: string;
  vibe: string;
  tools_declared: string[] | null;
  system_prompt: string;
}

const ALL: Expert[] = agentsData as Expert[];
const BY_SLUG = new Map(ALL.map((a) => [a.slug, a]));

export function getAllExperts(): Expert[] {
  return ALL;
}

export function getExpertBySlug(slug: string): Expert | undefined {
  return BY_SLUG.get(slug);
}

export interface ListOptions {
  category?: ExpertCategory;
  query?: string;
  limit?: number;
}

export function listExperts(opts: ListOptions = {}): Expert[] {
  let out = ALL;
  if (opts.category) out = out.filter((a) => a.category === opts.category);
  if (opts.query) {
    const q = opts.query.toLowerCase();
    out = out.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.vibe.toLowerCase().includes(q)
    );
  }
  if (opts.limit && opts.limit > 0) out = out.slice(0, opts.limit);
  return out;
}

export function listCategories(): { category: ExpertCategory; count: number }[] {
  const counts = new Map<ExpertCategory, number>();
  for (const a of ALL) counts.set(a.category, (counts.get(a.category) || 0) + 1);
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function getMeta(): Array<Omit<Expert, "system_prompt">> {
  return ALL.map(({ system_prompt: _sp, ...meta }) => meta);
}
