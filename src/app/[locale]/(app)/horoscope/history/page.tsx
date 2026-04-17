"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, ArrowLeft, ChevronRight } from "lucide-react";

interface HistoryItem {
  id: string;
  for_date: string;
  zodiac_sign: string;
  zodiac_name: string;
  zodiac_emoji: string;
  preview: string;
  meta: Record<string, unknown>;
}

export default function HoroscopeHistoryPage() {
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/horoscope/history")
      .then(async (r) => {
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) { setError(d.error || "No se pudo cargar"); return; }
        setItems(d.items || []);
      })
      .catch(() => { if (!cancelled) setError("Error de red"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("es", {
      weekday: "long", day: "numeric", month: "long",
    });
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        <div className="flex items-center gap-2">
          <Link href={`/${locale}/horoscope/today`} className="text-[var(--dim)]">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-semibold">Historial</h1>
        </div>

        {error && (
          <div className="flex flex-col items-center text-center py-12 gap-2">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-sm text-[var(--dim)]">{error}</p>
          </div>
        )}

        {!error && items.length === 0 && (
          <p className="text-center text-sm text-[var(--dim)] py-12">
            Aún no hay horóscopos guardados.
          </p>
        )}

        <div className="space-y-2">
          {items.map((it) => (
            <Link
              key={it.id}
              href={`/${locale}/horoscope/${it.for_date}`}
              className="block rounded-2xl bg-[var(--bg2)] border border-[var(--border)] hover:border-purple-500/40 transition"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/15 flex items-center justify-center text-xl flex-shrink-0">
                  {it.zodiac_emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--dim)]">
                    {formatDate(it.for_date)}
                  </p>
                  <p className="text-xs text-[var(--muted)] line-clamp-2">
                    {it.preview}
                  </p>
                </div>
                <ChevronRight size={16} className="text-[var(--dim)] flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
