"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  Send,
  BookOpen,
  Target,
  Lightbulb,
  TrendingUp,
  Heart,
  Briefcase,
  Wallet,
  Smile,
  Frown,
  Meh,
  Loader2,
  ChevronDown,
  ChevronUp,
  Mic,
  Square,
  ImagePlus,
  ArrowUp,
  Pencil,
  X,
} from "lucide-react";
import { useLocale } from "next-intl";

interface JournalEntry {
  id: string;
  content: string;
  dilo_response: string;
  mood: string;
  category: string;
  extracted_lessons: string[];
  extracted_goals: string[];
  created_at: string;
}

interface Goal {
  id: string;
  goal: string;
  status: string;
  progress_pct: number;
  next_check_in: string;
}

interface Lesson {
  id: string;
  lesson: string;
  category: string;
  times_relevant: number;
}

const MOOD_ICONS: Record<string, typeof Smile> = {
  positive: Smile,
  negative: Frown,
  neutral: Meh,
  mixed: Meh,
};

const MOOD_COLORS: Record<string, string> = {
  positive: "text-green-400",
  negative: "text-red-400",
  neutral: "text-yellow-400",
  mixed: "text-purple-400",
};

const CAT_ICONS: Record<string, typeof Briefcase> = {
  professional: Briefcase,
  financial: Wallet,
  personal: Heart,
  health: TrendingUp,
  relationship: Heart,
  general: BookOpen,
};

