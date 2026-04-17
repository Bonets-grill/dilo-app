"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, BookOpen, Lock, PlayCircle, CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { CHAPTERS, PARTS } from "@/lib/course/slugs";

// react-pdf usa APIs del DOM — cargar solo en cliente
const CoursePDFViewer = dynamic(() => import("@/components/CoursePDFViewer"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
    </div>
  ),
});

interface AccessInfo {
  owned: boolean;
  course?: {
    slug: string;
    title: string;
    subtitle?: string;
    pages?: number;
    price_eur?: number;
    currency?: string;
  };
  url?: string;
  message?: string;
}

export default function CursoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [info, setInfo] = useState<AccessInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setLoading(false);
        return;
      }
      setUserId(data.user.id);
      const res = await fetch(`/api/cursos/${slug}/access?userId=${data.user.id}`);
      const json = await res.json();
      setInfo({ owned: res.status === 200, ...json });
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-[var(--dim)]">Inicia sesión para ver este curso.</p>
      </div>
    );
  }

  // Paywall
  if (!info?.owned) {
    const c = info?.course;
    return (
      <div className="h-full overflow-y-auto">
        <div className="px-4 py-6 max-w-md mx-auto space-y-5">
          <Link href="/store" className="text-xs text-[var(--dim)] flex items-center gap-1.5">
            <ArrowLeft size={12} /> Volver
          </Link>

          <div className="text-center py-6">
            <div className="text-6xl mb-3">📘</div>
            <h1 className="text-2xl font-bold">{c?.title || "Curso"}</h1>
            {c?.subtitle && <p className="text-sm text-[var(--dim)] mt-1">{c.subtitle}</p>}
            <p className="text-[11px] text-[var(--dim)] mt-2">{c?.pages} páginas · PDF</p>
          </div>

          <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-[var(--dim)]">
              <Lock size={14} />
              <span className="text-xs">Curso bloqueado</span>
            </div>
            <p className="text-sm">
              Para acceder al curso necesitas comprarlo una vez. Acceso de por vida
              después de la compra.
            </p>
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <span className="text-2xl font-bold">
                {c?.price_eur?.toFixed(2)} €
              </span>
              <button
                type="button"
                disabled
                className="px-5 py-2.5 rounded-full bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-60"
                title="Stripe Checkout próximamente — usa el endpoint admin unlock mientras tanto"
              >
                Comprar (próx.)
              </button>
            </div>
            <p className="text-[10px] text-[var(--dim)] pt-2">
              Checkout con Stripe en breve. Mientras, contacta a soporte para
              desbloquear.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Curso interactivo MDX (solo claude-de-cero-a-cien por ahora)
  if (slug === "claude-de-cero-a-cien") {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
          <div className="flex items-center gap-3">
            <Link href="/store" className="text-[var(--dim)]">
              <ArrowLeft size={18} />
            </Link>
            <BookOpen size={18} className="text-[var(--accent)]" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold">{info.course?.title}</p>
              <p className="text-[11px] text-[var(--dim)]">25 capítulos · MDX narrado</p>
            </div>
          </div>

          <Link
            href={`/cursos/${slug}/c/que-es-claude` as never}
            className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-500/15 to-purple-500/15 border border-indigo-500/30 hover:border-indigo-500/50 transition"
          >
            <PlayCircle size={32} className="text-indigo-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Empezar por el principio</p>
              <p className="text-[11px] text-[var(--dim)]">Capítulo 1 — Qué es Claude</p>
            </div>
          </Link>

          {PARTS.map((part) => {
            const chapters = CHAPTERS.filter((c) => c.part === part.id);
            if (chapters.length === 0) return null;
            return (
              <section key={part.id}>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dim)] mb-2">
                  {part.label}
                </h3>
                <div className="space-y-1">
                  {chapters.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/cursos/${slug}/c/${c.slug}` as never}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--bg2)] transition"
                    >
                      <span className="text-[10px] font-mono text-[var(--dim)] w-6 text-right">
                        {c.chapterNumber.toString().padStart(2, "0")}
                      </span>
                      <CheckCircle2 size={14} className="text-[var(--dim)] opacity-30 flex-shrink-0" />
                      <span className="text-sm flex-1">{c.title}</span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  // PDF viewer (fallback para otros cursos que sigan siendo PDF)
  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b border-[var(--border)]">
        <Link href="/store" className="text-[var(--dim)]">
          <ArrowLeft size={20} />
        </Link>
        <BookOpen size={16} className="text-[var(--accent)]" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{info.course?.title}</p>
          <p className="text-[10px] text-[var(--dim)]">{info.course?.pages} páginas</p>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <CoursePDFViewer src={`/api/cursos/${slug}/file?userId=${userId}`} />
      </div>
    </div>
  );
}
