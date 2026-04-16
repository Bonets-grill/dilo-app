"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Listens for a wake word ("hola DILO", "oye DILO", "ey DILO", "hey DILO")
 * using the browser's WebSpeech API. When detected, calls onWake(). Runs
 * fully local — no audio goes to any server while listening, so zero cost.
 *
 * iOS/Safari caveats:
 *  - Only works while the page is in the foreground.
 *  - Safari occasionally stops recognition silently after 30–60s; we auto
 *    restart on `end` events to keep the loop alive.
 *  - Requires mic permission, prompted the first time the listener starts.
 *
 * Toggle via localStorage key "dilo_wake_word". Default OFF (opt-in because
 * continuous listening is a privacy-sensitive behavior).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: any = typeof window !== "undefined"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  : null;

const WAKE_PATTERNS = [
  /\b(hola|oye|ey|hey|hola\s+a)\s+d[ií]lo\b/i,
  /\bd[ií]lo\s*,\s*(oye|escucha|atiende)/i,
];

function matchesWake(transcript: string): boolean {
  return WAKE_PATTERNS.some((re) => re.test(transcript));
}

interface Props {
  onWake: () => void;
  enabled: boolean;
  active?: boolean; // cuando VoiceRealtime ya está abierta, pausamos el listener
}

export default function WakeWordListener({ onWake, enabled, active }: Props) {
  const [status, setStatus] = useState<"off" | "listening" | "error" | "denied">("off");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const shouldListenRef = useRef(false);

  useEffect(() => {
    // Pausa cuando el overlay de voz está activo (evita captar doble)
    shouldListenRef.current = enabled && !active;
    if (!enabled || active) {
      try { recRef.current?.stop(); } catch { /* ignore */ }
      setStatus("off");
      return;
    }

    if (!SR) {
      setStatus("error");
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "es-ES";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const transcript = ev.results[i][0].transcript;
        if (matchesWake(transcript)) {
          try { rec.stop(); } catch { /* ignore */ }
          shouldListenRef.current = false;
          setStatus("off");
          onWake();
          return;
        }
      }
    };

    rec.onerror = (ev: { error?: string }) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setStatus("denied");
        shouldListenRef.current = false;
        return;
      }
      // otros errores (no-speech, network) → reiniciamos
    };

    rec.onend = () => {
      // Safari corta en silencio a veces — relanzamos si seguimos debiendo escuchar
      if (shouldListenRef.current) {
        try { rec.start(); } catch { /* ignore */ }
      } else {
        setStatus("off");
      }
    };

    try {
      rec.start();
      setStatus("listening");
      recRef.current = rec;
    } catch {
      setStatus("error");
    }

    return () => {
      shouldListenRef.current = false;
      try { rec.stop(); } catch { /* ignore */ }
    };
  }, [enabled, active, onWake]);

  if (!enabled || status === "off") return null;

  if (status === "denied") {
    return (
      <div className="fixed top-2 right-3 z-30 text-[10px] text-red-400 bg-black/70 px-2 py-1 rounded">
        Mic bloqueado — activa permisos de micrófono
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="fixed top-2 right-3 z-30 text-[10px] text-[var(--dim)] bg-black/70 px-2 py-1 rounded">
        Wake word no disponible
      </div>
    );
  }

  if (status === "listening") {
    return (
      <div className="fixed top-2 right-3 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded-full pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[10px] text-[var(--dim)]">Di &ldquo;Hola DILO&rdquo;</span>
      </div>
    );
  }

  return null;
}
