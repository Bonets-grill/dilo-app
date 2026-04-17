"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CHAPTERS, PARTS } from "@/lib/course/slugs";
import { useProgress } from "@/lib/progress/store";
import { BookOpen, Menu, X, Check } from "lucide-react";

interface Props {
  /** Slug del curso, ej. "claude-de-cero-a-cien" */
  courseSlug: string;
  /** Locale actual para construir URLs, ej. "es" */
  locale: string;
}

/**
 * Sidebar de índice de curso con progreso visual.
 *
 * Desktop: toggle "Índice" abre drawer lateral desde la izquierda.
 * Mobile: mismo toggle, drawer full-width.
 *
 * El estado de progreso lo lee de `useProgress` (Zustand + IndexedDB).
 * Para cada capítulo muestra un check verde si hay ≥1 sección vista,
 * o un dot azul si es el capítulo activo.
 */
export function CourseSidebar({ courseSlug, locale }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const chaptersProgress = useProgress((s) => s.chapters);

  // Avoid hydration mismatch — IndexedDB only populates after mount
  useEffect(() => setHydrated(true), []);

  // Close drawer on nav
  useEffect(() => setOpen(false), [pathname]);

  const chapterPath = (chapterSlug: string) =>
    `/${locale}/cursos/${courseSlug}/c/${chapterSlug}`;

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-30 flex items-center gap-1.5 rounded-full bg-[var(--bg2)]/90 backdrop-blur border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--fg)] shadow-lg hover:border-[var(--accent)]/40 transition md:left-4 md:top-4"
        aria-label="Abrir índice del curso"
      >
        <Menu size={14} />
        <span>Índice</span>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 w-80 max-w-[85vw] overflow-y-auto overscroll-contain bg-[var(--bg)] border-r border-[var(--border)] transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold">Índice</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 rounded-md text-[var(--dim)] hover:text-[var(--fg)]"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-5">
          {PARTS.map((part) => {
            const chapters = CHAPTERS.filter((c) => c.part === part.id);
            if (chapters.length === 0) return null;
            return (
              <section key={part.id}>
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dim)]">
                  {part.label}
                </h3>
                <ul className="space-y-0.5">
                  {chapters.map((ch) => {
                    const href = chapterPath(ch.slug);
                    const active = pathname === href;
                    const prog = hydrated ? chaptersProgress[ch.slug] : undefined;
                    const visited = !!prog && prog.sectionsViewed.length > 0;
                    return (
                      <li key={ch.slug}>
                        <Link
                          href={href}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                            active
                              ? "bg-[var(--accent)]/15 text-[var(--accent)] font-semibold"
                              : "text-[var(--fg)] hover:bg-[var(--bg2)]"
                          }`}
                        >
                          <span className="w-5 text-right font-mono text-[10px] text-[var(--dim)]">
                            {String(ch.chapterNumber).padStart(2, "0")}
                          </span>
                          {visited ? (
                            <Check size={13} className="text-emerald-400 flex-shrink-0" />
                          ) : (
                            <span className="w-3 h-3 rounded-full border border-[var(--dim)]/30 flex-shrink-0" />
                          )}
                          <span className="flex-1 truncate">{ch.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </aside>
    </>
  );
}
