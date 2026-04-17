"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, Volume2, VolumeX, AlertCircle, Clock } from "lucide-react";

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
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [horoscope, setHoroscope] = useState<Horoscope | null>(null);
  const [zodiac, setZodiac] = useState<ZodiacInfo | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Safari se niega a reproducir data:audio/mpeg de >~500KB en <audio>. Como
  // el TTS de 30-40s pesa ~1.3MB, lo convertimos a blob: URL en cliente:
  // - data:audio/mpeg;base64,XXX → Uint8Array → Blob → URL.createObjectURL
  // - Safari reproduce blobs sin límite de tamaño.
  const blobUrl = useMemo(() => {
    const url = horoscope?.audio_url;
    if (!url || !url.startsWith("data:")) return url || null;
    try {
      const m = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return url;
      const [, mime, b64] = m;
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: mime }));
    } catch (err) {
      console.error("[horoscope.audio] blob convert failed", err);
      return url;
    }
  }, [horoscope?.audio_url]);

  useEffect(() => () => {
    if (blobUrl?.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

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
    if (!blobUrl) return;
    setAudioError("");
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio(blobUrl);
    else audioRef.current.src = blobUrl;
    audioRef.current.onended = () => setPlaying(false);
    audioRef.current.onerror = () => {
      setPlaying(false);
      const e = audioRef.current?.error;
      const msg = e ? `MediaError code=${e.code} msg=${e.message || "(empty)"}` : "audio element error";
      console.error("[horoscope.audio]", msg, "src_prefix=", audioRef.current?.src?.slice(0, 40));
      setAudioError(msg);
    };
    try {
      await audioRef.current.play();
      setPlaying(true);
    } catch (err) {
      setPlaying(false);
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error("[horoscope.audio.play]", msg);
      setAudioError(msg);
    }
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

        {blobUrl && (
          <>
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
            {/* Nativo <audio controls> como backup con blob: URL (Safari
                reproduce blob: sin límite, a diferencia de data:). */}
            <audio controls src={blobUrl} className="w-full mt-1 rounded-xl" preload="metadata" />
            {audioError && (
              <p className="text-[11px] text-red-400 px-2">
                ⚠ {audioError}
              </p>
            )}
          </>
        )}

        <Link
          href={`/${locale}/horoscope/history`}
          className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--dim)] hover:text-[var(--fg)] py-2"
        >
          <Clock size={12} /> Ver horóscopos anteriores
        </Link>

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
