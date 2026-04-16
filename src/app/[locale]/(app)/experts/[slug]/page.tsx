"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, Loader2 } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";

interface ExpertMeta {
  slug: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  vibe: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ExpertChatPage() {
  const t = useTranslations("experts");
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [expert, setExpert] = useState<ExpertMeta | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });

    fetch(`/api/experts/list?q=${slug}`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.experts || []).find((e: ExpertMeta) => e.slug === slug);
        if (found) setExpert(found);
      });
  }, [slug]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send() {
    if (!input.trim() || !userId || sending) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setSending(true);

    try {
      const res = await fetch(`/api/experts/${slug}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message: userMsg, conversationId }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `⚠️ ${data.error}` },
        ]);
      } else {
        if (data.conversationId && !conversationId) setConversationId(data.conversationId);
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `⚠️ ${(e as Error).message}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (!expert) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header — idéntico patrón al chat principal */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1.5 -ml-1.5 rounded-full active:bg-[var(--bg2)]"
          aria-label="back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="w-9 h-9 rounded-lg bg-[var(--bg2)] flex items-center justify-center text-xl shrink-0">
          {expert.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{expert.name}</p>
          <p className="text-[11px] text-[var(--dim)] truncate">
            {expert.vibe || expert.description}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4"
      >
        <div className="max-w-lg mx-auto space-y-3 py-4">
          {messages.length === 0 && (
            <div className="text-center py-10 px-2">
              <div className="text-4xl mb-3">{expert.emoji}</div>
              <p className="text-sm text-[var(--dim)] leading-relaxed">
                {expert.description}
              </p>
              <p className="mt-4 text-xs text-[var(--dim)] opacity-70">
                {t("startTyping")}
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  m.role === "user"
                    ? "chat-msg bg-[var(--bg3)] rounded-2xl rounded-br-sm px-3.5 py-2 text-[14px] leading-relaxed max-w-[80%]"
                    : "bg-[var(--bg2)] rounded-2xl rounded-bl-sm px-3.5 py-2 text-[14px] leading-[1.7] text-[#ccc] max-w-[85%] whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-[var(--bg2)] rounded-2xl rounded-bl-sm px-3.5 py-2">
                <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-[var(--border)] px-3 py-2.5">
        <div className="max-w-lg mx-auto flex items-end gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={t("inputPlaceholder")}
            disabled={sending || !userId}
            className="flex-1 bg-[var(--bg2)] border border-[var(--border)] rounded-full px-4 py-2.5 text-sm placeholder-[var(--dim)] focus:outline-none focus:border-white/30 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || sending || !userId}
            className="shrink-0 w-10 h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition"
            aria-label="send"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
