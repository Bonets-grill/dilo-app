"use client";

import { useTranslations, useLocale } from "next-intl";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Msg { id: string; role: "user" | "assistant"; content: string; }

export default function ChatPage() {
  const t = useTranslations("chat");
  const locale = useLocale();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);

  const scrollDown = useCallback(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(scrollDown, [msgs, scrollDown]);

  // Auto-resize textarea
  function onInput(v: string) {
    setInput(v);
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 100) + "px";
    }
  }

  // Send message
  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";

    const uId = crypto.randomUUID();
    const aId = crypto.randomUUID();
    const newMsgs = [...msgs, { id: uId, role: "user" as const, content: text }];
    setMsgs([...newMsgs, { id: aId, role: "assistant" as const, content: "" }]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content })), locale }),
      });
      if (!res.body) throw new Error();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs(p => p.map(m => m.id === aId ? { ...m, content: acc } : m));
      }
    } catch {
      setMsgs(p => p.map(m => m.id === aId ? { ...m, content: "Error de conexión." } : m));
    } finally {
      setBusy(false);
    }
  }

  // Voice recording
  async function toggleRec() {
    if (rec) { mrRef.current?.stop(); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Safari iOS needs mp4, Chrome needs webm
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mrRef.current = mr;

      mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRec(false);
        if (!chunks.length) return;
        setTranscribing(true);
        try {
          const blob = new Blob(chunks, { type: mr.mimeType });
          const fd = new FormData();
          fd.append("audio", blob, mr.mimeType.includes("mp4") ? "a.m4a" : "a.webm");
          fd.append("locale", locale);
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (res.ok) {
            const { text } = await res.json();
            if (text?.trim()) {
              setInput(p => (p ? p + " " : "") + text.trim());
              taRef.current?.focus();
            }
          }
        } catch { /* silent */ }
        setTranscribing(false);
      };

      mr.start();
      setRec(true);
      setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 30000);
    } catch { setRec(false); }
  }

  const hasText = input.trim().length > 0;

  return (
    <div className="flex flex-col h-full">

      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain px-4">
        {msgs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[var(--dim)]">{t("placeholder")}</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto py-4 space-y-4">
            {msgs.map(m => m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="bg-[var(--bg3)] rounded-2xl rounded-br-sm px-3.5 py-2 text-[14px] leading-relaxed max-w-[80%]">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="text-[14px] leading-[1.7] text-[#ccc]">
                {m.content ? (
                  <div className="chat-md">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="inline-flex gap-1"><span className="w-1.5 h-1.5 bg-[var(--dim)] rounded-full animate-pulse" /><span className="w-1.5 h-1.5 bg-[var(--dim)] rounded-full animate-pulse [animation-delay:200ms]" /><span className="w-1.5 h-1.5 bg-[var(--dim)] rounded-full animate-pulse [animation-delay:400ms]" /></span>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 px-3 py-1.5 border-t border-[var(--border)]">
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <div className="flex-1 flex items-end bg-[var(--bg2)] rounded-2xl border border-[var(--border)] px-3 py-1.5">
            <textarea
              ref={taRef}
              value={input}
              onChange={e => onInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={transcribing ? "Transcribiendo..." : rec ? "Grabando..." : t("placeholder")}
              rows={1}
              disabled={transcribing}
              className="flex-1 bg-transparent text-[14px] text-white placeholder-[var(--dim)] resize-none leading-6 max-h-[100px] focus:outline-none disabled:opacity-50"
            />
          </div>
          {hasText ? (
            <button onClick={send} disabled={busy} className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 mb-0.5">
              <ArrowUp size={18} className="text-black" />
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
