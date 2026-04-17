"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, Loader2 } from "lucide-react";
import { PTTConnection } from "@/lib/rtc/ptt";

interface Props {
  senderId: string;
  receiverId: string;
}

/**
 * Walkie-talkie en TIEMPO REAL, estilo Nextel:
 *   - Mantén pulsado el botón → tu voz va en vivo al otro peer por WebRTC
 *   - Suelta → el audio se corta
 * NO es un mensaje de voz async. El audio se transmite directo peer-to-peer
 * usando la clase PTTConnection (offer/answer vía /api/rtc/signal).
 *
 * Estrategia de conexión:
 *   - Ambos lados inicializan en modo "listen" al montarse → polling signals
 *   - El primero en presionar el botón hace startCall (SDP offer + tracks mute)
 *   - El otro lado recibe la offer → acceptCall (pide mic en ese momento)
 *   - Desde ahí, toda pulsación subsiguiente solo cambia track.enabled
 */
export default function WalkieButton({ senderId, receiverId }: Props) {
  const [status, setStatus] = useState<string>("idle");
  const [talking, setTalking] = useState(false);
  const [busy, setBusy] = useState(false);
  const connRef = useRef<PTTConnection | null>(null);

  // Montaje: abre el polling listener para poder recibir audio en vivo
  useEffect(() => {
    const conn = new PTTConnection(senderId, receiverId, (s) => setStatus(s));
    connRef.current = conn;
    conn.listen();
    return () => {
      conn.disconnect();
      connRef.current = null;
    };
  }, [senderId, receiverId]);

  async function onPress() {
    const conn = connRef.current;
    if (!conn || busy) return;
    setBusy(true);
    try {
      // Primera pulsación: inicia la llamada (pide mic, crea offer)
      if (status === "idle" || status === "listening" || status === "disconnected") {
        await conn.startCall();
      }
      conn.startTalking();
      setTalking(true);
    } catch {
      setTalking(false);
    } finally {
      setBusy(false);
    }
  }

  function onRelease() {
    const conn = connRef.current;
    if (!conn) return;
    if (talking) conn.stopTalking();
    setTalking(false);
  }

  const connected = status === "connected" || status === "receiving";
  const pillClass = talking
    ? "bg-red-500 text-white scale-110 ring-2 ring-red-400"
    : connected
    ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
    : "bg-[var(--bg2)] text-[var(--dim)] hover:bg-[var(--bg3)]";

  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      onPointerUp={(e) => { e.preventDefault(); onRelease(); }}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      disabled={busy}
      aria-label="Mantén pulsado para hablar (walkie-talkie)"
      title={connected ? "Walkie conectado — mantén pulsado para hablar" : "Conectando walkie al pulsar..."}
      className={`select-none touch-none p-2 rounded-full transition-all ${pillClass} ${busy ? "opacity-70" : ""}`}
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />}
    </button>
  );
}
