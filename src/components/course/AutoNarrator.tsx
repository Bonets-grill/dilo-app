"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  audioUrl?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  chapterSlug?: string;
  className?: string;
};

export function AutoNarrator({
  audioUrl,
  autoPlay = true,
  onEnded,
  chapterSlug,
  className,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const playAudio = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    try {
      await a.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, []);

  const pauseAudio = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (playing) pauseAudio();
    else void playAudio();
  }, [playing, pauseAudio, playAudio]);

  // Al cambiar audioUrl, reset + autoplay si corresponde.
  // Guardamos el audioUrl objetivo en el cleanup para evitar que un
  // setTimeout de un render anterior dispare play() sobre un audio
  // pausado por un render nuevo (navegación rápida con flechas).
  useEffect(() => {
    const a = audioRef.current;
    if (!a) {
      setPlaying(false);
      setProgress(0);
      return;
    }
    let cancelled = false;
    a.pause();
    a.currentTime = 0;
    setPlaying(false);
    setProgress(0);
    if (!audioUrl || !autoPlay) return;
    const t = setTimeout(() => {
      if (!cancelled) void playAudio();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [audioUrl, autoPlay, playAudio]);

  // Listeners del elemento audio
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      if (a.duration > 0) setProgress((a.currentTime / a.duration) * 100);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(100);
      onEnded?.();
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [audioUrl, onEnded]);

  if (!audioUrl) {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40",
          className,
        )}
      >
        <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200">
          <AlertCircle className="h-4 w-4" />
          Voz no generada aún para este paso
        </div>
        <div className="text-amber-900/80 dark:text-amber-200/80">
          La voz del maestro se genera una sola vez con OpenAI TTS y se guarda en{" "}
          <code className="rounded bg-amber-100 px-1 text-xs dark:bg-amber-950">
            public/audio/
          </code>{" "}
          (cache sha256, gasto una única vez). Para generarla:
        </div>
        <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-100">
{`# 1. Pon tu key en .env.local
echo "OPENAI_API_KEY=sk-..." >> .env.local

# 2. Genera la voz del capítulo (una sola vez)
npm run voice:gen -- --chapter ${chapterSlug ? "N" : "1"}`}
        </pre>
        <div className="text-xs text-amber-900/70 dark:text-amber-200/70">
          También puedes lanzarlo desde <code>/admin/generate</code>.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <audio ref={audioRef} src={audioUrl} preload="auto" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
            playing
              ? "bg-indigo-600 text-white shadow-lg"
              : "border border-slate-300 bg-white text-slate-800 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
          )}
          aria-label={playing ? "Pausar narración" : "Escuchar narración"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          <Volume2 className="h-4 w-4 opacity-80" />
          {playing ? "Pausar" : "Escuchar"}
        </button>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

