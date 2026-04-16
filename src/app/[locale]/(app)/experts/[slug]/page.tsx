"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
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
        setMessages((m) => [...m, { role: "assistant", content: `❌ ${data.error}` }]);
      } else {
        if (data.conversationId && !conversationId) setConversationId(data.conversationId);
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `❌ ${(e as Error).message}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (!expert) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="px-4 py-3 border-b border-gray-900 flex items-center gap-3 sticky top-0 bg-black/95 backdrop-blur z-10">
        <button onClick={() => router.back()} className="p-1.5 hover:bg-gray-900 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-2xl">{expert.emoji}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{expert.name}</p>
          <p className="text-xs text-gray-500 truncate">{expert.vibe || expert.description}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">
            <p>{expert.description}</p>
            <p className="mt-3 text-xs text-gray-600">{t("startTyping")}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-purple-600 text-white" : "bg-gray-900 text-gray-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-900 rounded-2xl px-3 py-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-900 px-3 py-3 flex gap-2 sticky bottom-0 bg-black">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={t("inputPlaceholder")}
          disabled={sending || !userId}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending || !userId}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl p-2.5 transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
