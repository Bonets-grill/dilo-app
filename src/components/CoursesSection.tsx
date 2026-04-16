"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Check, Loader2, BookOpen } from "lucide-react";

interface Course {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_emoji: string;
  price_eur: number;
  currency: string;
  pages: number;
  owned: boolean;
}

export default function CoursesSection({ userId }: { userId: string | null }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const url = userId ? `/api/cursos/list?userId=${userId}` : "/api/cursos/list";
        const res = await fetch(url);
        const d = await res.json();
        setCourses(d.courses || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading) {
    return (
      <div className="py-4 flex justify-center">
        <Loader2 size={18} className="animate-spin text-[var(--dim)]" />
      </div>
    );
  }

  if (!courses.length) return null;

  return (
    <div className="space-y-2.5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <BookOpen size={14} /> Cursos
      </h3>
      {courses.map((c) => (
        <Link
          key={c.slug}
          href={`/cursos/${c.slug}` as never}
          className="block rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3.5 active:bg-[var(--bg3)] transition"
        >
          <div className="flex items-start gap-3">
            <div className="text-3xl shrink-0">{c.cover_emoji}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{c.title}</p>
              {c.subtitle && (
                <p className="text-xs text-[var(--dim)] mt-0.5 line-clamp-1">{c.subtitle}</p>
              )}
              <p className="text-[10px] text-[var(--dim)] mt-1">{c.pages} páginas · PDF</p>
            </div>
            <div className="text-right">
              {c.owned ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-400">
                  <Check size={12} /> Desbloqueado
                </span>
              ) : (
                <span className="text-lg font-bold">{c.price_eur.toFixed(2)} €</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
