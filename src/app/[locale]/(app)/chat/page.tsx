"use client";

import { useTranslations, useLocale } from "next-intl";
import { useState, useRef, useEffect } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { clsx } from "clsx";

interface Msg { id: string; role: "user" | "assistant"; content: string; }

export default function ChatPage() {
  const t = useTranslations("chat");
  const locale = useLocale();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages]);
  useEffect(() => { if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + "px"; } }, [input]);

  async function send() {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput(""); if (taRef.current) taRef.current.style.height = "auto";
    const uMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text };
    const aId = crypto.randomUUID();
    setMessages(p => [...p, uMsg, { id: aId, role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, uMsg].map(m => ({ role: m.role, content: m.content })),
          locale,
        }),
      });
      if (!r.ok || !r.body) throw new Error();
      const reader = r.body.getReader(); const dec = new TextDecoder(); let acc = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setMessages(p => p.map(m => m.id === aId ? { ...m, content: acc } : m)); }
    } catch { setMessages(p => p.map(m => m.id === aId ? { ...m, content: "Error de conexión." } : m)); }
    finally { setStreaming(false); }
  }

  async function startRecording() {
    if (recording) {
      // Stop recording
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      const chunks: Blob[] = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        setTranscribing(true);

        const blob = new Blob(chunks, { type: recorder.mimeType });
        const formData = new FormData();
        formData.append("audio", blob, `audio.${recorder.mimeType.includes("webm") ? "webm" : "m4a"}`);
        formData.append("locale", locale);

        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: formData });
          if (res.ok) {
            const { text } = await res.json();
            if (text && text.trim()) {
              setInput(text.trim());
              // Auto-focus the textarea
              setTimeout(() => taRef.current?.focus(), 100);
            }
          }
        } catch { /* silently fail */ }
        finally { setTranscribing(false); }
      };

      recorder.start();
      setRecording(true);

      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 30000);
    } catch {
      setRecording(false);
    }
  }

  const hasText = input.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-none">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[15px] text-[#444]">{t("placeholder")}</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {messages.map(m => (
              <div key={m.id}>
                {m.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="px-4 py-2.5 rounded-3xl bg-[#2f2f2f] text-[15px] leading-relaxed max-w-[85%]">{m.content}</div>
                  </div>
                ) : (
                  <div className="text-[15px] leading-[1.75] text-[#ccc]">
                    {m.content || <Dots />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-3 py-2">
        <div className="flex items-end gap-2 bg-[#1a1a1a] rounded-3xl px-4 py-2 max-w-2xl mx-auto border border-[#2a2a2a]">
          <textarea
            ref={taRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={transcribing ? "Transcribiendo..." : t("placeholder")}
            rows={1}
            disabled={transcribing}
            className="flex-1 bg-transparent text-[15px] text-white placeholder-[#555] resize-none leading-6 max-h-[120px] focus:outline-none disabled:opacity-50"
          />
          {hasText ? (
            <button onClick={send} disabled={streaming} className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 disabled:opacity-30">
              <ArrowUp size={18} className="text-black" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={transcribing}
              className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition",
                recording ? "bg-red-500 animate-pulse" : transcribing ? "bg-[#333] opacity-50" : "bg-[#333]"
              )}
            >
              {recording ? <Square size={14} className="text-white" /> : <Mic size={15} className="text-white" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1 items-center">
      <span className="w-1.5 h-1.5 bg-[#555] rounded-full animate-pulse" />
      <span className="w-1.5 h-1.5 bg-[#555] rounded-full animate-pulse [animation-delay:0.2s]" />
      <span className="w-1.5 h-1.5 bg-[#555] rounded-full animate-pulse [animation-delay:0.4s]" />
    </span>
  );
}
