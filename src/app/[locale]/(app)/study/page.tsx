"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Play, Square, Loader2, GraduationCap, Camera, FileText, ArrowUp, Volume2, VolumeX, ClipboardCheck,
} from "lucide-react";
import type { QuizQuestion } from "@/components/study/Quiz";

const MathMessage = dynamic(() => import("@/components/study/MathMessage"), { ssr: false });
const Whiteboard = dynamic(() => import("@/components/study/Whiteboard").then((m) => m.default), { ssr: false });
const parseSteps = dynamic(() => import("@/components/study/Whiteboard").then((m) => {
  const fn = m.parseSteps;
  return { default: () => fn as unknown };
}) as never, { ssr: false });
const Quiz = dynamic(() => import("@/components/study/Quiz"), { ssr: false });

// parseSteps must be sync — import directly
import { parseSteps as parseStepsSync } from "@/components/study/Whiteboard";

const DEFAULT_SUBJECTS = [
  "Matemáticas", "Lengua", "Historia", "Geografía", "Inglés",
  "Ciencias", "Física", "Química", "Biología", "Tecnología", "Arte", "Otra",
];

interface Session { id: string; subject: string; started_at: string; active_seconds: number; wall_seconds: number; }
interface Material { id: string; summary: string; ocr_text: string; }
interface Msg { id: string; role: "user" | "assistant"; content: string; }

