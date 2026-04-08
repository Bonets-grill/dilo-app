"use client";

import { useTranslations, useLocale } from "next-intl";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Mic, Square, Plus, MessageCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { createBrowserSupabase } from "@/lib/supabase/client";

interface Msg { id: string; role: "user" | "assistant"; content: string; }
interface Conv { id: string; title: string; updated_at: string; }

export default function ChatPage() {
  const t = useTranslations("chat");
  const locale = useLocale();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [convList, setConvList] = useState<Conv[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const supabase = createBrowserSupabase();

  // Load user + conversation history
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const uid = data.user.id;
      setUserId(uid);
      // Load conversation list
      supabase.from("conversations")
        .select("id, title, updated_at")
        .eq("user_id", uid)
        .order("updated_at", { ascending: false })
        .limit(20)
        .then(({ data: convs }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const list = (convs as any[] || []) as Conv[];
          setConvList(list);
          if (list.length > 0) loadConversation(list[0].id);
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConversation(id: string) {
    setConvId(id);
    setShowHistory(false);
    const { data } = await supabase
      .from("messages")
      .select("id, role, content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loaded = (data as any[]).filter((m: any) => m.role === "user" || m.role === "assistant") as Msg[];
      setMsgs(loaded);
    }
  }

  function newChat() {
    setConvId(null);
    setMsgs([]);
    setShowHistory(false);
  }

  const scrollDown = useCallback(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);
  useEffect(scrollDown, [msgs, scrollDown]);

  function onInput(v: string) {
    setInput(v);
    if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 100) + "px"; }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); if (taRef.current) taRef.current.style.height = "auto";
    const aId = crypto.randomUUID();
    const newMsgs = [...msgs, { id: crypto.randomUUID(), role: "user" as const, content: text }];
    setMsgs([...newMsgs, { id: aId, role: "assistant" as const, content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content })), locale, userId, conversationId: convId }),
      });
      if (!res.body) throw new Error();
      const newConvId = res.headers.get("X-Conversation-Id");
      if (newConvId && newConvId !== convId) {
        setConvId(newConvId);
        // Refresh conv list
        if (userId) {
          supabase.from("conversations").select("id, title, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(20).then(({ data }) => { if (data) setConvList(data); });
        }
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setMsgs(p => p.map(m => m.id === aId ? { ...m, content: acc } : m)); }
    } catch { setMsgs(p => p.map(m => m.id === aId ? { ...m, content: "Error." } : m)); }
    finally { setBusy(false); }
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
          if (res.ok) { const { text } = await res.json(); if (text?.trim()) { setInput(p => (p ? p + " " : "") + text.trim()); taRef.current?.focus(); } }
        } catch { /* */ }
        setTranscribing(false);
      };
      mr.start(); setRec(true);
      setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 30000);
    } catch { setRec(false); }
  }

  function isConfirmation(text: string): boolean {
    const lower = text.toLowerCase();
    return lower.includes("¿lo envío") || lower.includes("¿ok") || lower.includes("confirma")
      || lower.includes("should i send") || lower.includes("send it?")
      || lower.includes("¿lo mando") || lower.includes("¿te parece");
  }

  function quickReply(text: string) {
    setInput(text);
    setTimeout(() => send(), 100);
  }

  const hasText = input.trim().length > 0;

  // History drawer
  if (showHistory) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold">{t("history")}</h2>
          <button onClick={() => setShowHistory(false)} className="text-xs text-[var(--muted)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <button onClick={newChat} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--border)] hover:bg-[var(--bg2)]">
            <Plus size={16} className="text-[var(--muted)]" />
            <span className="text-sm">{t("newChat")}</span>
          </button>
          {convList.map(c => (
            <button key={c.id} onClick={() => loadConversation(c.id)} className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--border)] hover:bg-[var(--bg2)] ${c.id === convId ? "bg-[var(--bg2)]" : ""}`}>
              <MessageCircle size={14} className="text-[var(--dim)] flex-shrink-0" />
              <span className="text-sm text-[#ccc] truncate">{c.title || "Chat"}</span>
            </button>
          ))}
          {convList.length === 0 && <p className="px-4 py-8 text-center text-xs text-[var(--dim)]">No conversations yet</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with history button */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
        <button onClick={() => setShowHistory(true)} className="text-xs text-[var(--muted)] flex items-center gap-1.5">
          <MessageCircle size={14} /> {t("history")}
        </button>
        <span className="text-sm font-semibold">DILO</span>
        <button onClick={newChat} className="text-xs text-[var(--muted)] flex items-center gap-1.5">
          <Plus size={14} /> {t("newChat")}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain px-4">
        {msgs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[var(--dim)]">{t("placeholder")}</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto py-4 space-y-4">
            {msgs.map((m, idx) => m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="bg-[var(--bg3)] rounded-2xl rounded-br-sm px-3.5 py-2 text-[14px] leading-relaxed max-w-[80%]">{m.content}</div>
              </div>
            ) : (
              <div key={m.id} className="text-[14px] leading-[1.7] text-[#ccc]">
                {m.content ? (
                  <>
                    <div className="chat-md"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                    {/* Show confirm/cancel buttons if assistant asks for confirmation */}
                    {isConfirmation(m.content) && idx === msgs.length - 1 && !busy && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => quickReply("Sí, envíalo")} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition flex items-center gap-1.5">
                          👍 Sí, enviar
                        </button>
                        <button onClick={() => quickReply("No, cancela")} className="px-4 py-2 rounded-xl bg-[var(--bg3)] text-[var(--muted)] text-sm font-medium hover:bg-[var(--border)] transition flex items-center gap-1.5">
                          👎 Cancelar
                        </button>
                      </div>
                    )}
                  </>
                ) : <Dots />}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-1.5 border-t border-[var(--border)]">
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <div className="flex-1 flex items-end bg-[var(--bg2)] rounded-2xl border border-[var(--border)] px-3 py-1.5">
            <textarea ref={taRef} value={input} onChange={e => onInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={transcribing ? "Transcribiendo..." : rec ? "Grabando..." : t("placeholder")} rows={1} disabled={transcribing} className="flex-1 bg-transparent text-[14px] text-white placeholder-[var(--dim)] resize-none leading-6 max-h-[100px] focus:outline-none disabled:opacity-50" />
          </div>
          {hasText ? (
            <button onClick={send} disabled={busy} className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 mb-0.5"><ArrowUp size={18} className="text-black" /></button>
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

function Dots() {
  return <span className="inline-flex gap-1"><span className="w-1.5 h-1.5 bg-[var(--dim)] rounded-full animate-pulse" /><span className="w-1.5 h-1.5 bg-[var(--dim)] rounded-full animate-pulse [animation-delay:200ms]" /><span className="w-1.5 h-1.5 bg-[var(--dim)] rounded-full animate-pulse [animation-delay:400ms]" /></span>;
}
