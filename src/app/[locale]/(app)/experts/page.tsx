"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useState, useMemo } from "react";
import { Search, Sparkles, ChevronRight } from "lucide-react";

interface ExpertMeta {
  slug: string;
  name: string;
  description: string;
  category: string;
  color: string;
  emoji: string;
  vibe: string;
}

interface CategoryCount {
  category: string;
  count: number;
}

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  academic: { es: "Académico", en: "Academic", fr: "Académique", it: "Accademico", de: "Akademisch" },
  design: { es: "Diseño", en: "Design", fr: "Design", it: "Design", de: "Design" },
  engineering: { es: "Ingeniería", en: "Engineering", fr: "Ingénierie", it: "Ingegneria", de: "Technik" },
  finance: { es: "Finanzas", en: "Finance", fr: "Finance", it: "Finanza", de: "Finanzen" },
  "game-development": { es: "Videojuegos", en: "Game Dev", fr: "Jeux Vidéo", it: "Videogiochi", de: "Spiele" },
  marketing: { es: "Marketing", en: "Marketing", fr: "Marketing", it: "Marketing", de: "Marketing" },
  "paid-media": { es: "Publicidad", en: "Paid Media", fr: "Média Payant", it: "Media a Pagamento", de: "Bezahlte Medien" },
  product: { es: "Producto", en: "Product", fr: "Produit", it: "Prodotto", de: "Produkt" },
  "project-management": { es: "Gestión", en: "PM", fr: "Gestion", it: "Gestione", de: "Management" },
  sales: { es: "Ventas", en: "Sales", fr: "Ventes", it: "Vendite", de: "Vertrieb" },
  "spatial-computing": { es: "AR/VR", en: "Spatial", fr: "AR/VR", it: "AR/VR", de: "AR/VR" },
  specialized: { es: "Especialistas", en: "Specialized", fr: "Spécialistes", it: "Specialisti", de: "Spezialisten" },
  support: { es: "Soporte", en: "Support", fr: "Support", it: "Supporto", de: "Support" },
  testing: { es: "Testing", en: "Testing", fr: "Tests", it: "Test", de: "Tests" },
};

export default function ExpertsPage() {
  const t = useTranslations("experts");
  const [experts, setExperts] = useState<ExpertMeta[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Static file on the CDN edge — ~10x faster than the serverless API route.
    // Falls back to /api/experts/list if the static file is missing (old deploys).
    fetch("/experts-meta.json")
      .then((r) => (r.ok ? r.json() : fetch("/api/experts/list").then((r2) => r2.json())))
      .then((d) => {
        setExperts(d.experts || []);
        setCategories(d.categories || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const locale =
    typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "es";

  const filtered = useMemo(() => {
    let out = experts;
    if (activeCategory) out = out.filter((e) => e.category === activeCategory);
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }
    return out;
  }, [experts, activeCategory, query]);

  const catLabel = (cat: string) =>
    CATEGORY_LABELS[cat]?.[locale] || CATEGORY_LABELS[cat]?.en || cat;

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-[var(--accent)]" />
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <span className="ml-auto text-xs text-[var(--dim)]">
            {experts.length} {t("expertsCount")}
          </span>
        </div>

        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2.5 text-sm placeholder-[var(--dim)] focus:outline-none focus:border-white/30"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
              !activeCategory
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg2)] text-[var(--dim)] border border-[var(--border)]"
            }`}
          >
            {t("all")} ({experts.length})
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.category}
              onClick={() => setActiveCategory(c.category)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                activeCategory === c.category
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg2)] text-[var(--dim)] border border-[var(--border)]"
              }`}
            >
              {catLabel(c.category)} ({c.count})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-[var(--dim)] py-12 text-sm">{t("loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-[var(--dim)] py-12 text-sm">{t("empty")}</div>
        ) : (
          <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
            {filtered.map((e) => (
              <Link
                key={e.slug}
                href={`/experts/${e.slug}` as never}
                className="flex items-center gap-3 px-3.5 py-3 active:bg-[var(--bg3)] transition"
              >
                <div className="text-2xl shrink-0 w-9 h-9 rounded-lg bg-[var(--bg3)] flex items-center justify-center">
                  {e.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{e.name}</p>
                  <p className="text-xs text-[var(--dim)] mt-0.5 line-clamp-1">
                    {e.description}
                  </p>
                  <p className="text-[10px] text-[var(--accent)] mt-1 uppercase tracking-wider">
                    {catLabel(e.category)}
                  </p>
                </div>
                <ChevronRight size={16} className="text-[var(--dim)] shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
