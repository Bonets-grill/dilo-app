"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play, Square, Loader2, GraduationCap, Camera, FileText, Send, ArrowUp,
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
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  // Chat del maestro
  const [chatMsgs, setChatMsgs] = useState<Msg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);

  const interactedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Recuperar sesión abierta
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

  // Heartbeat
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

  // Interaction tracking
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

  // Close on hide
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

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

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
      // Collect transcript for summary
      const transcript = chatMsgs.map((m) => `${m.role === "user" ? "Alumno" : "Maestro"}: ${m.content}`).join("\n");
      await fetch("/api/study/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, transcript }),
      });
      setSession(null);
      setElapsedActive(0);
      setElapsedWall(0);
      setMaterials([]);
      setChatMsgs([]);
      setChatStarted(false);
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

  // Start teacher chat — sends first message to the teacher to get greeting
  async function startChat() {
    setChatStarted(true);
    setChatBusy(true);
    const aId = crypto.randomUUID();
    setChatMsgs([{ id: aId, role: "assistant", content: "" }]);
    try {
      const ctx = materials.map((m) => m.ocr_text).join("\n\n---\n\n");
      const greeting = ctx
        ? `Ya subí mi material de ${subject}. Léelo y empieza a hacerme preguntas sobre lo que aparece ahí.`
        : `Hola maestro, estoy listo para estudiar ${subject}. No tengo material subido, pregúntame qué tema estamos dando.`;
      const r = await fetch("/api/study/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: greeting }],
          subject,
          studyContext: ctx || null,
          sessionId: session?.id,
        }),
      });
      if (!r.body) throw new Error();
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setChatMsgs([{ id: aId, role: "assistant", content: acc }]);
      }
    } catch {
      setChatMsgs([{ id: aId, role: "assistant", content: "Error al conectar con el maestro." }]);
    } finally { setChatBusy(false); }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput("");
    interactedRef.current = true;
    const aId = crypto.randomUUID();
    const newMsgs = [...chatMsgs, { id: crypto.randomUUID(), role: "user" as const, content: text }];
    setChatMsgs([...newMsgs, { id: aId, role: "assistant" as const, content: "" }]);
    setChatBusy(true);
    try {
      const ctx = materials.map((m) => m.ocr_text).join("\n\n---\n\n");
      const r = await fetch("/api/study/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          subject,
          studyContext: ctx || null,
          sessionId: session?.id,
        }),
      });
      if (!r.body) throw new Error();
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setChatMsgs((p) => p.map((m) => (m.id === aId ? { ...m, content: acc } : m)));
      }
    } catch {
      setChatMsgs((p) => p.map((m) => (m.id === aId ? { ...m, content: "Error." } : m)));
    } finally { setChatBusy(false); }
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
    <div className="h-full flex flex-col">
      {!session ? (
        /* ── Selector de materia ── */
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
            <div className="flex items-center gap-2">
              <GraduationCap size={20} className="text-[var(--accent)]" />
              <h1 className="text-lg font-semibold">Modo Estudio</h1>
            </div>
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
              Sube fotos de tus libros o tareas y el maestro DILO te ayuda con lo que
              estás dando en clase. Tu padre/madre puede ver cuánto estudias.
            </p>
          </div>
        </div>
      ) : (
        /* ── Sesión activa: status + material + chat ── */
        <>
          {/* Header compacto con timer */}
          <div className="flex-shrink-0 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between max-w-lg mx-auto">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-semibold">{session.subject}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-green-400 font-mono font-bold">{fmt(elapsedActive)}</span>
                <span className="text-[var(--dim)] font-mono">{fmt(elapsedWall)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={uploadMaterial} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="p-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 disabled:opacity-50">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                </button>
                <button type="button" onClick={stop} disabled={stopping}
                  className="p-1.5 rounded-lg bg-red-500/20 text-red-400 disabled:opacity-50">
                  {stopping ? <Loader2 size={14} className="animate-spin" /> : <Square size={12} fill="currentColor" />}
                </button>
              </div>
            </div>
            {/* Materials bar */}
            {materials.length > 0 && (
              <div className="flex gap-2 mt-2 overflow-x-auto max-w-lg mx-auto pb-1">
                {materials.map((m) => (
                  <div key={m.id} className="flex-shrink-0 rounded-lg bg-[var(--bg2)] border border-[var(--border)] px-2.5 py-1.5 max-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      <FileText size={10} className="text-yellow-400 flex-shrink-0" />
                      <p className="text-[10px] text-[var(--muted)] truncate">{m.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat del maestro */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            <div className="max-w-lg mx-auto space-y-3">
              {!chatStarted ? (
                <div className="text-center py-10 space-y-4">
                  <GraduationCap size={40} className="mx-auto text-[var(--accent)] opacity-50" />
                  <p className="text-sm text-[var(--muted)]">
                    {materials.length > 0
                      ? `Material listo. El maestro te preguntará sobre ${session.subject}.`
                      : "Sube una foto de tu libro/tarea o empieza a chatear directo."}
                  </p>
                  <button
                    type="button"
                    onClick={startChat}
                    className="px-6 py-3 rounded-2xl bg-[var(--accent)] text-white text-sm font-semibold"
                  >
                    🎓 Empezar con el maestro
                  </button>
                  {materials.length === 0 && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="block mx-auto px-5 py-2.5 rounded-xl bg-yellow-500/20 text-yellow-400 text-xs font-semibold disabled:opacity-50"
                    >
                      {uploading ? "Analizando..." : "📷 Subir material primero"}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {chatMsgs.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                          m.role === "user"
                            ? "bg-[var(--accent)] text-white rounded-br-md"
                            : "bg-[var(--bg2)] border border-[var(--border)] rounded-bl-md"
                        }`}
                      >
                        {m.content || <span className="opacity-40">...</span>}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>
          </div>

          {/* Input del chat */}
          {chatStarted && (
            <div className="flex-shrink-0 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-end gap-2 max-w-lg mx-auto">
                <div className="flex-1 min-w-0 bg-[var(--bg2)] rounded-2xl border border-[var(--border)] px-3 py-1.5">
                  <textarea
                    ref={inputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder="Responde al maestro..."
                    rows={1}
                    className="w-full bg-transparent text-[14px] text-white placeholder-[var(--dim)] resize-none leading-6 max-h-[80px] focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={sendChat}
                  disabled={chatBusy || !chatInput.trim()}
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 mb-0.5"
                >
                  <ArrowUp size={18} className="text-black" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
