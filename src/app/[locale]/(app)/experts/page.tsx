"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useState, useMemo } from "react";
import { Search, Sparkles } from "lucide-react";

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
    fetch("/api/experts/list")
      .then((r) => r.json())
      .then((d) => {
        setExperts(d.experts || []);
        setCategories(d.categories || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const locale = (typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "es") as string;

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
    <div className="h-full overflow-y-auto bg-black text-white">
      <div className="px-4 pt-6 pb-4 sticky top-0 bg-black/95 backdrop-blur z-10 border-b border-gray-900">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <span className="text-xs text-gray-500 ml-auto">{experts.length} {t("expertsCount")}</span>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
              !activeCategory ? "bg-purple-600 text-white" : "bg-gray-900 text-gray-400 border border-gray-800"
            }`}
          >
            {t("all")} ({experts.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => setActiveCategory(c.category)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
                activeCategory === c.category
                  ? "bg-purple-600 text-white"
                  : "bg-gray-900 text-gray-400 border border-gray-800"
              }`}
            >
              {catLabel(c.category)} ({c.count})
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="text-center text-gray-500 py-12 text-sm">{t("loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-12 text-sm">{t("empty")}</div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filtered.map((e) => (
              <Link
                key={e.slug}
                href={`/experts/${e.slug}` as never}
                className="flex items-start gap-3 p-3 bg-gray-900/50 hover:bg-gray-900 border border-gray-800 rounded-xl transition"
              >
                <div className="text-2xl shrink-0">{e.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{e.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{e.description}</p>
                  <p className="text-[10px] text-purple-400 mt-1 uppercase tracking-wider">
                    {catLabel(e.category)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