export default function JournalPage() {
  const locale = useLocale();
  const [userId, setUserId] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInsights, setShowInsights] = useState(false);
  const [rec, setRec] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voicePreview, setVoicePreview] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const voiceRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        loadJournal(data.user.id);
      } else {
        setLoading(false);
      }
    });
  }, []);

  async function loadJournal(uid: string) {
    const res = await fetch(`/api/journal?userId=${uid}&limit=30`);
    const data = await res.json();
    setEntries((data.entries || []).reverse());
    setGoals(data.activeGoals || []);
    setLessons(data.topLessons || []);
    setLoading(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  async function sendEntry() {
    if (!input.trim() || !userId || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    // Optimistic: show user message
    const tempId = crypto.randomUUID();
    setEntries(prev => [...prev, {
      id: tempId, content: text, dilo_response: "", mood: "neutral",
      category: "general", extracted_lessons: [], extracted_goals: [],
      created_at: new Date().toISOString(),
    }]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, content: text }),
    });
    const data = await res.json();

    setEntries(prev => prev.map(e => e.id === tempId ? {
      ...e,
      dilo_response: data.response,
      mood: data.mood,
      category: data.category,
    } : e));

    // Refresh goals/lessons
    if (data.goalsDetected > 0 || data.lessonsExtracted > 0) {
      loadJournal(userId);
    }

    setSending(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  async function toggleRec() {
    if (rec) { mrRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mrRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); setRec(false);
        if (!chunks.length) return;
        setTranscribing(true);
        try {
          const blob = new Blob(chunks, { type: mr.mimeType }); const fd = new FormData();
          fd.append("audio", blob, mr.mimeType.includes("mp4") ? "a.m4a" : "a.webm"); fd.append("locale", locale);
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (res.ok) { const { text } = await res.json(); if (text?.trim()) setVoicePreview(text.trim()); }
        } catch { /* */ }
        setTranscribing(false);
      };
      mr.start(); setRec(true);
      setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 60000);
    } catch { setRec(false); }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      // OCR the image and send as journal entry
      try {
        const res = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: base64 }),
        });
        const data = await res.json();
        if (data.text) {
          setInput(`[Foto] ${data.text}`);
          setTimeout(() => taRef.current?.focus(), 50);
        }
      } catch { /* */ }
    };
    reader.readAsDataURL(file);
  }

  useEffect(() => { if (voicePreview !== null) voiceRef.current?.focus(); }, [voicePreview]);

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-[var(--dim)]" size={24} /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-[var(--accent)]" />
            <h2 className="text-base font-semibold">Mi Diario</h2>
          </div>
          <button onClick={() => setShowInsights(!showInsights)}
            className="flex items-center gap-1 text-xs text-[var(--dim)] px-2 py-1 rounded-lg bg-[var(--bg2)]">
            <Lightbulb size={12} />
            {showInsights ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Insights panel */}
        {showInsights && (
          <div className="mt-3 space-y-3">
            {/* Active goals */}
            {goals.length > 0 && (
              <div>
                <p className="text-[10px] text-[var(--dim)] uppercase tracking-wider mb-1.5">Metas activas</p>
                {goals.map(g => (
                  <div key={g.id} className="flex items-center gap-2 mb-1.5">
                    <Target size={12} className="text-[var(--accent)]" />
                    <span className="text-xs flex-1">{g.goal}</span>
                    <span className="text-[10px] text-[var(--accent)]">{g.progress_pct}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* Top lessons */}
            {lessons.length > 0 && (
              <div>
                <p className="text-[10px] text-[var(--dim)] uppercase tracking-wider mb-1.5">Lecciones aprendidas</p>
                {lessons.slice(0, 5).map(l => (
                  <div key={l.id} className="flex items-start gap-2 mb-1.5">
                    <Lightbulb size={12} className="text-yellow-400 mt-0.5" />
                    <span className="text-xs text-[var(--muted)]">{l.lesson}</span>
                  </div>
                ))}
              </div>
            )}

            {goals.length === 0 && lessons.length === 0 && (
              <p className="text-xs text-[var(--dim)] text-center py-2">
                Cuéntale a DILO sobre tu día y empezará a extraer lecciones y metas automáticamente.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Journal entries */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 space-y-4">
        {entries.length === 0 && (
          <div className="text-center py-16">
            <BookOpen size={40} className="text-[var(--dim)] mx-auto mb-4" />
            <p className="text-sm text-[var(--muted)] mb-2">Tu diario personal con DILO</p>
            <p className="text-xs text-[var(--dim)] max-w-xs mx-auto">
              Cuéntale cómo fue tu día, qué decisiones tomaste, qué aprendiste.
              DILO escucha, aprende, y te aconseja basado en tu historial.
            </p>
          </div>
        )}

        {entries.map(entry => {
          const MoodIcon = MOOD_ICONS[entry.mood] || Meh;
          const CatIcon = CAT_ICONS[entry.category] || BookOpen;
          const moodColor = MOOD_COLORS[entry.mood] || "text-[var(--dim)]";

          return (
            <div key={entry.id} className="space-y-2">
              {/* User entry */}
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-[var(--accent)] text-white px-4 py-2.5 rounded-2xl rounded-br-md">
                  <p className="text-sm">{entry.content}</p>
                  <div className="flex items-center justify-end gap-2 mt-1">
                    <span className="text-[9px] text-white/50">{formatDate(entry.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* DILO response */}
              {entry.dilo_response && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] bg-[var(--bg2)] border border-[var(--border)] px-4 py-2.5 rounded-2xl rounded-bl-md">
                    <p className="text-sm whitespace-pre-wrap">{entry.dilo_response}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <MoodIcon size={12} className={moodColor} />
                      <CatIcon size={12} className="text-[var(--dim)]" />
                      {entry.extracted_lessons.length > 0 && (
                        <span className="text-[9px] text-yellow-400 flex items-center gap-0.5">
                          <Lightbulb size={9} /> {entry.extracted_lessons.length}
                        </span>
                      )}
                      {entry.extracted_goals.length > 0 && (
                        <span className="text-[9px] text-[var(--accent)] flex items-center gap-0.5">
                          <Target size={9} /> {entry.extracted_goals.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Loading indicator for pending response */}
              {!entry.dilo_response && sending && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl bg-[var(--bg2)] border border-[var(--border)]">
                    <Loader2 size={16} className="animate-spin text-[var(--dim)]" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Voice transcription preview */}
      {voicePreview !== null && (
        <div className="flex-shrink-0 px-3 pt-2 pb-1 border-t border-[var(--border)] bg-[var(--bg2)]">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-[var(--dim)] font-medium">Transcripci&oacute;n de audio</span>
              <button onClick={() => setVoicePreview(null)} className="p-1 rounded-full hover:bg-[var(--bg3)]">
                <X size={14} className="text-[var(--dim)]" />
              </button>
            </div>
            <textarea ref={voiceRef} value={voicePreview} onChange={e => setVoicePreview(e.target.value)}
              rows={5}
              className="w-full bg-[var(--bg1)] rounded-xl border border-[var(--border)] px-3 py-2 text-[15px] text-white resize-none leading-7 max-h-[280px] focus:outline-none focus:border-white/30" />
            <div className="flex gap-2 mt-1.5 mb-0.5 justify-end">
              <button onClick={() => { const txt = voicePreview || ""; setVoicePreview(null); setInput(txt); setTimeout(() => taRef.current?.focus(), 50); }}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-[var(--bg3)] text-white flex items-center gap-1.5">
                <Pencil size={12} /> Editar
              </button>
              <button onClick={() => { const text = voicePreview || ""; setVoicePreview(null); setInput(text); setTimeout(() => sendEntry(), 50); }}
                className="px-4 py-1.5 rounded-full text-[12px] font-medium bg-[var(--accent)] text-white flex items-center gap-1.5">
                <ArrowUp size={12} /> Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className={`flex-shrink-0 px-3 py-1.5 border-t border-[var(--border)] ${voicePreview !== null ? "hidden" : ""}`}>
        <div className="flex items-end gap-2">
          <button onClick={() => fileRef.current?.click()} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 bg-[var(--bg3)]">
            <ImagePlus size={16} className="text-white" />
          </button>
          <div className="flex-1 flex items-end bg-[var(--bg2)] rounded-2xl border border-[var(--border)] px-3 py-1.5">
            <textarea ref={taRef} value={input}
              onChange={e => { setInput(e.target.value); if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 100) + "px"; } }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendEntry(); } }}
              placeholder={transcribing ? "Transcribiendo..." : rec ? "Grabando..." : "\u00bfC\u00f3mo fue tu d\u00eda?"}
              rows={1} disabled={transcribing}
              className="flex-1 bg-transparent text-[14px] text-white placeholder-[var(--dim)] resize-none leading-6 max-h-[100px] focus:outline-none disabled:opacity-50" />
          </div>
          {input.trim() ? (
            <button onClick={sendEntry} disabled={sending} className="w-9 h-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 mb-0.5">
              <ArrowUp size={18} />
            </button>
          ) : (
            <button onClick={toggleRec} disabled={transcribing} className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 ${rec ? "bg-red-500 animate-pulse" : "bg-[var(--bg3)]"} ${transcribing ? "opacity-40" : ""}`}>
              {rec ? <Square size={12} className="text-white" /> : <Mic size={16} className="text-white" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