export default function StudyPage() {
  const [subject, setSubject] = useState("Matemáticas");
  const [mode, setMode] = useState<"school" | "plan">("school");
  const [userSubjects, setUserSubjects] = useState<string[]>(DEFAULT_SUBJECTS);
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsedActive, setElapsedActive] = useState(0);
  const [elapsedWall, setElapsedWall] = useState(0);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<Msg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState<string | null>(null);
  const [showWhiteboard, setShowWhiteboard] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);

  const interactedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Load student profile (subjects from onboarding) ──
  useEffect(() => {
    fetch("/api/user/me").then((r) => r.json()).then((d) => {
      if (d?.subjects && Array.isArray(d.subjects) && d.subjects.length > 0) {
        setUserSubjects(d.subjects);
        setSubject(d.subjects[0]);
      }
    }).catch(() => {});
  }, []);

  // ── Session recovery ──
  useEffect(() => {
    fetch("/api/study/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject }),
    }).then((r) => r.json()).then((d) => {
      if (d?.reused && d?.session) {
        setSession(d.session);
        setElapsedActive(d.session.active_seconds || 0);
        setElapsedWall(d.session.wall_seconds || 0);
        setSubject(d.session.subject);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Heartbeat ──
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
    const tick = setInterval(() => {
      setElapsedWall((w) => w + 1);
      if (interactedRef.current) setElapsedActive((a) => a + 1);
    }, 1000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [session, subject]);

  useEffect(() => {
    function mark() { interactedRef.current = true; }
    const evts = ["click", "scroll", "keydown", "touchstart"] as const;
    evts.forEach((e) => window.addEventListener(e, mark, e === "scroll" ? true : undefined));
    return () => evts.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  useEffect(() => {
    if (!session) return;
    const onHide = () => {
      if (document.visibilityState === "hidden")
        navigator.sendBeacon?.("/api/study/stop", new Blob([JSON.stringify({ sessionId: session!.id })], { type: "application/json" }));
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [session]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  // ── Actions ──
  async function start() {
    setStarting(true);
    try {
      const r = await fetch("/api/study/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject }) });
      const d = await r.json();
      if (d?.session) { setSession(d.session); setElapsedActive(d.session.active_seconds || 0); setElapsedWall(d.session.wall_seconds || 0); interactedRef.current = true; }
    } finally { setStarting(false); }
  }

  async function stop() {
    if (!session) return;
    setStopping(true);
    try {
      const transcript = chatMsgs.map((m) => `${m.role === "user" ? "Alumno" : "Maestro"}: ${m.content}`).join("\n");
      await fetch("/api/study/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, transcript }) });
      setSession(null); setElapsedActive(0); setElapsedWall(0); setMaterials([]); setChatMsgs([]); setChatStarted(false); setQuizQuestions(null);
    } finally { setStopping(false); }
  }

  async function uploadMaterial(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    e.target.value = "";
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((res) => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(file); });
      const r = await fetch("/api/study/upload-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, imageBase64: base64 }) });
      const d = await r.json();
      if (d?.material) { setMaterials((m) => [d.material, ...m]); interactedRef.current = true; }
    } finally { setUploading(false); }
  }

  // ── Teacher chat ──
  async function streamTeacher(msgs: { role: string; content: string }[]) {
    const ctx = materials.map((m) => m.ocr_text).join("\n\n---\n\n");
    const r = await fetch("/api/study/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs, subject, studyContext: ctx || null, sessionId: session?.id }),
    });
    if (!r.body) throw new Error();
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
    }
    return acc;
  }

  async function startChat() {
    setChatStarted(true);
    setChatBusy(true);
    const aId = crypto.randomUUID();
    setChatMsgs([{ id: aId, role: "assistant", content: "" }]);
    try {
      const ctx = materials.map((m) => m.ocr_text).join("\n\n---\n\n");
      let greeting: string;
      if (mode === "plan") {
        // Auto-generate plan if doesn't exist
        try {
          const planRes = await fetch(`/api/study/plan?subject=${encodeURIComponent(subject)}`);
          if (planRes.status === 404) {
            await fetch("/api/study/plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subject }),
            });
          }
        } catch {}
        greeting = `Empieza la clase. Explica el tema actual del temario desde cero con ejemplos claros. Luego hazme preguntas para verificar que entiendo.`;
      } else if (ctx) {
        greeting = `Ya subí mi material de ${subject}. Léelo y empieza a hacerme preguntas sobre lo que aparece ahí.`;
      } else {
        greeting = `Hola maestro, estoy listo para estudiar ${subject}. No tengo material subido, pregúntame qué tema estamos dando.`;
      }
      const r = await fetch("/api/study/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: greeting }], subject, mode, studyContext: ctx || null, sessionId: session?.id }),
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
      setChatMsgs([{ id: aId, role: "assistant", content: "Error al conectar." }]);
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
        body: JSON.stringify({ messages: newMsgs.map((m) => ({ role: m.role, content: m.content })), subject, mode, studyContext: ctx || null, sessionId: session?.id }),
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

  // ── TTS ──
  async function playTts(msgId: string, text: string) {
    if (ttsPlaying === msgId) {
      audioRef.current?.pause();
      setTtsPlaying(null);
      return;
    }
    setTtsPlaying(msgId);
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) { setTtsPlaying(null); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setTtsPlaying(null); URL.revokeObjectURL(url); };
      audio.play();
    } catch {
      setTtsPlaying(null);
    }
  }

  // ── Quiz ──
  async function startQuiz() {
    setQuizLoading(true);
    try {
      const ctx = materials.map((m) => m.ocr_text).join("\n\n---\n\n");
      const r = await fetch("/api/study/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Genera un quiz de 5 preguntas de opción múltiple (4 opciones cada una) sobre el material que hemos estudiado. Responde SOLO en JSON, formato exacto:
[{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]
Donde "correct" es el índice (0-3) de la opción correcta. Solo el JSON, nada más.` }],
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
      }
      const jsonMatch = acc.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as QuizQuestion[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuizQuestions(parsed);
        }
      }
    } catch {} finally { setQuizLoading(false); }
  }

  function fmt(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  // ── Detect if message has math or steps for whiteboard ──
  const hasMath = (text: string) => /[$\\]|\\begin|\\frac|\\sqrt/.test(text);
  const hasSteps = (text: string) => /^\d+\.\s/m.test(text);

  return (
    <div className="h-full flex flex-col">
      {!session ? (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
            <div className="flex items-center gap-2">
              <GraduationCap size={20} className="text-[var(--accent)]" />
              <h1 className="text-lg font-semibold">Modo Estudio</h1>
            </div>
            {/* Modo de estudio */}
            <div className="flex gap-2 p-1 bg-[var(--bg2)] rounded-xl">
              <button type="button" onClick={() => setMode("school")}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${mode === "school" ? "bg-[var(--accent)] text-white shadow" : "text-[var(--dim)]"}`}>
                📚 Lo del cole
              </button>
              <button type="button" onClick={() => setMode("plan")}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${mode === "plan" ? "bg-[var(--accent)] text-white shadow" : "text-[var(--dim)]"}`}>
                🎓 Plan DILO
              </button>
            </div>
            <p className="text-[10px] text-[var(--dim)] text-center">
              {mode === "school"
                ? "Sube fotos de tu libro o tarea y el maestro te ayuda con eso"
                : "El maestro tiene un temario preparado para ti — clases en orden"}
            </p>

            <div>
              <label className="text-xs text-[var(--dim)] block mb-2">Materia</label>
              <div className="grid grid-cols-3 gap-2">
                {userSubjects.map((s) => (
                  <button key={s} type="button" onClick={() => setSubject(s)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border ${subject === s ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-[var(--bg2)] border-[var(--border)] text-[var(--muted)]"}`}>{s}</button>
                ))}
              </div>
            </div>
            <button type="button" onClick={start} disabled={starting}
              className="w-full py-4 rounded-2xl bg-[var(--accent)] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {starting ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
              {mode === "school" ? `Estudiar ${subject}` : `Clase de ${subject}`}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Header ── */}
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
                {chatStarted && !quizQuestions && (
                  <button type="button" onClick={startQuiz} disabled={quizLoading}
                    className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 disabled:opacity-50" title="Quiz">
                    {quizLoading ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
                  </button>
                )}
                <button type="button" onClick={stop} disabled={stopping}
                  className="p-1.5 rounded-lg bg-red-500/20 text-red-400 disabled:opacity-50">
                  {stopping ? <Loader2 size={14} className="animate-spin" /> : <Square size={12} fill="currentColor" />}
                </button>
              </div>
            </div>
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

          {/* ── Chat / Quiz area ── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            <div className="max-w-lg mx-auto space-y-3">
              {!chatStarted && !quizQuestions ? (
                <div className="text-center py-10 space-y-4">
                  <GraduationCap size={40} className="mx-auto text-[var(--accent)] opacity-50" />
                  <p className="text-sm text-[var(--muted)]">
                    {materials.length > 0 ? `Material listo. El maestro te explica y pregunta sobre ${subject}.` : "Sube material o empieza directo."}
                  </p>
                  <button type="button" onClick={startChat} className="px-6 py-3 rounded-2xl bg-[var(--accent)] text-white text-sm font-semibold">
                    🎓 Empezar con el maestro
                  </button>
                  {materials.length === 0 && (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="block mx-auto px-5 py-2.5 rounded-xl bg-yellow-500/20 text-yellow-400 text-xs font-semibold disabled:opacity-50">
                      {uploading ? "Analizando..." : "📷 Subir material primero"}
                    </button>
                  )}
                </div>
              ) : quizQuestions ? (
                <Quiz questions={quizQuestions} onFinish={(score, total) => {
                  const aId = crypto.randomUUID();
                  setChatMsgs((p) => [...p, { id: aId, role: "assistant", content: `📊 Quiz terminado: ${score}/${total}. ${score >= total * 0.8 ? "¡Excelente trabajo!" : "Sigue practicando, ¡tú puedes!"}` }]);
                  setQuizQuestions(null);
                }} />
              ) : (
                <>
                  {chatMsgs.map((m) => (
                    <div key={m.id}>
                      <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                          m.role === "user"
                            ? "bg-[var(--accent)] text-white rounded-br-md"
                            : "bg-[var(--bg2)] border border-[var(--border)] rounded-bl-md"
                        }`}>
                          {m.role === "assistant" && m.content ? (
                            <MathMessage text={m.content} />
                          ) : (
                            <span className="text-[13px] leading-relaxed">{m.content || <span className="opacity-40">...</span>}</span>
                          )}
                        </div>
                      </div>
                      {/* TTS + Whiteboard + Help buttons */}
                      {m.role === "assistant" && m.content && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 ml-1">
                          <button type="button" onClick={() => playTts(m.id, m.content)}
                            className="px-2 py-1 rounded-lg bg-[var(--bg3)] text-[var(--dim)] text-[10px] flex items-center gap-1 hover:text-white">
                            {ttsPlaying === m.id ? <VolumeX size={10} /> : <Volume2 size={10} />}
                            {ttsPlaying === m.id ? "Parar" : "Escuchar"}
                          </button>
                          {(hasMath(m.content) || hasSteps(m.content)) && (
                            <button type="button" onClick={() => setShowWhiteboard(showWhiteboard === m.id ? null : m.id)}
                              className="px-2 py-1 rounded-lg bg-[var(--bg3)] text-[var(--dim)] text-[10px] hover:text-white">
                              📋 Pizarra
                            </button>
                          )}
                          {/* Quick-reply help buttons — only on last assistant message */}
                          {m.id === chatMsgs[chatMsgs.length - 1]?.id && !chatBusy && (
                            <>
                              <button type="button" onClick={() => { setChatInput("No sé, explícamelo"); sendChat(); }}
                                className="px-2.5 py-1 rounded-lg bg-yellow-500/15 text-yellow-400 text-[10px] font-medium">
                                🤔 No sé
                              </button>
                              <button type="button" onClick={() => { setChatInput("Explícamelo con un ejemplo"); sendChat(); }}
                                className="px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-400 text-[10px] font-medium">
                                💡 Ejemplo
                              </button>
                              <button type="button" onClick={() => { setChatInput("Siguiente tema"); sendChat(); }}
                                className="px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 text-[10px] font-medium">
                                ✅ Siguiente
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {showWhiteboard === m.id && m.content && (
                        <div className="mt-2">
                          <Whiteboard steps={parseStepsSync(m.content)} />
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>
          </div>

          {/* ── Input ── */}
          {chatStarted && !quizQuestions && (
            <div className="flex-shrink-0 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-end gap-2 max-w-lg mx-auto">
                <div className="flex-1 min-w-0 bg-[var(--bg2)] rounded-2xl border border-[var(--border)] px-3 py-1.5">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder="Responde al maestro..."
                    rows={1}
                    className="w-full bg-transparent text-[14px] text-white placeholder-[var(--dim)] resize-none leading-6 max-h-[80px] focus:outline-none"
                  />
                </div>
                <button type="button" onClick={sendChat} disabled={chatBusy || !chatInput.trim()}
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 mb-0.5">
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
