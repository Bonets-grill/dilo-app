"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkles, Loader2, Volume2, VolumeX, AlertCircle, ArrowLeft } from "lucide-react";

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

export default function HoroscopeByDatePage() {
  const locale = useLocale();
  const params = useParams<{ date: string }>();
  const date = params?.date;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [horoscope, setHoroscope] = useState<Horoscope | null>(null);
  const [zodiac, setZodiac] = useState<ZodiacInfo | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    } catch { return url; }
  }, [horoscope?.audio_url]);

  useEffect(() => () => {
    if (blobUrl?.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetch(`/api/horoscope/${date}`)
      .then(async (r) => {
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) { setError(d.error === "not_found" ? "No hay horóscopo para esa fecha" : (d.error || "No se pudo cargar")); return; }
        setHoroscope(d.horoscope);
        setZodiac(d.zodiac);
      })
      .catch(() => { if (!cancelled) setError("Error de red"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; audioRef.current?.pause(); };
  }, [date]);

  async function togglePlay() {
    if (!blobUrl) return;
    setAudioError("");
    if (playing) { audioRef.current?.pause(); setPlaying(false); return; }
    if (!audioRef.current) audioRef.current = new Audio(blobUrl);
    else audioRef.current.src = blobUrl;
    audioRef.current.onended = () => setPlaying(false);
    audioRef.current.onerror = () => {
      setPlaying(false);
      const e = audioRef.current?.error;
      setAudioError(e ? `MediaError code=${e.code} msg=${e.message || "(empty)"}` : "audio error");
    };
    try { await audioRef.current.play(); setPlaying(true); }
    catch (err) {
      setPlaying(false);
      setAudioError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 size={24} className="animate-spin text-purple-400" /></div>;
  }
  if (error || !horoscope || !zodiac) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm text-[var(--dim)]">{error || "Sin datos"}</p>
        <Link href={`/${locale}/horoscope/history`} className="text-xs text-purple-400 underline">Volver al historial</Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        <Link href={`/${locale}/horoscope/history`} className="flex items-center gap-1 text-xs text-[var(--dim)]">
          <ArrowLeft size={14} /> Historial
        </Link>

        <div className="text-center space-y-1">
          <div className="text-4xl">{zodiac.emoji}</div>
          <h1 className="text-xl font-semibold">{zodiac.name}</h1>
          <p className="text-[10px] text-[var(--dim)] uppercase tracking-wider">
            {new Date(horoscope.for_date).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {blobUrl && (
          <>
            <button type="button" onClick={togglePlay} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-purple-500/10 border border-purple-500/25 hover:bg-purple-500/20 active:scale-[0.98] transition">
              <div className="w-11 h-11 rounded-full bg-purple-500 text-white flex items-center justify-center flex-shrink-0">
                {playing ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Audio de motivación</p>
                <p className="text-[11px] text-[var(--dim)]">{playing ? "Reproduciendo..." : "Toca para escucharlo"}</p>
              </div>
              <Sparkles size={16} className="text-purple-400" />
            </button>
            <audio controls src={blobUrl} className="w-full mt-1 rounded-xl" preload="metadata" />
            {audioError && <p className="text-[11px] text-red-400 px-2">⚠ {audioError}</p>}
          </>
        )}

        <article className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4 text-sm leading-relaxed whitespace-pre-line">
          {horoscope.text}
        </article>
      </div>
    </div>
  );
}
