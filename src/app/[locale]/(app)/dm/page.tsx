"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { createBrowserSupabase } from "@/lib/supabase/client";
import WalkieButton from "@/components/calls/WalkieButton";
import CallButton from "@/components/calls/CallButton";
import HoroscopeCard from "@/components/home/HoroscopeCard";
import { toWavBlob } from "@/lib/audio/wav";
import {
  Search,
  UserPlus,
  Check,
  CheckCheck,
  X,
  ArrowLeft,
  Send,
  Users,
  Clock,
  Loader2,
  Mic,
  Square,
  Play,
  Pause,
  ImagePlus,
  Ban,
  MoreVertical,
  Sparkles,
  Share2,
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
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);

  async function requestSuggestions() {
    if (suggestLoading || !userId || !chatWith) return;
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const payload = {
        userId,
        contactName: chatWith.name,
        messages: messages.slice(-10).map((m) => ({
          role: m.fromMe ? "me" : "them",
          content: m.content,
        })),
      };
      const res = await fetch("/api/dm/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (e) {
      console.error("[dm] suggest failed:", e);
    } finally {
      setSuggestLoading(false);
    }
  }
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);

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

  // Realtime global + polling fallback de 10s. La subscription depende del JWT
  // del usuario + RLS, y en iOS PWA a veces se pierde tras background. El poll
  // garantiza que la lista siempre se actualice incluso si Realtime falla.
  useEffect(() => {
    if (!userId) return;
    const supabase = createBrowserSupabase();

    // Inyectar sesión al cliente realtime antes de subscribe
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
    });

    const ch = supabase
      .channel(`dm-inbox-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${userId}` },
        () => { loadContacts(userId); }
      )
      .subscribe();

    // Polling fallback — refresca contactos cada 10s mientras la vista esté visible
    const pollId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        loadContacts(userId);
      }
    }, 10_000);

    return () => { ch.unsubscribe(); clearInterval(pollId); };
  }, [userId]);

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

  async function inviteFriend() {
    if (!userId || inviting) return;
    setInviting(true);
    try {
      const r = await fetch(`/api/referral?userId=${userId}`);
      const d = await r.json();
      const link: string | undefined = d?.link;
      if (!link) { alert("No se pudo generar el enlace, inténtalo de nuevo"); return; }
      // OJO: no incluir la URL dentro de `text`; WhatsApp y otras apps concatenan
      // `text` + `url` y salía duplicada. `text` = solo mensaje, `url` = enlace.
      const shareText = "Te invito a DILO, mi asistente personal. Descárgala y quedaremos vinculados directamente:";
      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
            title: "Te invito a DILO",
            text: shareText,
            url: link,
          });
          return;
        } catch { /* user cancelled or share failed → fallback */ }
      }
      try {
        await navigator.clipboard.writeText(link);
        alert("Enlace copiado:\n" + link);
      } catch {
        alert("Tu enlace de invitación:\n" + link);
      }
    } finally {
      setInviting(false);
    }
  }

  async function acceptRequest(targetId: string) {
    await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetId, action: "accept" }),
    });
    if (userId) loadContacts(userId);
  }

  async function refreshMessages(otherId: string) {
    const res = await fetch(`/api/dm?userId=${userId}&otherId=${otherId}`);
    const data = await res.json();
    if (data?.messages) {
      setMessages(data.messages);
    }
  }

  async function openChat(otherId: string, name: string) {
    setChatWith({ id: otherId, name });
    setView("chat");
    setMessages([]);
    setShowMenu(false);

    await refreshMessages(otherId);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

    if (pollRef.current) {
      const prev = pollRef.current as unknown as { __channel?: { unsubscribe: () => void } } | null;
      if (prev?.__channel) prev.__channel.unsubscribe();
      else clearInterval(pollRef.current);
    }
    const supabase = createBrowserSupabase();
    // Sync JWT to realtime client so RLS allows seeing events for this user
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
    });

    const channel = supabase.channel(`dm-${[userId, otherId].sort().join("-")}`)
      // Nuevo mensaje entrante (el otro me escribió)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
        filter: `receiver_id=eq.${userId}`,
      }, (payload) => {
        const msg = payload.new as { id: string; sender_id: string; content: string; message_type: string; media_url: string | null; read_at: string | null; created_at: string };
        if (msg.sender_id === otherId) {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, {
              id: msg.id, fromMe: false, content: msg.content, type: msg.message_type,
              mediaUrl: msg.media_url, read: !!msg.read_at, time: msg.created_at,
            }];
          });
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          // Nota: el walkie-talkie real-time va por WebRTC (WalkieButton),
          // no se persiste como mensaje. Los "voice" aquí son clips async
          // legacy; el user los reproduce pulsando el Play de la burbuja.
        }
      })
      // El otro leyó mis mensajes (read_at se setea en GET /api/dm) → azul palomitas
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "direct_messages",
        filter: `sender_id=eq.${userId}`,
      }, (payload) => {
        const msg = payload.new as { id: string; read_at: string | null };
        if (msg.read_at) {
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
        }
      })
      .subscribe();

    // Polling fallback cada 5s mientras el chat esté abierto y visible
    const pollInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshMessages(otherId);
      }
    }, 5_000);

    (pollRef as { current: unknown }).current = {
      __channel: channel,
      __poll: pollInterval,
      unsubscribe() { channel.unsubscribe(); clearInterval(pollInterval); },
    } as unknown as ReturnType<typeof setInterval>;
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


  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Safari iOS no soporta audio/webm — detectar MIME soportado
      const pickedMime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : "";
      const mr = pickedMime ? new MediaRecorder(stream, { mimeType: pickedMime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const recordedBlob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        // Transcribimos con el blob original (Whisper/AssemblyAI aceptan webm).
        let transcript = "";
        try {
          const fd = new FormData();
          fd.append("audio", recordedBlob, mr.mimeType?.includes("mp4") ? "a.m4a" : "a.webm");
          fd.append("locale", "es");
          const tr = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (tr.ok) {
            const td = await tr.json();
            transcript = (td?.text || "").trim();
          }
        } catch { /* fallback to placeholder */ }
        // Transcode webm/ogg → WAV para que Safari (y cualquier navegador)
        // pueda reproducirlo. Safari decodifica mp4/aac y wav pero NO webm.
        // Si el blob ya es mp4 (Safari) o wav, lo dejamos intacto.
        let deliverBlob = recordedBlob;
        const srcMime = (mr.mimeType || recordedBlob.type || "").toLowerCase();
        const needsTranscode = /webm|ogg/.test(srcMime);
        if (needsTranscode) {
          try {
            deliverBlob = await toWavBlob(recordedBlob);
          } catch (err) {
            console.error("[dm] wav transcode failed, sending original:", err);
          }
        }
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          const msgContent = transcript || "[Audio]";
          // Send as voice message (content = transcripción si existe, si no placeholder)
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(), fromMe: true, content: msgContent,
            type: "voice", mediaUrl: base64, read: false, time: new Date().toISOString(),
          }]);
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          if (chatWith) {
            await fetch("/api/dm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, receiverId: chatWith.id, content: msgContent, messageType: "voice", mediaUrl: base64 }),
            });
          }
        };
        reader.readAsDataURL(deliverBlob);
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

  async function toggleAudio(url: string) {
    if (playingAudio === url) {
      audioRef.current?.pause();
      setPlayingAudio(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();

    // Nota: los audios nuevos se entregan en WAV (Chrome emisor) o MP4/AAC
    // (Safari emisor) — ambos se decodifican en cualquier navegador. Mensajes
    // legacy grabados antes del 2026-04-17 pueden seguir en webm; se avisa
    // en onerror si el navegador no puede reproducirlos.

    const audio = new Audio(url);
    audio.onended = () => setPlayingAudio(null);
    audio.onerror = () => {
      setPlayingAudio(null);
      alert("No se pudo reproducir este audio. Formato incompatible con tu navegador (el otro grabó en un formato que aquí no decodifica).");
    };
    audioRef.current = audio;
    setPlayingAudio(url);
    try {
      await audio.play();
    } catch (err) {
      setPlayingAudio(null);
      const msg = err instanceof Error ? err.message : "error";
      if (/not supported|NotSupportedError/i.test(msg)) {
        alert("Audio en formato incompatible con tu dispositivo. Usa el walkie en vivo (🔘 radio) para tiempo real sin este problema.");
      } else {
        alert("No se pudo reproducir: " + msg);
      }
    }
  }

  async function sendImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !chatWith) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      // Optimistic update
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        fromMe: true,
        content: "[Imagen]",
        type: "image",
        mediaUrl: base64,
        read: false,
        time: new Date().toISOString(),
      }]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

      try {
        await fetch("/api/dm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, receiverId: chatWith.id, content: "[Imagen]", messageType: "image", mediaUrl: base64 }),
          signal: AbortSignal.timeout(15000),
        });
      } catch { /* skip */ }
    };
    reader.readAsDataURL(file);
  }

  async function blockUser() {
    if (!chatWith || !userId) return;
    await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetId: chatWith.id, action: "block" }),
      signal: AbortSignal.timeout(10000),
    });
    setShowMenu(false);
    closeChat();
  }

  function closeChat() {
    setView("list");
    setChatWith(null);
    setShowMenu(false);
    // Clean up Realtime channel + polling
    if (pollRef.current) {
      const ref = pollRef.current as unknown as { unsubscribe?: () => void; __channel?: { unsubscribe: () => void }; __poll?: ReturnType<typeof setInterval> };
      if (ref.unsubscribe) ref.unsubscribe();
      else if (ref.__channel) ref.__channel.unsubscribe();
      else clearInterval(pollRef.current);
      pollRef.current = null;
    }
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
          <button type="button" onClick={closeChat} className="text-[var(--dim)]"><ArrowLeft size={20} /></button>
          <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-xs font-bold text-[var(--accent)]">
            {getInitials(chatWith.name)}
          </div>
          <span className="text-sm font-semibold flex-1">{chatWith.name} <span className="text-[9px] text-[var(--dim)] font-normal ml-1">v1057</span></span>
          {userId && <WalkieButton senderId={userId} receiverId={chatWith.id} />}
          {userId && <CallButton calleeId={chatWith.id} calleeName={chatWith.name} />}
          <div className="relative">
            <button type="button" onClick={() => setShowMenu(!showMenu)} className="p-2 text-[var(--dim)]">
              <MoreVertical size={18} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 w-48 rounded-xl bg-[#1c1c1e] border border-white/10 shadow-2xl z-50 overflow-hidden">
                <button type="button" onClick={blockUser} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-red-400 active:bg-white/10">
                  <Ban size={16} /> {t("blockUser")}
                </button>
              </div>
            )}
          </div>
        </div>
        {showMenu && <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />}

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
                {m.type === "image" && m.mediaUrl ? (
                  <Image src={m.mediaUrl} alt="Imagen" width={300} height={200} className="rounded-xl max-w-full max-h-[200px] object-cover cursor-pointer" onClick={() => setFullscreenImage(m.mediaUrl!)} />
                ) : m.type === "voice" && m.mediaUrl ? (
                  <div className="space-y-1">
                    {m.content && m.content !== "[Audio]" && (
                      <p className="leading-snug">{m.content}</p>
                    )}
                    <button type="button" onClick={() => toggleAudio(m.mediaUrl!)} className={`flex items-center gap-1.5 text-xs ${m.fromMe ? "text-white/80" : "text-[var(--dim)]"} hover:underline`}>
                      {playingAudio === m.mediaUrl ? <Pause size={14} /> : <Play size={14} />}
                      <span>{m.content && m.content !== "[Audio]" ? "Escuchar" : t("voiceMessage")}</span>
                    </button>
                  </div>
                ) : (
                  <p>{m.content}</p>
                )}
                <div className={`flex items-center gap-1 mt-0.5 ${m.fromMe ? "justify-end" : "justify-start"}`}>
                  <span className={`text-[9px] ${m.fromMe ? "text-white/60" : "text-[var(--dim)]"}`}>
                    {formatTime(m.time)}
                  </span>
                  {m.fromMe && (
                    m.read
                      ? <CheckCheck size={12} className="text-blue-300" aria-label="Visto" />
                      : <Check size={12} className="text-white/60" aria-label="Enviado" />
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={sendImage} />
        <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border)] flex items-center gap-2">
          {recording ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-full">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-400">{t("recordingAudio")}</span>
              </div>
              <button type="button" onClick={stopRecording} className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center">
                <Square size={14} />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => imgRef.current?.click()} className="w-9 h-9 rounded-full bg-[var(--bg2)] border border-[var(--border)] text-[var(--dim)] flex items-center justify-center flex-shrink-0">
                <ImagePlus size={16} />
              </button>
              <button type="button" onClick={requestSuggestions} disabled={suggestLoading}
                style={{ backgroundColor: "#8b5cf6", color: "#ffffff", height: "36px", padding: "0 12px", borderRadius: "18px", flexShrink: 0, display: "flex", alignItems: "center", gap: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
                aria-label="Sugerir respuesta con IA">
                {suggestLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>IA ✨</span>
              </button>
              <input
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder={t("typeMessage")}
                className="flex-1 min-w-0 bg-[var(--bg2)] border border-[var(--border)] rounded-full px-4 py-2 text-sm text-[var(--fg)] placeholder-[var(--dim)] focus:outline-none focus:border-[var(--accent)]/50"
              />
              {msgInput.trim() ? (
                <button type="button" onClick={sendMessage} disabled={sending}
                  className="w-9 h-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center disabled:opacity-40 flex-shrink-0">
                  <Send size={16} />
                </button>
              ) : (
                <button type="button" onClick={startRecording}
                  className="w-9 h-9 rounded-full bg-[var(--bg2)] border border-[var(--border)] text-[var(--dim)] flex items-center justify-center flex-shrink-0">
                  <Mic size={16} />
                </button>
              )}
            </>
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {suggestions.map((s, i) => (
              <button key={i} type="button"
                onClick={() => { setMsgInput(s); setSuggestions([]); }}
                className="shrink-0 max-w-[85%] text-left text-xs text-[var(--fg)] bg-purple-500/10 border border-purple-500/25 rounded-2xl px-3 py-2 active:bg-purple-500/20 transition">
                {s}
              </button>
            ))}
            <button type="button" onClick={() => setSuggestions([])}
              className="shrink-0 w-7 h-7 rounded-full bg-[var(--bg2)] border border-[var(--border)] text-[var(--dim)] flex items-center justify-center">
              <X size={12} />
            </button>
          </div>
        )}
        {fullscreenImage && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4" onClick={() => setFullscreenImage(null)}>
            <button type="button" onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); }}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center">
              <X size={20} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fullscreenImage} alt="Imagen" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </div>
    );
  }

  // ── SEARCH VIEW ──
  if (view === "search") {
    return (
      <div className="h-full overflow-y-auto overscroll-y-contain">
        <div className="px-4 py-5 max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => setView("list")} className="text-[var(--dim)]"><ArrowLeft size={20} /></button>
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
                  <button type="button" onClick={() => sendRequest(user.id)}
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
      {/* Horoscope entry point — hides silently if user has no birthdate */}
      <div className="pt-3"><HoroscopeCard /></div>
      <div className="px-4 py-5 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <button type="button" onClick={() => setView("search")}
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
                <button type="button" onClick={() => acceptRequest(req.userId)} className="p-2 rounded-lg bg-green-500/15 text-green-400"><Check size={16} /></button>
                <button type="button" className="p-2 rounded-lg bg-red-500/15 text-red-400"><X size={16} /></button>
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
            <button type="button" onClick={() => setView("search")}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium flex items-center gap-2">
              <UserPlus size={14} /> {t("findUsers")}
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {contacts.map(c => (
              <button type="button" key={c.connectionId} onClick={() => openChat(c.userId, c.name)}
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

        {/* Invitar amigos a DILO — quedan vinculados como contactos directos */}
        <div className="mt-6 pt-4 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={inviteFriend}
            disabled={inviting || !userId}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] disabled:opacity-60 active:bg-[var(--bg3)] transition"
          >
            <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/15 flex items-center justify-center flex-shrink-0">
              {inviting ? (
                <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
              ) : (
                <Share2 size={16} className="text-[var(--accent)]" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">Invitar a un amigo a DILO</p>
              <p className="text-[10px] text-[var(--dim)]">
                Se descarga la app y queda vinculado contigo automáticamente
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
