"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Play, Square, Loader2, GraduationCap } from "lucide-react";

const SUBJECTS = [
  "Matemáticas",
  "Lengua",
  "Historia",
  "Geografía",
  "Inglés",
  "Ciencias",
  "Física",
  "Química",
  "Biología",
  "Tecnología",
  "Arte",
  "Otra",
];

interface Session {
  id: string;
  subject: string;
  started_at: string;
  active_seconds: number;
  wall_seconds: number;
}

export default function StudyPage() {
  const [subject, setSubject] = useState("Matemáticas");
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsedActive, setElapsedActive] = useState(0);
  const [elapsedWall, setElapsedWall] = useState(0);
  const interactedRef = useRef(false);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  // Recuperar sesión abierta al cargar
  useEffect(() => {
    fetch("/api/study/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.reused && d?.session) {
          setSession(d.session);
          setElapsedActive(d.session.active_seconds || 0);
          setElapsedWall(d.session.wall_seconds || 0);
          setSubject(d.session.subject);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat cada 30s mientras hay sesión abierta
  useEffect(() => {
    if (!session) return;
    async function beat() {
      const interaction = interactedRef.current;
      interactedRef.current = false;
      try {
        const r = await fetch("/api/study/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session!.id, interaction, subject }),
        });
        const d = await r.json();
        if (typeof d?.active_seconds === "number") setElapsedActive(d.active_seconds);
        if (typeof d?.wall_seconds === "number") setElapsedWall(d.wall_seconds);
      } catch { /* network flap ok, cron cerrará si queda zombi */ }
    }
    // Primer beat inmediato, luego cada 30s
    const id = setInterval(beat, 30_000);
    tickRef.current = id;
    // Contador local segundo a segundo para UX fluida (se resincroniza con cada heartbeat)
    const localTick = setInterval(() => {
      setElapsedWall((w) => w + 1);
      if (interactedRef.current) setElapsedActive((a) => a + 1);
    }, 1000);
    return () => {
      clearInterval(id);
      clearInterval(localTick);
    };
  }, [session, subject]);

  // Marcar interacción en cualquier tap/scroll/key
  useEffect(() => {
    function mark() { interactedRef.current = true; }
    window.addEventListener("click", mark);
    window.addEventListener("scroll", mark, true);
    window.addEventListener("keydown", mark);
    window.addEventListener("touchstart", mark);
    return () => {
      window.removeEventListener("click", mark);
      window.removeEventListener("scroll", mark, true);
      window.removeEventListener("keydown", mark);
      window.removeEventListener("touchstart", mark);
    };
  }, []);

  // Cerrar sesión al cerrar pestaña / ir a background (best-effort)
  useEffect(() => {
    if (!session) return;
    function onHide() {
      if (document.visibilityState === "hidden") {
        // beacon: no promise, dispara y sigue
        const body = JSON.stringify({ sessionId: session!.id });
        navigator.sendBeacon?.("/api/study/stop", new Blob([body], { type: "application/json" }));
      }
    }
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [session]);

  async function start() {
    setStarting(true);
    try {
      const r = await fetch("/api/study/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      const d = await r.json();
      if (d?.session) {
        setSession(d.session);
        setElapsedActive(d.session.active_seconds || 0);
        setElapsedWall(d.session.wall_seconds || 0);
        interactedRef.current = true; // arrancar cuenta activa
      }
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (!session) return;
    setStopping(true);
    try {
      await fetch("/api/study/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      setSession(null);
      setElapsedActive(0);
      setElapsedWall(0);
    } finally {
      setStopping(false);
    }
  }

  function fmt(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <GraduationCap size={20} className="text-[var(--accent)]" />
          <h1 className="text-lg font-semibold">Modo Estudio</h1>
        </div>

        {!session ? (
          <>
            <div>
              <label className="text-xs text-[var(--dim)] block mb-2">Materia</label>
              <div className="grid grid-cols-3 gap-2">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubject(s)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border ${
                      subject === s
                        ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                        : "bg-[var(--bg2)] border-[var(--border)] text-[var(--muted)]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={start}
              disabled={starting}
              className="w-full py-4 rounded-2xl bg-[var(--accent)] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {starting ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
              Empezar a estudiar {subject}
            </button>

            <p className="text-[11px] text-[var(--dim)] text-center leading-relaxed">
              DILO cuenta tu tiempo activo mientras interactúas. Si sales o cierras la app, la
              sesión se cierra sola a los 3 minutos.
            </p>
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-[var(--accent)]/15 to-[var(--accent)]/5 border border-[var(--accent)]/40 p-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-1 text-[var(--accent)]">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-medium">Estudiando</span>
              </div>
              <p className="text-2xl font-bold mb-3">{session.subject}</p>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-[var(--bg2)] py-3">
                  <p className="text-[10px] text-[var(--dim)]">Tiempo activo</p>
                  <p className="text-xl font-bold text-green-400 font-mono mt-1">{fmt(elapsedActive)}</p>
                </div>
                <div className="rounded-xl bg-[var(--bg2)] py-3">
                  <p className="text-[10px] text-[var(--dim)]">App abierta</p>
                  <p className="text-xl font-bold text-[var(--muted)] font-mono mt-1">{fmt(elapsedWall)}</p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-[var(--dim)] text-center leading-relaxed px-2">
              Interactúa con DILO (mensajes, preguntas, tareas) para que cuente como tiempo
              activo. Solo dejarlo abierto no cuenta.
            </p>

            <a
              href="/chat"
              className="w-full py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-sm font-medium flex items-center justify-center gap-2"
            >
              <BookOpen size={15} />
              Ir al chat para estudiar
            </a>

            <button
              type="button"
              onClick={stop}
              disabled={stopping}
              className="w-full py-3 rounded-xl bg-red-500/20 text-red-400 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {stopping ? <Loader2 className="animate-spin" size={15} /> : <Square size={14} fill="currentColor" />}
              Terminar sesión
            </button>
          </>
        )}
      </div>
    </div>
  );
}
