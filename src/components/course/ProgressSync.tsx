"use client";

import { useEffect, useRef } from "react";
import { useProgress, type ChapterProgress } from "@/lib/progress/store";

interface Props {
  courseSlug: string;
}

/**
 * Mount-once component que sincroniza el progreso IndexedDB con Supabase.
 *
 * Flow:
 *  1. On mount → GET /api/cursos/[slug]/progress.
 *     Si el estado remoto es más reciente que la última modificación local
 *     (comparando updated_at remoto vs max(lastOpenedAt) local), hidrata
 *     el store con el remoto.
 *  2. Al cambiar el store (subscribe), debounce 3s → PUT al server con el
 *     state completo.
 *
 * Mount this once per lesson page (el efecto gate evita doble-sync si el
 * componente se re-renderiza).
 */
export function ProgressSync({ courseSlug }: Props) {
  const hydratedRef = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Pull on mount
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cursos/${courseSlug}/progress`, { cache: "no-store" });
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled || !d.state) return;
        const remoteChapters = (d.state as { chapters?: Record<string, ChapterProgress> })?.chapters;
        if (!remoteChapters) return;
        const local = useProgress.getState().chapters;
        const maxRemote = maxDate(remoteChapters);
        const maxLocal = maxDate(local);
        if (maxRemote > maxLocal) {
          // Remote is fresher → replace local. Merge is too tricky to do
          // correctly with quizzes/tasks/sections (different timestamps per
          // entry) without building a CRDT.
          useProgress.setState({ chapters: remoteChapters });
        }
      } catch (err) {
        console.warn("[course.sync] pull failed", err);
      }
    })();
    return () => { cancelled = true; };
  }, [courseSlug]);

  // 2. Push debounced on any change
  useEffect(() => {
    const unsub = useProgress.subscribe((state) => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(async () => {
        try {
          await fetch(`/api/cursos/${courseSlug}/progress`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: { chapters: state.chapters } }),
          });
        } catch (err) {
          console.warn("[course.sync] push failed", err);
        }
      }, 3000);
    });
    return () => {
      unsub();
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [courseSlug]);

  return null;
}

function maxDate(chapters: Record<string, ChapterProgress>): number {
  let max = 0;
  for (const k of Object.keys(chapters)) {
    const t = Date.parse(chapters[k].lastOpenedAt || "");
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max;
}
