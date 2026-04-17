"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Volume2, VolumeX, AlertCircle } from "lucide-react";

interface Meta {
  luckyColor?: string;
  luckyNumber?: number;
  compatibility?: string[];
  moonPhase?: string;
  tarot?: string;
}

interface Horoscope {
  id: string;
  text: string;
  audio_url: string | null;
  meta: Meta;
  zodiac_sign: string;
  for_date: string;
}

interface ZodiacInfo {
  key: string;
  name: string;
  emoji: string;
}

export default function HoroscopeTodayPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [horoscope, setHoroscope] = useState<Horoscope | null>(null);
  const [zodiac, setZodiac] = useState<ZodiacInfo | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/horoscope/today")
      .then(async (r) => {
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) { setError(d.error || "No se pudo cargar"); return; }
        setHoroscope(d.horoscope);
        setZodiac(d.zodiac);
      })
      .catch(() => { if (!cancelled) setError("Error de red"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; audioRef.current?.pause(); };
  }, []);

  async function togglePlay() {
    if (!horoscope?.audio_url) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio(horoscope.audio_url);
    else audioRef.current.src = horoscope.audio_url;
    audioRef.current.onended = () => setPlaying(false);
    audioRef.current.onerror = () => { setPlaying(false); };
    try { await audioRef.current.play(); setPlaying(true); }
    catch { setPlaying(false); }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 gap-3 text-center">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm text-[var(--dim)]">{error}</p>
      </div>
    );
  }

  if (!horoscope || !zodiac) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        <div className="text-center space-y-1">
          <div className="text-4xl">{zodiac.emoji}</div>
          <h1 className="text-xl font-semibold">{zodiac.name}</h1>
          <p className="text-[10px] text-[var(--dim)] uppercase tracking-wider">
            {new Date(horoscope.for_date).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {horoscope.audio_url && (
          <button
            type="button"
            onClick={togglePlay}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-purple-500/10 border border-purple-500/25 hover:bg-purple-500/20 active:scale-[0.98] transition"
          >
            <div className="w-11 h-11 rounded-full bg-purple-500 text-white flex items-center justify-center flex-shrink-0">
              {playing ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">Audio de motivación</p>
              <p className="text-[11px] text-[var(--dim)]">
                {playing ? "Reproduciendo..." : "Toca para escucharlo"}
              </p>
            </div>
            <Sparkles size={16} className="text-purple-400" />
          </button>
        )}

        <article className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4 text-sm leading-relaxed whitespace-pre-line">
          {horoscope.text}
        </article>

        {(horoscope.meta?.luckyColor || horoscope.meta?.luckyNumber || horoscope.meta?.moonPhase || (horoscope.meta?.compatibility?.length ?? 0) > 0) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {horoscope.meta.luckyColor && (
              <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3">
                <p className="text-[10px] uppercase text-[var(--dim)]">Color de suerte</p>
                <p className="font-medium">🎨 {horoscope.meta.luckyColor}</p>
              </div>
            )}
            {typeof horoscope.meta.luckyNumber === "number" && (
              <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3">
                <p className="text-[10px] uppercase text-[var(--dim)]">Número sagrado</p>
                <p className="font-medium">🔢 {horoscope.meta.luckyNumber}</p>
              </div>
            )}
            {horoscope.meta.moonPhase && (
              <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3">
                <p className="text-[10px] uppercase text-[var(--dim)]">Fase lunar</p>
                <p className="font-medium">🌙 {horoscope.meta.moonPhase}</p>
              </div>
            )}
            {horoscope.meta.compatibility && horoscope.meta.compatibility.length > 0 && (
              <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3">
                <p className="text-[10px] uppercase text-[var(--dim)]">Compatibilidad</p>
                <p className="font-medium">🤝 {horoscope.meta.compatibility.join(", ")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
