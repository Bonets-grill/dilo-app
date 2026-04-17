"use client";

import { useTranslations, useLocale } from "next-intl";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Mic, Square, Plus, MessageCircle, ImagePlus, X, Pencil, Copy, Reply, Search, Sparkles, Loader2, Phone, Trash2 } from "lucide-react";
import VoiceRealtime from "@/components/VoiceRealtime";
import WakeWordListener from "@/components/WakeWordListener";
import ShareMenu from "@/components/ui/ShareMenu";
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
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [voiceLiveOpen, setVoiceLiveOpen] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);

  useEffect(() => {
    setWakeWordEnabled(localStorage.getItem("dilo_wake_word") === "1");
    const onChange = (e: StorageEvent) => {
      if (e.key === "dilo_wake_word") setWakeWordEnabled(e.newValue === "1");
    };
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [convId, _setConvId] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const setConvId = (id: string | null) => { convIdRef.current = id; _setConvId(id); };
  const [convList, setConvList] = useState<Conv[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [deletingConv, setDeletingConv] = useState<string | null>(null);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [stagedImage, setStagedImage] = useState<string | null>(null);
  const [voicePreview, setVoicePreview] = useState<string | null>(null);
  const voiceRef = useRef<HTMLTextAreaElement>(null);
  const [showLocationBanner, setShowLocationBanner] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const pendingQueryRef = useRef<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ msgId: string; text: string; role: string; y: number } | null>(null);
  const [shareMenu, setShareMenu] = useState<{ text: string; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const supabase = createBrowserSupabase();

  useEffect(() => {
    // Read query param before auth (e.g. /chat?q=oportunidades)
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      pendingQueryRef.current = q;
      window.history.replaceState({}, "", window.location.pathname);
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const uid = data.user.id;
      setUserId(uid);
      supabase.from("conversations").select("id, title, updated_at").eq("user_id", uid)
        .eq("hidden_from_user", false)
        .order("updated_at", { ascending: false }).limit(50)
        .then(async ({ data: convs }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const list = (convs as any[] || []) as Conv[];
          setConvList(list);
          if (list.length > 0) await loadConversation(list[0].id);
          // Send pending query AFTER conversation is loaded (so convId is set)
          if (pendingQueryRef.current) {
            const pending = pendingQueryRef.current;
            pendingQueryRef.current = null;
            setTimeout(() => send(pending), 100);
          }
        });
    });
    // City loaded from user_facts on server side — no browser geolocation needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback: if no conversations exist, send after userId is ready
  useEffect(() => {
    if (userId && pendingQueryRef.current && convList.length === 0) {
      const pending = pendingQueryRef.current;
      pendingQueryRef.current = null;
      setTimeout(() => send(pending), 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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

  async function deleteConversation(id: string) {
    if (deletingConv) return;
    const ok = typeof window !== "undefined"
      ? window.confirm("¿Eliminar esta conversación de tu historial? La memoria del agente (lo aprendido sobre ti) no se borra.")
      : true;
    if (!ok) return;
    setDeletingConv(id);
    try {
      const r = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!r.ok) return;
      setConvList(prev => prev.filter(c => c.id !== id));
      if (id === convIdRef.current) newChat();
    } finally {
      setDeletingConv(null);
    }
  }

  const scrollDown = useCallback(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);
  useEffect(scrollDown, [msgs, scrollDown]);

  async function requestSuggestions() {
    if (suggestLoading || !userId) return;
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const payload = {
        userId,
        messages: msgs.map((m) => ({ role: m.role, content: m.content })),
      };
      const res = await fetch("/api/chat/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (e) {
      console.error("[chat] suggest failed:", e);
    } finally {
      setSuggestLoading(false);
    }
  }
  useEffect(() => { if (voicePreview !== null) voiceRef.current?.focus(); }, [voicePreview]);

  function onInput(v: string) {
    setInput(v);
    if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 100) + "px"; }
  }

  async function send(overrideText?: string) {
    const text = (overrideText || input).trim();
    const img = stagedImage;

    // Necesitamos texto O imagen (o ambos)
    if (!text && !img) return;
    if (busy) return;
    setInput(""); setStagedImage(null);
    if (taRef.current) taRef.current.style.height = "auto";

    const aId = crypto.randomUUID();
    const userMsgs: Array<{ id: string; role: "user"; content: string }> = [];
    if (img) userMsgs.push({ id: crypto.randomUUID(), role: "user", content: `__IMAGE__${img}` });
    if (text) userMsgs.push({ id: crypto.randomUUID(), role: "user", content: text });
    const newMsgs = [...msgs, ...userMsgs];
    setMsgs([...newMsgs, { id: aId, role: "assistant" as const, content: "" }]);
    setBusy(true);
    setPendingSend(null);

    // ── Imagen adjunta: decidir edit vs analyze ──
    // Usamos la imagen staged O la última __IMAGE__ del historial si el
    // usuario escribió texto de edición sin adjuntar nueva foto.
    const imgBase64 = img || (() => {
      const found = [...msgs].reverse().find(m => m.role === "user" && m.content.startsWith("__IMAGE__"));
      return found ? found.content.replace("__IMAGE__", "") : null;
    })();
    // Detección de intención: stems de verbos en todas las conjugaciones
    // mejores/mejora/mejorar/mejorando, cambia/cambies/cambiar, etc.
    const questionIntent = text && /\b(qu[eé]\s+(es|hay|ves|dice|pone|significa)|anal[ií]z|descri[bp]|lee|traduc|explic|identific|cu[aá]nt[oa]s?)\w*/i.test(text);
    // editIntent requiere verbo de edición EXPLÍCITO. Antes bastaba con que
    // hubiese imagen en el historial para disparar /api/image-edit con
    // cualquier texto (incluido un recordatorio) → siempre fallaba con
    // "Error al editar imagen" en mensajes no relacionados con la foto.
    // Verbo de edición + complemento de imagen explícito (foto/imagen/rostro/cara/fondo).
    // También matchea imperativos con pronombre clítico: mejórala, edítala, quítale, ponle, etc.
    const editVerbRx = /(?:mejor\w*|edit\w+|retoc\w+|modifi\w+|transform\w+|quit\w+|cambi\w+|conviert\w+|agreg\w+)\b.*?\b(?:foto|imagen|rostro|cara|fondo)/i;
    const editCliticRx = /\b(?:mej[oó]ral[ao]|ed[ií]tal[ao]|qu[ií]tal[aeo]|retócal[ao]|p[oó]nle|a[ñn][aá]del[aeo])\b/i;
    const editIntent = Boolean(text && !questionIntent && imgBase64 && (editVerbRx.test(text) || editCliticRx.test(text)));

    // IMAGEN + TEXTO: solo entra si hay intención de análisis O edición
    if (imgBase64 && text && (questionIntent || editIntent)) {
      if (questionIntent) {
        // PREGUNTA sobre la imagen → GPT-4o-mini vision
        try {
          setMsgs(p => p.map(m => m.id === aId ? { ...m, content: t("analyzingImage") + " 🔍" } : m));
          const r = await fetch("/api/ocr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: imgBase64, prompt: text }),
          });
          const d = await r.json();
          const answer = d.text || t("imageError");
          setMsgs(p => p.map(m => m.id === aId ? { ...m, content: answer } : m));
        } catch {
          setMsgs(p => p.map(m => m.id === aId ? { ...m, content: "Error al analizar." } : m));
        } finally { setBusy(false); }
        return;
      }
      // EDICIÓN — todo lo demás con imagen + texto es intent de editar
      try {
        setMsgs(p => p.map(m => m.id === aId ? { ...m, content: t("generatingImage") + " 🎨" } : m));
        const r = await fetch("/api/image-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: imgBase64, prompt: text, conversationId: convIdRef.current }),
        });
        const d = await r.json();
        if (r.ok && d.image_url) {
          setMsgs(p => p.map(m => m.id === aId ? { ...m, content: `__IMAGE__${d.image_url}` } : m));
        } else {
          setMsgs(p => p.map(m => m.id === aId ? { ...m, content: `No pude editar la imagen: ${d.error || "error"}` } : m));
        }
      } catch {
        setMsgs(p => p.map(m => m.id === aId ? { ...m, content: "Error al editar imagen." } : m));
      } finally { setBusy(false); }
      return;
    }

    // SOLO IMAGEN sin texto → auto-analiza
    if (img && !text) {
      try {
        setMsgs(p => p.map(m => m.id === aId ? { ...m, content: t("analyzingImage") + " 🔍" } : m));
        const r = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: img }),
        });
        const d = await r.json();
        const analysis = d.text ? `**${t("imageAnalysis")}**\n\n${d.text}` : t("imageError");
        setMsgs(p => p.map(m => m.id === aId ? { ...m, content: analysis } : m));
        if (userId && convIdRef.current) {
          try {
            // Guardamos el data URL con prefijo __IMAGE__ para que la edición
            // posterior ("mejórala", "ponle músculos") pueda recuperarla.
            // Antes se guardaba "[Foto enviada]" y perdíamos la imagen.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from("messages") as any).insert([
              { conversation_id: convIdRef.current, user_id: userId, role: "user", content: `__IMAGE__${img}` },
              { conversation_id: convIdRef.current, user_id: userId, role: "assistant", content: analysis },
            ]);
          } catch { /* best-effort */ }
        }
      } catch {
        setMsgs(p => p.map(m => m.id === aId ? { ...m, content: "❌ Error al analizar" } : m));
      } finally { setBusy(false); }
      return;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content.startsWith("__IMAGE__") ? "[Foto]" : m.content })), locale, userId, conversationId: convIdRef.current }),
      });
      if (!res.body) throw new Error();
      const newConvId = res.headers.get("X-Conversation-Id");
      if (newConvId && newConvId !== convIdRef.current) {
        setConvId(newConvId);
        if (userId) {
          supabase.from("conversations").select("id, title, updated_at").eq("user_id", userId)
            .eq("hidden_from_user", false)
            .order("updated_at", { ascending: false }).limit(50).then(({ data }) => { if (data) setConvList(data as Conv[]); });
        }
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        acc += dec.decode(value, { stream: true });

        // Extract structured pending-send marker from server (reliable)
        const markerMatch = acc.match(/__PENDING_SEND__(.+?)__END_PENDING__/);
        if (markerMatch) {
          try {
            const data = JSON.parse(markerMatch[1]);
            setPendingSend({ to: data.to, message: data.message });
          } catch { /* ignore */ }
        }

        // Display text without the marker
        let displayText = acc.replace(/\n?__PENDING_SEND__.*?__END_PENDING__/, "");

        // If response contains __IMAGE__, strip the "Generando imagen..." prefix
        if (displayText.includes("__IMAGE__")) {
          displayText = displayText.replace(/^.*?__IMAGE__/, "__IMAGE__");
        }

        // While waiting for image generation, show loading indicator instead of raw text
        if (displayText.includes("Generando imagen") && !displayText.includes("__IMAGE__")) {
          displayText = t("generatingImage") + " 🎨";
        }

        setMsgs(p => p.map(m => m.id === aId ? { ...m, content: displayText } : m));
      }
    } catch { setMsgs(p => p.map(m => m.id === aId ? { ...m, content: "Error." } : m)); }
    finally { setBusy(false); }
  }

  async function confirmSend() {
    if (!pendingSend) { send("Sí, envíalo"); return; }

    setBusy(true);
    const confirmId = crypto.randomUUID();
    setMsgs(p => [...p, { id: confirmId, role: "assistant", content: "Enviando..." }]);

    try {
      const instanceName = `dilo_${userId?.slice(0, 8)}`;

      const res = await fetch("/api/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", instanceName, to: pendingSend.to, text: pendingSend.message }),
      });
      const data = await res.json();

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
    setMsgs(p => [...p, { id: crypto.randomUUID(), role: "assistant", content: t("cancelled") }]);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      setStagedImage(reader.result as string);
      taRef.current?.focus();
    };
    reader.readAsDataURL(file);
  }

  function resizeImage(file: File, maxSize: number): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(blob!), "image/png", 0.9);
      };
      img.src = URL.createObjectURL(file);
    });
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
          if (res.ok) {
            const { text } = await res.json();
            if (text?.trim()) setVoicePreview(text.trim());
            else setVoicePreview("(No se pudo transcribir — habla más fuerte o vuelve a grabar)");
          } else if (res.status === 429) {
            setVoicePreview("(Límite temporal alcanzado, espera unos segundos y prueba otra vez)");
          } else {
            const errBody = await res.text().catch(() => "");
            setVoicePreview(`(Error transcribiendo — ${res.status}${errBody ? ": " + errBody.slice(0,100) : ""})`);
          }
        } catch (err) {
          setVoicePreview(`(Error de red al transcribir — ${err instanceof Error ? err.message : "sin detalle"})`);
        }
        setTranscribing(false);
      };
      mr.start(); setRec(true);
      setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 30000);
    } catch { setRec(false); }
  }

  // --- Context menu (long-press) handlers ---
  function startLongPress(msgId: string, text: string, role: string, e: React.TouchEvent | React.MouseEvent) {
    longPressTriggered.current = false;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(20);
      setCtxMenu({ msgId, text, role, y: clientY });
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }
  function ctxCopy() {
    if (ctxMenu) navigator.clipboard.writeText(ctxMenu.text);
    setCtxMenu(null);
  }
  function ctxReply() {
    if (!ctxMenu) return;
    const quote = ctxMenu.text.length > 80 ? ctxMenu.text.slice(0, 80) + "..." : ctxMenu.text;
    setInput(`> ${quote}\n\n`);
    setCtxMenu(null);
    setTimeout(() => taRef.current?.focus(), 100);
  }
  function ctxConsult() {
    if (!ctxMenu) return;
    const snippet = ctxMenu.text.length > 200 ? ctxMenu.text.slice(0, 200) + "..." : ctxMenu.text;
    setCtxMenu(null);
    send(`Explícame más sobre esto: "${snippet}"`);
  }
  function ctxShare() {
    if (!ctxMenu) return;
    setShareMenu({ text: ctxMenu.text, y: ctxMenu.y });
    setCtxMenu(null);
  }

  const hasText = input.trim().length > 0;

  if (showHistory) {
    const filteredConvs = historySearch.trim()
      ? convList.filter(c => (c.title || "").toLowerCase().includes(historySearch.trim().toLowerCase()))
      : convList;
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold">{t("history")}</h2>
          <button type="button" onClick={() => setShowHistory(false)} className="text-xs text-[var(--muted)]">✕</button>
        </div>
        <div className="px-4 py-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2">
            <Search size={14} className="text-[var(--dim)] flex-shrink-0" />
            <input
              type="text"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Buscar conversación..."
              className="flex-1 bg-transparent text-sm text-[#ccc] placeholder-[var(--dim)] focus:outline-none"
            />
            {historySearch && (
              <button type="button" onClick={() => setHistorySearch("")} className="text-[var(--dim)] flex-shrink-0">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <button type="button" onClick={newChat} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--border)] hover:bg-[var(--bg2)]">
            <Plus size={16} className="text-[var(--muted)]" /><span className="text-sm">{t("newChat")}</span>
          </button>
          {filteredConvs.map(c => (
            <div key={c.id} className={`flex items-center border-b border-[var(--border)] hover:bg-[var(--bg2)] ${c.id === convId ? "bg-[var(--bg2)]" : ""}`}>
              <button type="button" onClick={() => loadConversation(c.id)}
                className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0">
                <MessageCircle size={14} className="text-[var(--dim)] flex-shrink-0" />
                <span className="text-sm text-[#ccc] truncate">{c.title || "Chat"}</span>
              </button>
              <button type="button"
                onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                disabled={deletingConv === c.id}
                className="px-3 py-3 text-[var(--dim)] hover:text-red-400 flex-shrink-0 disabled:opacity-40"
                aria-label="Eliminar conversación">
                {deletingConv === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
          {filteredConvs.length === 0 && historySearch && (
            <p className="text-center text-xs text-[var(--dim)] py-6">Sin resultados</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
        <button type="button" onClick={() => setShowHistory(true)} className="text-xs text-[var(--muted)] flex items-center gap-1.5">
          <MessageCircle size={14} /> {t("history")}
        </button>
        <span className="text-sm font-semibold">DILO <span className="text-[9px] text-[var(--dim)] font-normal ml-1">v1057</span></span>
        <button type="button" onClick={newChat} className="text-xs text-[var(--muted)] flex items-center gap-1.5">
          <Plus size={14} /> {t("newChat")}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-y-contain px-4">
        {msgs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[var(--dim)]">{t("placeholder")}</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto w-full py-4 space-y-4">
            {msgs.map((m, idx) => { return m.role === "user" ? (
              <div key={m.id} className={`flex justify-end ${ctxMenu?.msgId === m.id ? "msg-highlight" : ""}`}>
                {m.content.startsWith("__IMAGE__") ? (
                  <img src={m.content.replace("__IMAGE__", "")} alt="Uploaded" className="rounded-2xl max-w-[80%] max-h-[300px] object-cover" />
                ) : (
                  <div
                    className="chat-msg bg-[var(--bg3)] rounded-2xl rounded-br-sm px-3.5 py-2 text-[14px] leading-relaxed max-w-[80%]"
                    onTouchStart={e => startLongPress(m.id, m.content, m.role, e)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onContextMenu={e => { e.preventDefault(); setCtxMenu({ msgId: m.id, text: m.content, role: m.role, y: e.clientY }); }}
                  >{m.content}</div>
                )}
              </div>
            ) : (
              <div key={m.id} className={`flex justify-start ${ctxMenu?.msgId === m.id ? "msg-highlight" : ""}`}>
              <div className="bg-[var(--bg2)] rounded-2xl rounded-bl-sm px-3.5 py-2 text-[14px] leading-[1.7] text-[#ccc] max-w-[85%]">
                {m.content?.startsWith("__IMAGE__") ? (
                  <div>
                    <p className="text-xs text-[var(--dim)] mb-2">✨ {t("enhancedPhoto")}</p>
                    <img
                      src={m.content.replace("__IMAGE__", "")}
                      alt="Enhanced"
                      className="rounded-xl max-w-full cursor-pointer active:opacity-80"
                      onClick={() => {
                        const modal = document.createElement("div");
                        modal.className = "fixed inset-0 z-[999] bg-black/95 flex flex-col items-center justify-center p-4";
                        modal.onclick = () => modal.remove();
                        const src = m.content.replace("__IMAGE__", "");
                        modal.innerHTML = `<img src="${src}" alt="Full" class="max-w-full max-h-[80vh] rounded-xl object-contain" /><a href="${src}" download="dilo-enhanced.png" class="mt-4 px-6 py-2.5 rounded-xl bg-white text-black text-sm font-medium" onclick="event.stopPropagation()">⬇ ${t("download")}</a><button type="button" class="mt-2 text-sm text-gray-400" onclick="this.parentElement.remove()">${t("close")}</button>`;
                        document.body.appendChild(modal);
                      }}
                    />
                  </div>
                ) : m.content ? (
                  <>
                    <div className="chat-md chat-msg"
                      onTouchStart={e => startLongPress(m.id, m.content, m.role, e)}
                      onTouchEnd={cancelLongPress}
                      onTouchMove={cancelLongPress}
                      onContextMenu={e => { e.preventDefault(); setCtxMenu({ msgId: m.id, text: m.content, role: m.role, y: e.clientY }); }}
                    >
                      <ReactMarkdown components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300 break-all">
                            {children}
                          </a>
                        ),
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
                                  <a href="${src}" download="dilo-image.png" class="mt-4 px-6 py-2.5 rounded-xl bg-white text-black text-sm font-medium" onclick="event.stopPropagation()">⬇ ${t("download")}</a>
                                  <button type="button" class="mt-2 text-sm text-gray-400" onclick="this.parentElement.remove()">${t("close")}</button>
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
                        <button type="button" onClick={confirmSend} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition">
                          👍 {t("yes")}
                        </button>
                        <button type="button" onClick={cancelSend} className="px-4 py-2 rounded-xl bg-[var(--bg3)] text-[var(--muted)] text-sm font-medium hover:bg-[var(--border)] transition">
                          👎 {t("cancel")}
                        </button>
                      </div>
                    )}
                  </>
                ) : !m.content ? <Dots /> : null}
              </div>
              </div>
            ); })}
            <div ref={endRef} className="h-2" />
          </div>
        )}
      </div>

      {/* Context menu overlay */}
      {ctxMenu && (
        <div className="fixed inset-0 z-[100] ctx-menu-backdrop bg-black/40" onClick={() => setCtxMenu(null)} onTouchEnd={() => setCtxMenu(null)}>
          <div
            className="ctx-menu absolute left-1/2 -translate-x-1/2 w-[220px] rounded-2xl bg-[#1c1c1e] border border-white/10 overflow-hidden shadow-2xl"
            style={{ top: Math.min(ctxMenu.y, window.innerHeight - 280) }}
            onClick={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
          >
            <button type="button" onClick={ctxCopy} className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[15px] text-white active:bg-white/10 border-b border-white/5">
              <Copy size={18} className="text-[#8e8e93]" /> {t("copy")}
            </button>
            <button type="button" onClick={ctxReply} className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[15px] text-white active:bg-white/10 border-b border-white/5">
              <Reply size={18} className="text-[#8e8e93]" /> {t("reply")}
            </button>
            <button type="button" onClick={ctxConsult} className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[15px] text-white active:bg-white/10 border-b border-white/5">
              <Search size={18} className="text-[#8e8e93]" /> {t("consult")}
            </button>
            <button type="button" onClick={ctxShare} className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[15px] text-white active:bg-white/10">
              <ArrowUp size={18} className="text-[#8e8e93]" /> {t("share")}
            </button>
          </div>
        </div>
      )}

      {/* Share menu (WhatsApp / Telegram / Copy) */}
      {shareMenu && (
        <ShareMenu text={shareMenu.text} y={shareMenu.y} onClose={() => setShareMenu(null)} />
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Voice transcription preview */}
      {voicePreview !== null && (
        <div className="flex-shrink-0 px-3 pt-2 pb-1 border-t border-[var(--border)] bg-[var(--bg2)]">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-[var(--dim)] font-medium">{t("audioTranscription")}</span>
              <button type="button" onClick={() => setVoicePreview(null)} className="p-1 rounded-full hover:bg-[var(--bg3)]">
                <X size={14} className="text-[var(--dim)]" />
              </button>
            </div>
            <textarea ref={voiceRef} value={voicePreview} onChange={e => setVoicePreview(e.target.value)}
              rows={5}
              className="w-full bg-[var(--bg1)] rounded-xl border border-[var(--border)] px-3 py-2 text-[15px] text-white resize-none leading-7 max-h-[280px] focus:outline-none focus:border-white/30" />
            <div className="flex gap-2 mt-1.5 mb-0.5 justify-end">
              <button type="button" onClick={() => { const txt = voicePreview || ""; setVoicePreview(null); setInput(txt); setTimeout(() => { if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 100) + "px"; taRef.current.focus(); taRef.current.setSelectionRange(txt.length, txt.length); } }, 50); }}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-[var(--bg3)] text-white flex items-center gap-1.5">
                <Pencil size={12} /> {t("editMore")}
              </button>
              <button type="button" onClick={() => { const text = voicePreview || ""; setVoicePreview(null); setInput(text); setTimeout(() => send(text), 50); }}
                className="px-4 py-1.5 rounded-full text-[12px] font-medium bg-white text-black flex items-center gap-1.5">
                <ArrowUp size={12} /> {t("send")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New-chat FAB removed — the "+ Nueva conversación" button in the top
          header already covers this action. The floating button overlapped
          message content and confused users with a duplicate entry point. */}

      <div
        className={`flex-shrink-0 py-1.5 border-t border-[var(--border)] ${voicePreview !== null ? "hidden" : ""}`}
        style={{
          paddingLeft: "calc(12px + env(safe-area-inset-left))",
          paddingRight: "calc(12px + env(safe-area-inset-right))",
        }}
      >
        {suggestions.length > 0 && (
          <div className="max-w-2xl mx-auto mb-2 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {suggestions.map((s, i) => (
              <button key={i} type="button"
                onClick={() => { setInput(s); setSuggestions([]); if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 100) + "px"; taRef.current.focus(); } }}
                style={{ flexShrink: 0, maxWidth: "85%", textAlign: "left", fontSize: "12px", color: "#fff", backgroundColor: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: "16px", padding: "8px 12px", cursor: "pointer" }}>
                {s}
              </button>
            ))}
            <button type="button" onClick={() => setSuggestions([])}
              style={{ flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "var(--bg2)", border: "1px solid var(--border)", color: "var(--dim)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={12} />
            </button>
          </div>
        )}
        {/* Staged image preview — foto adjunta pendiente de enviar */}
        {stagedImage && (
          <div className="flex items-end gap-2 max-w-2xl mx-auto mb-2">
            <div className="relative inline-block">
              <img src={stagedImage} alt="Preview" className="h-20 rounded-xl border border-[var(--border)] object-cover" />
              <button type="button" onClick={() => setStagedImage(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--dim)]">
                ✕
              </button>
            </div>
            <p className="text-[10px] text-[var(--dim)] leading-tight mb-1">Escribe qué quieres hacer con esta foto, o envía sin texto para analizarla</p>
          </div>
        )}
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={enhancing} className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 bg-[var(--bg3)] ${enhancing ? "opacity-40" : ""}`}>
            <ImagePlus size={16} className="text-white" />
          </button>
          <button type="button" onClick={requestSuggestions} disabled={suggestLoading}
            style={{ backgroundColor: "#8b5cf6", color: "#ffffff", height: "36px", padding: "0 12px", borderRadius: "18px", flexShrink: 0, display: "flex", alignItems: "center", gap: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 600, marginBottom: "2px" }}
            aria-label="Sugerir próximas preguntas">
            {suggestLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>IA ✨</span>
          </button>
          {userId && (
            <button type="button" onClick={() => setVoiceLiveOpen(true)}
              style={{ backgroundColor: "#10b981", color: "#ffffff", width: "36px", height: "36px", borderRadius: "18px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", marginBottom: "2px" }}
              aria-label="Hablar con DILO en directo">
              <Phone size={14} />
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-end bg-[var(--bg2)] rounded-2xl border border-[var(--border)] px-3 py-1.5">
            <textarea ref={taRef} value={input} onChange={e => onInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={transcribing ? t("transcribing") : rec ? t("recording") : t("placeholder")}
              rows={1} disabled={transcribing}
              className="flex-1 min-w-0 bg-transparent text-[14px] text-white placeholder-[var(--dim)] resize-none leading-6 max-h-[100px] focus:outline-none disabled:opacity-50" />
          </div>
          {(hasText || stagedImage) ? (
            <button type="button" onClick={() => send()} disabled={busy} className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 mb-0.5"><ArrowUp size={18} className="text-black" /></button>
          ) : (
            <button type="button" onClick={toggleRec} disabled={transcribing} className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 ${rec ? "bg-red-500 animate-pulse" : "bg-[var(--bg3)]"} ${transcribing ? "opacity-40" : ""}`}>
              {rec ? <Square size={12} className="text-white" /> : <Mic size={16} className="text-white" />}
            </button>
          )}
        </div>
      </div>

      {voiceLiveOpen && userId && (
        <VoiceRealtime userId={userId} onClose={() => setVoiceLiveOpen(false)} />
      )}

      <WakeWordListener
        enabled={wakeWordEnabled && !!userId}
        active={voiceLiveOpen}
        onWake={() => setVoiceLiveOpen(true)}
      />
    </div>
  );
}

function Dots() {
  return <span className="inline-flex gap-1"><span className="w-1.5 h-1.5 bg-[var(--dim)] rounded-full animate-pulse" /><span className="w-1.5 h-1.5 bg-[var(--dim)] rounded-full animate-pulse [animation-delay:200ms]" /><span className="w-1.5 h-1.5 bg-[var(--dim)] rounded-full animate-pulse [animation-delay:400ms]" /></span>;
}
