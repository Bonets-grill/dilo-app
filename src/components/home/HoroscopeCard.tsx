"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Sparkles, ChevronRight } from "lucide-react";

type Zodiac = {
  sign?: string | null;
  name?: string | null;
  emoji?: string | null;
} | null;

/**
 * Compact card that links to /horoscope/today. Fetches the user's zodiac
 * to show the right emoji + name. Silently hides on any error or if the
 * user has no birthdate yet (the app gate will catch that elsewhere).
 *
 * Safe to mount on any authenticated page — it only renders after the
 * fetch succeeds and the horoscope is available.
 */
export default function HoroscopeCard() {
  const locale = useLocale();
  const [zodiac, setZodiac] = useState<Zodiac>(null);
  const [hasReading, setHasReading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/horoscope/today", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { zodiac?: Zodiac; horoscope?: { id?: string } };
        if (cancelled) return;
        if (data?.zodiac) setZodiac(data.zodiac);
        if (data?.horoscope?.id) setHasReading(true);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!zodiac?.sign) return null;

  return (
    <Link
      href={`/${locale}/horoscope/today`}
      className="block mx-4 mb-3 rounded-2xl bg-gradient-to-r from-purple-500/20 via-fuchsia-500/15 to-amber-500/15 border border-white/10 hover:border-white/20 transition-colors"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl">
          {zodiac.emoji || "✨"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles size={13} className="text-amber-300" />
            Tu horóscopo de hoy
          </p>
          <p className="text-xs text-[var(--dim)] truncate">
            {hasReading ? "Audio y lectura listos" : "Generar para"} {zodiac.name || zodiac.sign}
          </p>
        </div>
        <ChevronRight size={18} className="text-[var(--dim)]" />
      </div>
    </Link>
  );
}
