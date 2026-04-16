"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, BookOpen, Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

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

  // Viewer
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
      <div className="flex-1 min-h-0 bg-black">
        {/* Proxy URL — same origin, bypasses Supabase Storage X-Frame-Options */}
        <iframe
          src={`/api/cursos/${slug}/file?userId=${userId}`}
          className="w-full h-full border-0"
          title={info.course?.title}
        />
      </div>
    </div>
  );
}
