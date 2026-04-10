"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  Search,
  UserPlus,
  Check,
  X,
  ArrowLeft,
  Send,
  MessageCircle,
  Users,
  Clock,
  Loader2,
  Mic,
  Square,
  Play,
  Pause,
} from "lucide-react";

interface Contact {
  connectionId: string;
  userId: string;
  name: string;
  avatar_url: string | null;
  lastMessage: { content: string; fromMe: boolean; time: string } | null;
  unread: number;
}

interface PendingRequest {
  connectionId: string;
  userId: string;
  name: string;
  avatar_url: string | null;
  time: string;
}

interface SearchResult {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  connection: { status: string; sent_by_me: boolean } | null;
}

interface ChatMessage {
  id: string;
  fromMe: boolean;
  content: string;
  type: string;
  mediaUrl: string | null;
  read: boolean;
  time: string;
}

export default function DMPage() {
  const t = useTranslations("dm");
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "search" | "chat">("list");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [chatWith, setChatWith] = useState<{ id: string; name: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [pttActive, setPttActive] = useState(false);
  const [pttStatus, setPttStatus] = useState<string>("disconnected");
  const [pttTalking, setPttTalking] = useState(false);
  const pttRef = useRef<import("@/lib/rtc/ptt").PTTConnection | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        loadContacts(data.user.id);
      } else {
        setLoading(false);
      }
    });
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function loadContacts(uid: string) {
    const res = await fetch(`/api/connections?userId=${uid}`);
    const data = await res.json();
    setContacts(data.contacts || []);
    setPending(data.pendingRequests || []);
    setLoading(false);
  }

  async function doSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&userId=${userId}`);
    const data = await res.json();
    setSearchResults(data.users || []);
    setSearching(false);
  }

  async function sendRequest(targetId: string) {
    await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetId, action: "request" }),
    });
    doSearch(searchQuery); // Refresh results
  }

  async function acceptRequest(targetId: string) {
    await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetId, action: "accept" }),
    });
    if (userId) loadContacts(userId);
  }

  async function openChat(otherId: string, name: string) {
    setChatWith({ id: otherId, name });
    setView("chat");
    setMessages([]);

    const res = await fetch(`/api/dm?userId=${userId}&otherId=${otherId}`);
    const data = await res.json();
    setMessages(data.messages || []);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

    // Poll for new messages every 3 seconds
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/dm?userId=${userId}&otherId=${otherId}`);
      const d = await r.json();
      setMessages(d.messages || []);
    }, 3000);
  }

  async function sendMessage() {
    if (!msgInput.trim() || !chatWith || sending) return;
    const text = msgInput.trim();
    setMsgInput("");
    setSending(true);

    // Optimistic update
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      fromMe: true,
      content: text,
      type: "text",
      mediaUrl: null,
      read: false,
      time: new Date().toISOString(),
    }]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    await fetch("/api/dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, receiverId: chatWith.id, content: text }),
    });
    setSending(false);
  }

  async function togglePTT() {
    if (pttActive) {
      pttRef.current?.disconnect();
      pttRef.current = null;
      setPttActive(false);
      setPttStatus("disconnected");
    } else if (chatWith && userId) {
      const { PTTConnection } = await import("@/lib/rtc/ptt");
      const conn = new PTTConnection(userId, chatWith.id, (status) => setPttStatus(status));
      pttRef.current = conn;
      setPttActive(true);
      await conn.startCall();
    }
  }

  function pttDown() {
    if (pttRef.current) { pttRef.current.startTalking(); setPttTalking(true); }
  }

  function pttUp() {
    if (pttRef.current) { pttRef.current.stopTalking(); setPttTalking(false); }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          // Send as voice message
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(), fromMe: true, content: "[Audio]",
            type: "voice", mediaUrl: base64, read: false, time: new Date().toISOString(),
          }]);
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          if (chatWith) {
            await fetch("/api/dm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, receiverId: chatWith.id, content: "[Audio]", messageType: "voice", mediaUrl: base64 }),
            });
          }
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
    } catch { /* mic not available */ }
  }

  function stopRecording() {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
    setRecording(false);
  }

  function toggleAudio(url: string) {
    if (playingAudio === url) {
      audioRef.current?.pause();
      setPlayingAudio(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audio.onended = () => setPlayingAudio(null);
      audio.play();
      audioRef.current = audio;
      setPlayingAudio(url);
    }
  }

  function closeChat() {
    setView("list");
    setChatWith(null);
    if (pollRef.current) clearInterval(pollRef.current);
    if (userId) loadContacts(userId);
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function getInitials(name: string) {
    return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-[var(--dim)]" size={24} /></div>;
  }

  // ── CHAT VIEW ──
  if (view === "chat" && chatWith) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <button onClick={closeChat} className="text-[var(--dim)]"><ArrowLeft size={20} /></button>
          <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-xs font-bold text-[var(--accent)]">
            {getInitials(chatWith.name)}
          </div>
          <span className="text-sm font-semibold flex-1">{chatWith.name}</span>
          <button onClick={togglePTT}
            className={`p-2 rounded-lg transition-colors ${pttActive ? "bg-green-500/20 text-green-400" : "text-[var(--dim)]"}`}>
            <Mic size={18} />
          </button>
        </div>

        {/* PTT Bar */}
        {pttActive && (
          <div className="flex-shrink-0 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg2)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-[var(--dim)]">
                Walkie-talkie: {pttStatus === "connected" ? "Conectado" : pttStatus === "receiving" ? "Recibiendo..." : pttStatus}
              </span>
              <span className={`w-2 h-2 rounded-full ${pttStatus === "connected" || pttStatus === "receiving" ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`} />
            </div>
            <button
              onTouchStart={pttDown} onTouchEnd={pttUp}
              onMouseDown={pttDown} onMouseUp={pttUp} onMouseLeave={pttUp}
              className={`w-full py-4 rounded-xl font-bold text-sm transition-all ${
                pttTalking ? "bg-red-500 text-white scale-[0.98]" : "bg-[var(--bg3)] border border-[var(--border)] text-[var(--dim)]"
              }`}
            >
              {pttTalking ? "HABLANDO..." : "MANTENER PARA HABLAR"}
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-center text-sm text-[var(--dim)] py-8">{t("startConversation")}</p>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                m.fromMe
                  ? "bg-[var(--accent)] text-white rounded-br-md"
                  : "bg-[var(--bg2)] border border-[var(--border)] rounded-bl-md"
              }`}>
                {m.type === "voice" && m.mediaUrl ? (
                  <button onClick={() => toggleAudio(m.mediaUrl!)} className="flex items-center gap-2">
                    {playingAudio === m.mediaUrl ? <Pause size={16} /> : <Play size={16} />}
                    <span className="text-xs">Mensaje de voz</span>
                  </button>
                ) : (
                  <p>{m.content}</p>
                )}
                <p className={`text-[9px] mt-0.5 ${m.fromMe ? "text-white/60" : "text-[var(--dim)]"}`}>
                  {formatTime(m.time)}
                </p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border)] flex items-center gap-2">
          {recording ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-full">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-400">Grabando...</span>
              </div>
              <button onClick={stopRecording} className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center">
                <Square size={14} />
              </button>
            </>
          ) : (
            <>
              <input
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder={t("typeMessage")}
                className="flex-1 bg-[var(--bg2)] border border-[var(--border)] rounded-full px-4 py-2 text-sm text-[var(--fg)] placeholder-[var(--dim)] focus:outline-none focus:border-[var(--accent)]/50"
              />
              {msgInput.trim() ? (
                <button onClick={sendMessage} disabled={sending}
                  className="w-9 h-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center disabled:opacity-40">
                  <Send size={16} />
                </button>
              ) : (
                <button onClick={startRecording}
                  className="w-9 h-9 rounded-full bg-[var(--bg2)] border border-[var(--border)] text-[var(--dim)] flex items-center justify-center">
                  <Mic size={16} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── SEARCH VIEW ──
  if (view === "search") {
    return (
      <div className="h-full overflow-y-auto overscroll-y-contain">
        <div className="px-4 py-5 max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setView("list")} className="text-[var(--dim)]"><ArrowLeft size={20} /></button>
            <h2 className="text-lg font-semibold">{t("findUsers")}</h2>
          </div>

          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
            <input
              value={searchQuery}
              onChange={e => doSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              autoFocus
              className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[var(--fg)] placeholder-[var(--dim)] focus:outline-none focus:border-[var(--accent)]/50"
            />
          </div>

          {searching && <div className="text-center py-4"><Loader2 className="animate-spin text-[var(--dim)] mx-auto" size={20} /></div>}

          <div className="space-y-2">
            {searchResults.map(user => (
              <div key={user.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
                <div className="w-10 h-10 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                  {getInitials(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  <p className="text-[10px] text-[var(--dim)] truncate">{user.email}</p>
                </div>
                {user.connection?.status === "accepted" ? (
                  <span className="text-xs text-green-400 flex items-center gap-1"><Check size={12} /> {t("connected")}</span>
                ) : user.connection?.status === "pending" ? (
                  <span className="text-xs text-yellow-400 flex items-center gap-1"><Clock size={12} /> {t("pending")}</span>
                ) : (
                  <button onClick={() => sendRequest(user.id)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium flex items-center gap-1">
                    <UserPlus size={12} /> {t("connect")}
                  </button>
                )}
              </div>
            ))}
          </div>

          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-center text-sm text-[var(--dim)] py-8">{t("noResults")}</p>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW (default) ──
  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <button onClick={() => setView("search")}
            className="p-2 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-[var(--dim)]">
            <UserPlus size={16} />
          </button>
        </div>

        {/* Pending requests */}
        {pending.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-medium text-[var(--dim)] uppercase tracking-wider mb-2">{t("requests")}</h3>
            {pending.map(req => (
              <div key={req.connectionId} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20 mb-2">
                <div className="w-10 h-10 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                  {getInitials(req.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{req.name}</p>
                  <p className="text-[10px] text-[var(--dim)]">{t("wantsToConnect")}</p>
                </div>
                <button onClick={() => acceptRequest(req.userId)} className="p-2 rounded-lg bg-green-500/15 text-green-400"><Check size={16} /></button>
                <button className="p-2 rounded-lg bg-red-500/15 text-red-400"><X size={16} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Contacts */}
        {contacts.length === 0 && pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--bg2)] flex items-center justify-center mb-4">
              <Users size={24} className="text-[var(--dim)]" />
            </div>
            <p className="text-sm text-[var(--dim)] mb-1">{t("noContacts")}</p>
            <p className="text-xs text-[var(--dim)] mb-4">{t("noContactsDesc")}</p>
            <button onClick={() => setView("search")}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium flex items-center gap-2">
              <UserPlus size={14} /> {t("findUsers")}
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {contacts.map(c => (
              <button key={c.connectionId} onClick={() => openChat(c.userId, c.name)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg2)] transition text-left">
                <div className="relative">
                  <div className="w-11 h-11 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-sm font-bold text-[var(--accent)]">
                    {getInitials(c.name)}
                  </div>
                  {c.unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[var(--accent)] rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                      {c.unread}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    {c.lastMessage && (
                      <span className="text-[10px] text-[var(--dim)] flex-shrink-0 ml-2">{formatTime(c.lastMessage.time)}</span>
                    )}
                  </div>
                  {c.lastMessage ? (
                    <p className="text-xs text-[var(--dim)] truncate">
                      {c.lastMessage.fromMe && <span className="text-[var(--muted)]">{t("you")}: </span>}
                      {c.lastMessage.content}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--dim)]">{t("startConversation")}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Link to WhatsApp/Telegram channels */}
        <div className="mt-6 pt-4 border-t border-[var(--border)]">
          <Link href="/channels" className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
            <MessageCircle size={18} className="text-green-400" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t("externalChannels")}</p>
              <p className="text-[10px] text-[var(--dim)]">WhatsApp, Telegram</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
