"use client";

import { useRef, useState } from "react";
import { Radio, Loader2 } from "lucide-react";

interface Props {
  senderId: string;
  receiverId: string;
  /** Opcional: callback cuando se envía el clip (para optimistic UI) */
  onSent?: (tempId: string, base64: string) => void;
}

/**
 * Botón walkie-talkie estilo Nextel:
 *   - touch-and-hold  → graba audio
 *   - release         → para, sube el blob a /api/dm y lo envía al receiver
 *   - sin conexión persistente: cada pulsación es un clip independiente
 *
 * Formato: detecta el mime soportado (webm/opus en Chrome, mp4 en Safari iOS).
 * Tamaño del clip ≤ 60s para evitar payloads enormes.
 */
export default function WalkieButton({ senderId, receiverId, onSent }: Props) {
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function start() {
    if (recording || sending) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (chunksRef.current.length === 0) { setRecording(false); return; }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setRecording(false);
        setSending(true);
        try {
          const reader = new FileReader();
          const base64: string = await new Promise((res, rej) => {
            reader.onload = () => res(reader.result as string);
            reader.onerror = () => rej(new Error("reader_failed"));
            reader.readAsDataURL(blob);
          });
          const tempId = crypto.randomUUID();
          onSent?.(tempId, base64);
          await fetch("/api/dm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: senderId,
              receiverId,
              content: "[Walkie]",
              messageType: "voice",
              mediaUrl: base64,
            }),
          });
        } catch {
          alert("No se pudo enviar el walkie. Prueba otra vez.");
        } finally {
          setSending(false);
        }
      };
      mr.start();
      mrRef.current = mr;
      setRecording(true);
      // Auto-stop al minuto
      maxTimerRef.current = setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 60_000);
    } catch {
      setRecording(false);
      alert("No se pudo acceder al micrófono. Revisa permisos.");
    }
  }

  function stop() {
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    const mr = mrRef.current;
    if (mr && mr.state === "recording") mr.stop();
  }

  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); start(); }}
      onPointerUp={(e) => { e.preventDefault(); stop(); }}
      onPointerLeave={() => { if (recording) stop(); }}
      onPointerCancel={() => { if (recording) stop(); }}
      disabled={sending}
      aria-label="Mantén pulsado para hablar"
      className={`select-none touch-none p-2 rounded-full transition-colors ${
        recording
          ? "bg-red-500 text-white scale-110"
          : sending
          ? "bg-[var(--bg2)] text-[var(--dim)] opacity-60"
          : "bg-green-500/15 text-green-400 hover:bg-green-500/25 active:bg-green-500/35"
      }`}
    >
      {sending ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />}
    </button>
  );
}
