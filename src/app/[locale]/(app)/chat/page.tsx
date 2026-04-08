"use client";

import { useTranslations, useLocale } from "next-intl";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Mic, Square, Plus, MessageCircle, ImagePlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { createBrowserSupabase } from "@/lib/supabase/client";

interface Msg { id: string; role: "user" | "assistant"; content: string; }
interface Conv { id: string; title: string; updated_at: string; }
interface PendingSend { to: string; message: string; }

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
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [enhancing, setEnhancing] = useState(false);
  const supabase = createBrowserSupabase();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const uid = data.user.id;
      setUserId(uid);
      supabase.from("conversations").select("id, title, updated_at").eq("user_id", uid)
        .order("updated_at", { ascending: false }).limit(20)
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
    setPendingSend(null);
    const { data } = await supabase.from("messages").select("id, role, content")
      .eq("conversation_id", id).order("created_at", { ascending: true });
    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMsgs((data as any[]).filter((m: any) => m.role === "user" || m.role === "assistant") as Msg[]);
    }
  }

  function newChat() { setConvId(null); setMsgs([]); setShowHistory(false); setPendingSend(null); }

  const scrollDown = useCallback(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);
  useEffect(scrollDown, [msgs, scrollDown]);

  function onInput(v: string) {
    setInput(v);
    if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 100) + "px"; }
  }

  async function send(overrideText?: string) {
    const text = (overrideText || input).trim();
    if (!text || busy) return;
    setInput(""); if (taRef.current) taRef.current.style.height = "auto";
    const aId = crypto.randomUUID();
    const newMsgs = [...msgs, { id: crypto.randomUUID(), role: "user" as const, content: text }];
    setMsgs([...newMsgs, { id: aId, role: "assistant" as const, content: "" }]);
    setBusy(true);
    setPendingSend(null);

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
        if (userId) {
          supabase.from("conversations").select("id, title, updated_at").eq("user_id", userId)
            .order("updated_at", { ascending: false }).limit(20).then(({ data }) => { if (data) setConvList(data as Conv[]); });
        }
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs(p => p.map(m => m.id === aId ? { ...m, content: acc } : m));

        // Detect if Claude is showing a WhatsApp preview — extract phone and message
        detectPendingSend(acc);
      }
    } catch { setMsgs(p => p.map(m => m.id === aId ? { ...m, content: "Error." } : m)); }
    finally { setBusy(false); }
  }

  function detectPendingSend(text: string) {
    const clean = text.replace(/\*\*/g, "");

    // Strategy 1: "Para: NUMBER / Mensaje: TEXT"
    const paraMatch = clean.match(/(?:Para|To|para|Número)[:\s]+\+?(\d[\d\s.\-]{7,})/i);
    const msgMatch = clean.match(/(?:Mensaje|Message)[:\s]+"([^"]+)"/i)
      || clean.match(/(?:Mensaje|Message)[:\s]+([^\n¿]+)/i);

    if (paraMatch && msgMatch) {
      setPendingSend({ to: paraMatch[1].replace(/[\s.\-]/g, ""), message: msgMatch[1].trim().replace(/^["']|["']$/g, "") });
      return;
    }

    // Strategy 2: Find any quoted message + phone from context or previous messages
    const phoneFromAnywhere = clean.match(/\b(\d{10,15})\b/);
    const quotedMsg = clean.match(/"([^"]{5,})"/);

    if (phoneFromAnywhere && quotedMsg) {
      setPendingSend({ to: phoneFromAnywhere[1], message: quotedMsg[1].trim() });
      return;
    }

    // Strategy 3: Check user's last message for the phone number, use Claude's quoted text as message
    if (quotedMsg && msgs.length > 0) {
      const lastUserMsgs = msgs.filter(m => m.role === "user");
      const lastUserMsg = lastUserMsgs[lastUserMsgs.length - 1]?.content || "";
      const phoneInUser = lastUserMsg.match(/\+?(\d[\d\s.\-]{8,})/);
      if (phoneInUser) {
        setPendingSend({ to: phoneInUser[1].replace(/[\s.\-+]/g, ""), message: quotedMsg[1].trim() });
        return;
      }
    }
  }

  function hasConfirmation(text: string): boolean {
    const lower = text.toLowerCase().replace(/\*\*/g, "");
    const hasAsk = lower.includes("envío") || lower.includes("envio") || lower.includes("confirma")
      || lower.includes("send") || lower.includes("mando") || lower.includes("vale")
      || lower.includes("ok?") || lower.includes("quieres que") || lower.includes("dime sí");
    const hasPreview = lower.includes("para:") || lower.includes("mensaje:") || lower.includes("message:")
      || lower.includes("número") || lower.includes("number");
    return hasAsk && hasPreview;
  }

  async function confirmSend() {
    if (!pendingSend) { send("Sí, envíalo"); return; }

    setBusy(true);
    const confirmId = crypto.randomUUID();
    setMsgs(p => [...p, { id: confirmId, role: "assistant", content: "Enviando..." }]);

    try {
      const instanceName = `dilo_${userId?.slice(0, 8)}`;
      console.log("[DILO] Sending WhatsApp:", { to: pendingSend.to, message: pendingSend.message.slice(0, 50), instanceName });

      const res = await fetch("/api/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", instanceName, to: pendingSend.to, text: pendingSend.message }),
      });
      const data = await res.json();
      console.log("[DILO] Send result:", data);

      if (data.success) {
        setMsgs(p => p.map(m => m.id === confirmId ? { ...m, content: `✅ Mensaje enviado a ${pendingSend!.to}` } : m));
      } else {
        setMsgs(p => p.map(m => m.id === confirmId ? { ...m, content: `❌ Error: ${JSON.stringify(data.error || data)}` } : m));
      }
    } catch (e) {
      console.error("[DILO] Send error:", e);
      setMsgs(p => p.map(m => m.id === confirmId ? { ...m, content: "❌ Error de conexión" } : m));
    } finally {
      setBusy(false);
      setPendingSend(null);
    }
  }

  function cancelSend() {
    setPendingSend(null);
    setMsgs(p => [...p, { id: crypto.randomUUID(), role: "assistant", content: "Cancelado. No se envió nada." }]);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // Show the uploaded image
    const previewUrl = URL.createObjectURL(file);
    const uploadId = crypto.randomUUID();
    const enhanceId = crypto.randomUUID();
    setMsgs(p => [...p,
      { id: uploadId, role: "user", content: `![Foto subida](${previewUrl})` },
      { id: enhanceId, role: "assistant", content: "Mejorando tu foto... ⏳" },
    ]);
    setEnhancing(true);

    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("mode", "enhance");

      const res = await fetch("/api/enhance-image", { method: "POST", body: fd });
      const data = await res.json();

      if (data.success && data.image) {
        setMsgs(p => p.map(m => m.id === enhanceId ? {
          ...m,
          content: `✨ Foto mejorada:\n\n![Foto mejorada](${data.image})`,
        } : m));
      } else {
        setMsgs(p => p.map(m => m.id === enhanceId ? {
          ...m,
          content: `❌ No se pudo mejorar: ${data.error || "error desconocido"}`,
        } : m));
      }
    } catch {
      setMsgs(p => p.map(m => m.id === enhanceId ? { ...m, content: "❌ Error al mejorar la foto" } : m));
    } finally {
      setEnhancing(false);
    }
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

  const hasText = input.trim().length > 0;

  if (showHistory) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold">{t("history")}</h2>
          <button onClick={() => setShowHistory(false)} className="text-xs text-[var(--muted)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <button onClick={newChat} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--border)] hover:bg-[var(--bg2)]">
            <Plus size={16} className="text-[var(--muted)]" /><span className="text-sm">{t("newChat")}</span>
          </button>
          {convList.map(c => (
            <button key={c.id} onClick={() => loadConversation(c.id)} className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--border)] hover:bg-[var(--bg2)] ${c.id === convId ? "bg-[var(--bg2)]" : ""}`}>
              <MessageCircle size={14} className="text-[var(--dim)] flex-shrink-0" />
              <span className="text-sm text-[#ccc] truncate">{c.title || "Chat"}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
        <button onClick={() => setShowHistory(true)} className="text-xs text-[var(--muted)] flex items-center gap-1.5">
          <MessageCircle size={14} /> {t("history")}
        </button>
        <span className="text-sm font-semibold">DILO</span>
        <button onClick={newChat} className="text-xs text-[var(--muted)] flex items-center gap-1.5">
          <Plus size={14} /> {t("newChat")}
        </button>
      </div>

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
                    <div className="chat-md">
                      <ReactMarkdown components={{
                        img: ({ src, alt }) => (
                          <div className="mt-2 mb-2">
                            <img
                              src={src}
                              alt={alt || "Generated image"}
                              className="rounded-xl max-w-full cursor-pointer active:opacity-80"
                              loading="lazy"
                              onClick={() => {
                                const modal = document.createElement("div");
                                modal.className = "fixed inset-0 z-[999] bg-black/95 flex flex-col items-center justify-center p-4";
                                modal.onclick = () => modal.remove();
                                modal.innerHTML = `
                                  <img src="${src}" alt="Full" class="max-w-full max-h-[80vh] rounded-xl object-contain" />
                                  <a href="${src}" download="dilo-image.png" class="mt-4 px-6 py-2.5 rounded-xl bg-white text-black text-sm font-medium" onclick="event.stopPropagation()">⬇ Descargar</a>
                                  <button class="mt-2 text-sm text-gray-400" onclick="this.parentElement.remove()">Cerrar</button>
                                `;
                                document.body.appendChild(modal);
                              }}
                            />
                          </div>
                        ),
                      }}>{m.content}</ReactMarkdown>
                    </div>
                    {pendingSend && idx >= msgs.length - 2 && !busy && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={confirmSend} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition">
                          👍 Sí, enviar
                        </button>
                        <button onClick={cancelSend} className="px-4 py-2 rounded-xl bg-[var(--bg3)] text-[var(--muted)] text-sm font-medium hover:bg-[var(--border)] transition">
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

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <div className="flex-shrink-0 px-3 py-1.5 border-t border-[var(--border)]">
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <button onClick={() => fileRef.current?.click()} disabled={enhancing} className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 bg-[var(--bg3)] ${enhancing ? "opacity-40" : ""}`}>
            <ImagePlus size={16} className="text-white" />
          </button>
          <div className="flex-1 flex items-end bg-[var(--bg2)] rounded-2xl border border-[var(--border)] px-3 py-1.5">
            <textarea ref={taRef} value={input} onChange={e => onInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={transcribing ? "Transcribiendo..." : rec ? "Grabando..." : t("placeholder")}
              rows={1} disabled={transcribing}
              className="flex-1 bg-transparent text-[14px] text-white placeholder-[var(--dim)] resize-none leading-6 max-h-[100px] focus:outline-none disabled:opacity-50" />
          </div>
          {hasText ? (
            <button onClick={() => send()} disabled={busy} className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 mb-0.5"><ArrowUp size={18} className="text-black" /></button>
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
