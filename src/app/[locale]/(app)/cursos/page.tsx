"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { BookOpen, Check, Lock, Loader2 } from "lucide-react";

interface Course {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_emoji: string;
  price_eur: number;
  pages: number;
  owned: boolean;
}

export default function CursosIndexPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      const url = uid ? `/api/cursos/list?userId=${uid}` : "/api/cursos/list";
      const res = await fetch(url);
      const d = await res.json();
      setCourses(d.courses || []);
      setLoading(false);
    })();
  }, []);

  const owned = courses.filter((c) => c.owned);
  const available = courses.filter((c) => !c.owned);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[var(--dim)]" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-[var(--accent)]" />
          <h1 className="text-xl font-bold">Cursos</h1>
        </div>

        {owned.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--dim)] mb-2">
              Desbloqueados
            </h2>
            <div className="space-y-2">
              {owned.map((c) => (
                <Link
                  key={c.slug}
                  href={`/cursos/${c.slug}` as never}
                  className="block rounded-xl bg-[var(--bg2)] border border-green-500/30 p-3.5 active:bg-[var(--bg3)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{c.cover_emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{c.title}</p>
                      {c.subtitle && (
                        <p className="text-xs text-[var(--dim)] mt-0.5">{c.subtitle}</p>
                      )}
                      <p className="text-[10px] text-[var(--dim)] mt-1">{c.pages} páginas</p>
                    </div>
                    <Check size={16} className="text-green-400 shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {available.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--dim)] mb-2">
              Disponibles
            </h2>
            <div className="space-y-2">
              {available.map((c) => (
                <Link
                  key={c.slug}
                  href={`/cursos/${c.slug}` as never}
                  className="block rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3.5 active:bg-[var(--bg3)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{c.cover_emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{c.title}</p>
                      {c.subtitle && (
                        <p className="text-xs text-[var(--dim)] mt-0.5">{c.subtitle}</p>
                      )}
                      <p className="text-[10px] text-[var(--dim)] mt-1">
                        {c.pages} páginas · {c.price_eur.toFixed(2)} €
                      </p>
                    </div>
                    <Lock size={14} className="text-[var(--dim)] shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {courses.length === 0 && (
          <p className="text-sm text-[var(--dim)] text-center py-8">
            Todavía no hay cursos disponibles.
          </p>
        )}
      </div>
    </div>
  );
}
