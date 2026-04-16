"use client";

import { useEffect, useRef, useState } from "react";
import { X, Mic, Phone, PhoneOff, Loader2 } from "lucide-react";

interface Props {
  userId: string;
  onClose: () => void;
}

type Status = "idle" | "connecting" | "live" | "error";

/**
 * Live voice conversation with DILO via OpenAI's Realtime API (WebRTC).
 *
 * Flow:
 *   1. POST /api/voice/realtime-token → ephemeral client_secret
 *   2. Create RTCPeerConnection, add mic track, attach <audio> for reply
 *   3. Exchange SDP offer/answer with OpenAI's Realtime endpoint using the
 *      ephemeral token in the Authorization header
 *   4. Audio streams bidirectionally until the user closes
 *
 * The model handles turn-taking (server_vad). No push-to-talk needed.
 */
export default function VoiceRealtime({ userId, onClose }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  async function start() {
    try {
      setStatus("connecting");
      setError(null);

      // 1. Ephemeral token
      const tokRes = await fetch("/api/voice/realtime-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!tokRes.ok) throw new Error("Token creation failed");
      const { client_secret, model } = await tokRes.json();
      if (!client_secret) throw new Error("No client_secret");

      // 2. Peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioRef.current = audioEl;

      pc.ontrack = (e) => {
        if (audioEl.srcObject !== e.streams[0]) {
          audioEl.srcObject = e.streams[0];
          setAiSpeaking(true);
          // crude activity detection: AI speaking whenever track receives data
          const analyser = document.createElement("audio");
          analyser.srcObject = e.streams[0];
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      setUserSpeaking(true);

      // 3. Data channel for events (status updates, transcripts)
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "input_audio_buffer.speech_started") setUserSpeaking(true);
          if (msg.type === "input_audio_buffer.speech_stopped") setUserSpeaking(false);
          if (msg.type === "response.audio.delta") setAiSpeaking(true);
          if (msg.type === "response.done") setAiSpeaking(false);
        } catch { /* ignore */ }
      };

      // 4. SDP exchange directly with OpenAI (using ephemeral token)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model || "gpt-4o-mini-realtime-preview-2024-12-17")}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${client_secret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpRes.ok) {
        const txt = await sdpRes.text();
        throw new Error("SDP exchange failed: " + txt.slice(0, 200));
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setStatus("live");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setError(msg);
      setStatus("error");
      cleanup();
    }
  }

  function cleanup() {
    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      dcRef.current?.close();
      pcRef.current?.close();
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
    } catch { /* ignore */ }
    pcRef.current = null;
    localStreamRef.current = null;
    dcRef.current = null;
    audioRef.current = null;
  }

  useEffect(() => {
    return () => cleanup();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex flex-col items-center justify-center p-6">
      <button
        type="button"
        onClick={() => { cleanup(); onClose(); }}
        className="absolute top-5 right-5 w-10 h-10 rounded-full bg-[var(--bg2)] border border-[var(--border)] flex items-center justify-center text-[var(--dim)]"
      >
        <X size={20} />
      </button>

      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        <div
          className="w-32 h-32 rounded-full flex items-center justify-center transition-all"
          style={{
            background: status === "live"
              ? (aiSpeaking ? "radial-gradient(circle, rgba(139,92,246,0.55), rgba(139,92,246,0.1))"
                : userSpeaking ? "radial-gradient(circle, rgba(34,197,94,0.55), rgba(34,197,94,0.1))"
                : "rgba(139,92,246,0.15)")
              : "rgba(139,92,246,0.15)",
            boxShadow: status === "live" && (aiSpeaking || userSpeaking)
              ? "0 0 60px rgba(139,92,246,0.5)"
              : "none",
          }}
        >
          {status === "idle" && <Mic size={44} className="text-purple-400" />}
          {status === "connecting" && <Loader2 size={44} className="text-purple-400 animate-spin" />}
          {status === "live" && <Phone size={44} className="text-white" />}
          {status === "error" && <PhoneOff size={44} className="text-red-400" />}
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white">
            {status === "idle" && "Hablar con DILO"}
            {status === "connecting" && "Conectando…"}
            {status === "live" && (aiSpeaking ? "DILO está hablando…" : userSpeaking ? "Te escucho…" : "En directo")}
            {status === "error" && "No se pudo conectar"}
          </h2>
          <p className="text-sm text-[var(--dim)] mt-1">
            {status === "idle" && "Pulsa para iniciar una conversación en tiempo real por voz."}
            {status === "connecting" && "Preparando el canal de voz…"}
            {status === "live" && "Habla con naturalidad, DILO te oye y responde en tiempo real."}
            {status === "error" && error}
          </p>
        </div>

        {status === "idle" && (
          <button
            type="button"
            onClick={start}
            className="px-6 py-3 rounded-full bg-purple-600 text-white font-medium flex items-center gap-2"
          >
            <Mic size={16} /> Empezar
          </button>
        )}

        {status === "live" && (
          <button
            type="button"
            onClick={() => { cleanup(); onClose(); }}
            className="px-6 py-3 rounded-full bg-red-500 text-white font-medium flex items-center gap-2"
          >
            <PhoneOff size={16} /> Colgar
          </button>
        )}

        {status === "error" && (
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="px-6 py-3 rounded-full bg-[var(--bg2)] border border-[var(--border)] text-white font-medium"
          >
            Reintentar
          </button>
        )}

        <p className="text-[10px] text-[var(--dim)] opacity-70">
          Powered by OpenAI Realtime · gpt-4o-mini
        </p>
      </div>
    </div>
  );
}
