"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen, Play, Square, Loader2, GraduationCap, Camera, FileText, MessageCircle, X,
} from "lucide-react";

const SUBJECTS = [
  "Matemáticas", "Lengua", "Historia", "Geografía", "Inglés",
  "Ciencias", "Física", "Química", "Biología", "Tecnología", "Arte", "Otra",
];

interface Session {
  id: string;
  subject: string;
  started_at: string;
  active_seconds: number;
  wall_seconds: number;
}

interface Material {
  id: string;
  summary: string;
  ocr_text: string;
  created_at: string;
}

export default function StudyPage() {
  const [subject, setSubject] = useState("Matemáticas");
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsedActive, setElapsedActive] = useState(0);
  const [elapsedWall, setElapsedWall] = useState(0);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const interactedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      } catch {}
    }
    const id = setInterval(beat, 30_000);
    const localTick = setInterval(() => {
      setElapsedWall((w) => w + 1);
      if (interactedRef.current) setElapsedActive((a) => a + 1);
    }, 1000);
    return () => { clearInterval(id); clearInterval(localTick); };
  }, [session, subject]);

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

  useEffect(() => {
    if (!session) return;
    function onHide() {
      if (document.visibilityState === "hidden") {
        navigator.sendBeacon?.("/api/study/stop", new Blob([JSON.stringify({ sessionId: session!.id })], { type: "application/json" }));
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
        interactedRef.current = true;
      }
    } finally { setStarting(false); }
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
      setMaterials([]);
    } finally { setStopping(false); }
  }

  async function uploadMaterial(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    e.target.value = "";
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((res) => {
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(file);
      });
      const r = await fetch("/api/study/upload-material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, imageBase64: base64 }),
      });
      const d = await r.json();
      if (d?.material) {
        setMaterials((m) => [d.material, ...m]);
        interactedRef.current = true;
      }
    } finally { setUploading(false); }
  }

  function fmt(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  // Link al chat con contexto del material subido
  function chatLink() {
    const ctx = materials.map((m) => m.ocr_text).join("\n\n---\n\n");
    if (!ctx) return "/chat";
    // Pasar contexto como query param (encoded). El chat puede leerlo.
    // Si es muy largo solo pasamos el último material.
    const trimmed = ctx.length > 2000 ? materials[0]?.ocr_text?.slice(0, 2000) || "" : ctx;
    return `/chat?study_context=${encodeURIComponent(trimmed)}&study_subject=${encodeURIComponent(subject)}`;
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
              DILO cuenta tu tiempo activo mientras interactúas. Sube fotos de tus libros o tareas
              para que te ayude con lo que estás dando en clase.
            </p>
          </>
        ) : (
          <>
            {/* Status */}
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

            {/* Material upload */}
            <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Camera size={16} className="text-yellow-400" />
                <h3 className="text-sm font-semibold">Material de estudio</h3>
              </div>
              <p className="text-[11px] text-[var(--dim)] leading-relaxed">
                Sube fotos de tu libro, apuntes o tareas. DILO lee el contenido y te ayuda con
                ejercicios, explicaciones y preguntas sobre ESO EXACTO.
              </p>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={uploadMaterial} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 rounded-xl bg-yellow-500/20 text-yellow-400 font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {uploading ? <><Loader2 size={14} className="animate-spin" /> Analizando material...</> : <><Camera size={14} /> Subir foto de libro/tarea</>}
              </button>

              {/* Uploaded materials */}
              {materials.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                  {materials.map((m) => (
                    <div key={m.id} className="rounded-lg bg-[var(--bg3)] p-2.5">
                      <div className="flex items-start gap-2">
                        <FileText size={13} className="text-[var(--dim)] mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium">{m.summary}</p>
                          <p className="text-[10px] text-[var(--dim)] mt-1 line-clamp-3">{m.ocr_text.slice(0, 200)}...</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chat link with study context */}
            <a
              href={chatLink()}
              className="w-full py-3 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <MessageCircle size={15} />
              {materials.length > 0
                ? "Chatear sobre este material"
                : "Ir al chat para estudiar"}
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
