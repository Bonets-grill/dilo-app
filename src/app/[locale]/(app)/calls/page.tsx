"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { PTTConnection } from "@/lib/rtc/ptt";
import { playOutgoingChirp, playIncomingChirp, playEndChirp } from "@/lib/rtc/chirp";
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  Loader2,
  Radio,
  Users,
  ChevronDown,
} from "lucide-react";
import { useCall } from "@/components/calls/CallProvider";

interface CallRecord {
  id: string;
  calleeId: string;
  callerId: string;
  callerName: string;
  calleeName: string;
  callType: "voice" | "video";
  status: "ended" | "missed" | "rejected";
  duration: number;
  createdAt: string;
}

interface Contact {
  connectionId: string;
  userId: string;
  name: string;
  avatar_url: string | null;
}

function formatCallDuration(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatCallTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays <= 1) return time;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function CallsPage() {
  const t = useTranslations("calls");
  const { initiateCall } = useCall();

  const [userId, setUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<Contact | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Walkie state ─────────────────────────────────────────────────────────
  const [pttStatus, setPttStatus] = useState<string>("idle");
  const [talking, setTalking] = useState(false);
  const [pttBusy, setPttBusy] = useState(false);
  const [pttError, setPttError] = useState("");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const pttRef = useRef<PTTConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  function dbg(line: string) {
    const ts = new Date().toISOString().slice(11, 19);
    setDebugLog((prev) => [`${ts} ${line}`, ...prev].slice(0, 30));
    console.log("[walkie.ui]", line);
  }

  // Load user + contacts + call history
  useEffect(() => {
    const supabase = createBrowserSupabase();

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const [connRes, callsRes] = await Promise.all([
        fetch("/api/connections"),
        fetch("/api/calls/history"),
      ]);

      if (connRes.ok) {
        const connData = await connRes.json();
        const list: Contact[] = (connData.contacts || []).map((c: { userId: string; connectionId: string; name: string; avatar_url: string | null }) => ({
          connectionId: c.connectionId,
          userId: c.userId,
          name: c.name,
          avatar_url: c.avatar_url,
        }));
        setContacts(list);
        if (list[0]) setSelectedPeer(list[0]);
      }

      if (callsRes.ok) {
        const callsData = await callsRes.json();
        setCalls(callsData.calls || []);
      }

      setLoading(false);
    })();
  }, []);

  // Re-mount PTTConnection whenever the selected peer changes
  useEffect(() => {
    if (!userId || !selectedPeer) return;
    dbg(`mount peer=${selectedPeer.userId.slice(0, 8)} name=${selectedPeer.name}`);
    const conn = new PTTConnection(
      userId,
      selectedPeer.userId,
      (s) => {
        dbg(`status → ${s}`);
        setPttStatus(s);
      },
      {
        audioEl: remoteAudioRef.current,
        onDebug: (m) => dbg(`rtc: ${m}`),
      }
    );
    pttRef.current = conn;
    conn.listen();
    return () => {
      conn.disconnect();
      pttRef.current = null;
    };
  }, [userId, selectedPeer]);

  // Nextel chirps on status transitions
  const prevStatusRef = useRef(pttStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev !== "receiving" && pttStatus === "receiving") {
      playIncomingChirp();
    } else if (prev === "receiving" && pttStatus !== "receiving") {
      playEndChirp();
    }
    prevStatusRef.current = pttStatus;
  }, [pttStatus]);

  async function onPressPTT() {
    const conn = pttRef.current;
    if (!conn || pttBusy) return;
    setPttError("");
    setPttBusy(true);
    dbg(`PRESS status=${pttStatus}`);
    playOutgoingChirp();
    try {
      if (pttStatus === "idle" || pttStatus === "listening" || pttStatus === "disconnected") {
        dbg("calling startCall()");
        await conn.startCall();
        dbg("startCall OK");
      }
      conn.startTalking();
      setTalking(true);
      dbg("talking=true");
    } catch (err) {
      setTalking(false);
      const msg = err instanceof Error ? err.message : "error";
      dbg(`ERROR press: ${msg}`);
      if (/Permission|denied|NotAllowed/i.test(msg)) {
        setPttError("Permiso de micrófono denegado. Ajustes → Safari → Micrófono.");
      } else if (/NotFound|no microphone/i.test(msg)) {
        setPttError("No se detectó micrófono en el dispositivo.");
      } else {
        setPttError("Walkie no pudo iniciar: " + msg);
      }
    } finally {
      setPttBusy(false);
    }
  }

  function onReleasePTT() {
    const conn = pttRef.current;
    if (!conn) return;
    if (talking) {
      dbg("RELEASE");
      conn.stopTalking();
      playEndChirp();
    }
    setTalking(false);
  }

  function handleCallBack(call: CallRecord) {
    if (!userId) return;
    const isIncoming = call.callerId !== userId;
    const targetId = isIncoming ? call.callerId : call.calleeId;
    const targetName = isIncoming ? call.callerName : call.calleeName;
    initiateCall(targetId, targetName, call.callType);
  }

  const connected = pttStatus === "connected" || pttStatus === "receiving";
  const receiving = pttStatus === "receiving";

  // Status label for the walkie header
  let statusLabel = "Selecciona un contacto";
  if (selectedPeer) {
    if (pttBusy && !talking) statusLabel = "Conectando…";
    else if (talking) statusLabel = "🔴 HABLANDO";
    else if (receiving) statusLabel = "🟢 El otro habla";
    else if (connected) statusLabel = "Listo para hablar";
    else if (pttStatus === "listening") statusLabel = "Esperando al otro lado…";
    else statusLabel = "Mantén pulsado para hablar";
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hidden audio sink for the remote walkie stream. Must be mounted in the
          DOM (not `new Audio()`) so iOS Safari accepts the autoplay of the
          incoming WebRTC track. `playsInline` is required on iOS. */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        {...{ "webkit-playsinline": "true" }}
        hidden
      />

      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold">Walkie Talkie · {t("callHistory")}</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Walkie Talkie (Nextel-style) ──────────────────────────────── */}
        <div className="px-4 py-6 border-b border-[var(--border)] bg-gradient-to-b from-[var(--bg2)]/40 to-transparent">
          {/* Contact picker */}
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-[var(--dim)]" size={20} />
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-4">
              <Users size={28} className="mx-auto mb-2 text-[var(--dim)]" />
              <p className="text-sm text-[var(--dim)]">
                Añade contactos en DM para usar el walkie
              </p>
            </div>
          ) : (
            <div className="relative mb-6">
              <button
                type="button"
                onClick={() => setShowPicker((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] active:bg-[var(--bg3)]"
              >
                {selectedPeer ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-sm font-bold text-[var(--accent)]">
                      {selectedPeer.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--dim)]">Canal</p>
                      <p className="text-sm font-semibold">{selectedPeer.name}</p>
                    </div>
                  </>
                ) : (
                  <p className="flex-1 text-sm text-[var(--dim)] text-left">Elige contacto…</p>
                )}
                <ChevronDown size={16} className={`text-[var(--dim)] transition-transform ${showPicker ? "rotate-180" : ""}`} />
              </button>

              {showPicker && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-64 overflow-y-auto rounded-2xl bg-[#1c1c1e] border border-white/10 shadow-2xl">
                  {contacts.map((c) => (
                    <button
                      key={c.connectionId}
                      type="button"
                      onClick={() => {
                        setSelectedPeer(c);
                        setShowPicker(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 active:bg-white/10 transition"
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-[10px] font-bold text-[var(--accent)]">
                        {c.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm flex-1">{c.name}</span>
                      {selectedPeer?.userId === c.userId && (
                        <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Big Nextel-style PTT button */}
          <div className="flex flex-col items-center gap-3">
            <p className={`text-xs font-medium uppercase tracking-wider transition-colors ${
              talking ? "text-red-400" : receiving ? "text-green-400" : "text-[var(--dim)]"
            }`}>
              {statusLabel}
            </p>

            <button
              type="button"
              disabled={!selectedPeer || pttBusy}
              onPointerDown={(e) => { e.preventDefault(); onPressPTT(); }}
              onPointerUp={(e) => { e.preventDefault(); onReleasePTT(); }}
              onPointerLeave={onReleasePTT}
              onPointerCancel={onReleasePTT}
              aria-label="Mantén pulsado para hablar"
              className={`
                select-none touch-none w-40 h-40 rounded-full flex items-center justify-center
                transition-all duration-75 shadow-2xl
                ${talking
                  ? "bg-red-600 scale-95 ring-8 ring-red-500/30"
                  : receiving
                    ? "bg-green-600 scale-100 ring-8 ring-green-500/30 animate-pulse"
                    : connected
                      ? "bg-[var(--accent)] active:scale-95"
                      : selectedPeer
                        ? "bg-[var(--bg3)] active:scale-95 border-2 border-[var(--accent)]/40"
                        : "bg-[var(--bg2)] opacity-40"
                }
              `}
            >
              {pttBusy ? (
                <Loader2 size={48} className="animate-spin text-white" />
              ) : (
                <Radio size={56} className={talking || receiving || connected ? "text-white" : "text-[var(--dim)]"} />
              )}
            </button>

            <p className="text-[11px] text-[var(--dim)] max-w-xs text-center">
              Mantén pulsado para hablar · suelta para escuchar · audio en tiempo real por WebRTC P2P
            </p>

            {pttError && (
              <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2 max-w-xs text-center">
                ⚠ {pttError}
              </p>
            )}

            {/* Debug panel — toggle button + visible log (sin DevTools) */}
            <button
              type="button"
              onClick={() => setShowDebug((v) => !v)}
              className="text-[10px] text-[var(--dim)] underline decoration-dotted"
            >
              {showDebug ? "Ocultar diagnóstico" : `Diagnóstico (${debugLog.length} eventos · ${pttStatus})`}
            </button>
            {showDebug && (
              <div className="w-full max-w-md text-[10px] font-mono bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-3 max-h-64 overflow-y-auto">
                <div className="flex justify-between mb-1 pb-1 border-b border-[var(--border)]">
                  <span className="text-[var(--dim)]">status: <span className="text-[var(--fg)]">{pttStatus}</span></span>
                  <span className="text-[var(--dim)]">peer: <span className="text-[var(--fg)]">{selectedPeer?.name || "(ninguno)"}</span></span>
                </div>
                {debugLog.length === 0 ? (
                  <p className="text-[var(--dim)]">Sin eventos aún. Pulsa el botón radio.</p>
                ) : (
                  debugLog.map((l, i) => (
                    <div key={i} className="text-[var(--fg)] leading-tight">{l}</div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Call history ─────────────────────────────────────────────── */}
        <div className="px-1 py-2">
          <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--dim)]">
            {t("callHistory")}
          </p>
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 size={20} className="animate-spin text-[var(--dim)]" />
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-[var(--dim)]">
              <Phone size={24} className="mb-2 opacity-40" />
              <p className="text-xs">{t("noCallsYet")}</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {calls.map((call) => {
                const isIncoming = call.callerId !== userId;
                const isMissed = call.status === "missed";
                const isRejected = call.status === "rejected";
                const displayName = isIncoming ? call.callerName : call.calleeName;
                return (
                  <button
                    type="button"
                    key={call.id}
                    onClick={() => handleCallBack(call)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors active:bg-white/10"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isMissed || isRejected ? "bg-red-500/10" : "bg-green-500/10"
                    }`}>
                      {call.callType === "video" ? (
                        <Video size={18} className={isMissed || isRejected ? "text-red-400" : "text-green-400"} />
                      ) : (
                        <Phone size={18} className={isMissed || isRejected ? "text-red-400" : "text-green-400"} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium truncate ${isMissed ? "text-red-400" : "text-white"}`}>
                          {displayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[var(--dim)]">
                        {isIncoming ? <PhoneIncoming size={12} /> : <PhoneOutgoing size={12} />}
                        <span>
                          {isMissed
                            ? t("missedCall")
                            : isRejected
                              ? t("rejectedCall")
                              : call.callType === "video"
                                ? t("videoCall")
                                : t("voiceCall")}
                        </span>
                        {call.status === "ended" && call.duration > 0 && (
                          <>
                            <span>·</span>
                            <span>{formatCallDuration(call.duration)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--dim)] flex-shrink-0">
                      {formatCallTime(call.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
