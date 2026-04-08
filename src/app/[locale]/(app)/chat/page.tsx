"use client";

import { useTranslations } from "next-intl";
import { useState, useRef, useEffect } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { clsx } from "clsx";

interface Msg { id: string; role: "user" | "assistant"; content: string; }

export default function ChatPage() {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

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
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [...messages, uMsg].map(m => ({ role: m.role, content: m.content })) }) });
      if (!r.ok || !r.body) throw new Error();
      const reader = r.body.getReader(); const dec = new TextDecoder(); let acc = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setMessages(p => p.map(m => m.id === aId ? { ...m, content: acc } : m)); }
    } catch { setMessages(p => p.map(m => m.id === aId ? { ...m, content: "Error." } : m)); }
    finally { setStreaming(false); }
  }

  function voice() {
    if (recording) return;
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rc = new (SR as any)(); rc.continuous = false; rc.interimResults = true; rc.lang = document.documentElement.lang || "es";
    setRecording(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rc.onresult = (e: any) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setInput(t); };
    rc.onend = () => setRecording(false); rc.onerror = () => setRecording(false);
    rc.start(); setTimeout(() => { try { rc.stop(); } catch {/* */} }, 10000);
  }

  const hasText = input.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
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

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-2">
        <div className="flex items-end gap-2 bg-[#1a1a1a] rounded-3xl px-4 py-2 max-w-2xl mx-auto border border-[#2a2a2a]">
          <textarea
            ref={taRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t("placeholder")}
            rows={1}
            className="flex-1 bg-transparent text-[15px] text-white placeholder-[#555] resize-none leading-6 max-h-[120px] focus:outline-none"
          />
          {hasText ? (
            <button onClick={send} disabled={streaming} className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 disabled:opacity-30">
              <ArrowUp size={18} className="text-black" />
            </button>
          ) : (
            <button onClick={voice} className={clsx("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", recording ? "bg-red-500" : "bg-[#333]")}>
              <Mic size={15} className="text-white" />
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
