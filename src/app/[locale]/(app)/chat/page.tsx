"use client";

import { useTranslations } from "next-intl";
import { useState, useRef, useEffect } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { clsx } from "clsx";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export default function ChatPage() {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  async function handleSend() {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", createdAt: new Date() },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "Something went wrong." } : m
          )
        );
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: accumulated } : m
          )
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "Connection error." } : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleVoice() {
    if (isRecording) return;

    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition
      || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognition as any)();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = document.documentElement.lang || "es";

    setIsRecording(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    recognition.start();
    setTimeout(() => { try { recognition.stop(); } catch { /* */ } }, 10000);
  }

  const hasInput = input.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-10 h-10 rounded-full bg-[var(--surface)] flex items-center justify-center mb-3">
              <span className="text-sm font-bold text-white">D</span>
            </div>
            <p className="text-sm text-[#666]">{t("placeholder")}</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="px-4 py-2.5 rounded-[20px] bg-[#303030] text-[15px] leading-relaxed max-w-[85%]">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[var(--surface)] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold">D</span>
                    </div>
                    <div className="text-[15px] leading-relaxed text-gray-200 min-h-[28px]">
                      {msg.content || (
                        <span className="inline-flex gap-1 items-center h-5">
                          <span className="w-1.5 h-1.5 bg-[#666] rounded-full animate-pulse" />
                          <span className="w-1.5 h-1.5 bg-[#666] rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                          <span className="w-1.5 h-1.5 bg-[#666] rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 pb-2 pt-1">
        <div className="flex items-end gap-1.5 bg-[#1a1a1a] border border-[#333] rounded-[24px] px-3 py-2 max-w-2xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
            rows={1}
            className="flex-1 bg-transparent text-[15px] text-white placeholder-[#666] resize-none leading-6 max-h-[120px] focus:outline-none py-1"
          />
          {hasInput ? (
            <button
              onClick={handleSend}
              disabled={isStreaming}
              className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition"
            >
              <ArrowUp size={18} className="text-black" />
            </button>
          ) : (
            <button
              onClick={handleVoice}
              className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition",
                isRecording ? "bg-red-500" : "bg-[#333] hover:bg-[#444]"
              )}
            >
              <Mic size={16} className="text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
