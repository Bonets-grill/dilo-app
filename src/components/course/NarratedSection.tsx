"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProgress } from "@/lib/progress/store";

export type NarratedSectionProps = {
  chapterSlug: string;
  id: string;
  heading?: string;
  audioUrl?: string;
  sourcePage?: number | string;
  children: React.ReactNode;
};

export function NarratedSection(props: NarratedSectionProps) {
  const { chapterSlug, id, heading, audioUrl, children } = props;
  const sourcePage =
    typeof props.sourcePage === "string"
      ? Number.parseInt(props.sourcePage, 10) || undefined
      : props.sourcePage;
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const markSectionViewed = useProgress((s) => s.markSectionViewed);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            markSectionViewed(chapterSlug, id);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.6] },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [chapterSlug, id, markSectionViewed]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      if (a.duration > 0) setProgress((a.currentTime / a.duration) * 100);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, [audioUrl]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      try {
        await a.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  };

  return (
    <section
      ref={sectionRef}
      id={`section-${id}`}
      data-section-id={id}
      className="relative my-10 scroll-mt-24"
    >
      {heading && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {heading}
          </h2>
          {audioUrl ? (
            <button
              type="button"
              onClick={toggle}
              className={cn(
                "group inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                playing
                  ? "border-indigo-500 bg-indigo-600 text-white shadow"
                  : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
              )}
              aria-label={playing ? "Pausar narración" : "Escuchar narración"}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <Volume2 className="h-3.5 w-3.5 opacity-80" />
              {playing ? "Pausar" : "Escuchar"}
            </button>
          ) : (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
              title="Audio no generado todavía"
            >
              <VolumeX className="h-3.5 w-3.5" /> sin voz
            </span>
          )}
        </div>
      )}

      {audioUrl && (
        <>
          <audio ref={audioRef} src={audioUrl} preload="none" />
          <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      )}

      <div className="max-w-none leading-relaxed">{children}</div>

      {sourcePage && (
        <div className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          📖 pág. {sourcePage} del libro fuente
        </div>
      )}
    </section>
  );
}
