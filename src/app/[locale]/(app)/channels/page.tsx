"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Smartphone, Send, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function ChannelsPage() {
  const t = useTranslations("channels");
  const [waStatus, setWaStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"qr" | "code">("qr");
  const [phone, setPhone] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const uid = data.user.id;
        const inst = `dilo_${uid.slice(0, 8)}`;
        setUserId(uid);
        setInstanceName(inst);

        // Check if already connected
        try {
          const res = await fetch("/api/evolution", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", instanceName: inst }),
          });
          const status = await res.json();
          if (status?.instance?.state === "open" || status?.state === "open") {
            setWaStatus("connected");
          }
        } catch { /* not connected */ }
      }
    });
  }, []);

  // Poll status when connecting
  useEffect(() => {
    if (waStatus !== "connecting" || !instanceName) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/evolution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", instanceName }),
        });
        const data = await res.json();
        if (data?.instance?.state === "open" || data?.state === "open") {
          setWaStatus("connected");
          setQrCode(null);
          clearInterval(interval);
        }
      } catch { /* retry */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [waStatus, instanceName]);

  async function connectWhatsApp() {
    if (!instanceName) return;
    setError("");
    setWaStatus("connecting");

    try {
      // Create instance
      await fetch("/api/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", instanceName }),
      });

      // Get QR
      const qrRes = await fetch("/api/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "qr", instanceName }),
      });
      const qrData = await qrRes.json();

      if (qrData?.base64 || qrData?.qrcode?.base64) {
        setQrCode(qrData.base64 || qrData.qrcode.base64);
      } else if (qrData?.code) {
        setQrCode(qrData.code);
      } else {
        // Maybe already connected
        const statusRes = await fetch("/api/evolution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", instanceName }),
        });
        const statusData = await statusRes.json();
        if (statusData?.instance?.state === "open" || statusData?.state === "open") {
          setWaStatus("connected");
          return;
        }
        setError("No se pudo obtener el QR. Intenta de nuevo.");
        setWaStatus("disconnected");
      }
    } catch (e) {
      setError("Error al conectar. Intenta de nuevo.");
      setWaStatus("disconnected");
    }
  }

  async function connectByCode() {
    if (!instanceName) return;
    const num = phone.replace(/\D/g, "");
    if (num.length < 8) {
      setError("Introduce un número válido con prefijo país (ej: 34612345678)");
      return;
    }
    setError("");
    setWaStatus("connecting");
    setPairCode(null);

    try {
      // Ensure instance exists (idempotent — if already created, Evolution returns 403/conflict which we ignore)
      await fetch("/api/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", instanceName }),
      });

      const res = await fetch("/api/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pair", instanceName, phoneNumber: num }),
      });
      const data = await res.json();
      const code: string | undefined = data?.pairingCode || data?.code;
      if (code && !code.startsWith("2@")) {
        // Evolution returns format like "ABCD-1234" — normalize to XXXX-XXXX
        const clean = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
        const formatted = clean.length === 8 ? `${clean.slice(0,4)}-${clean.slice(4)}` : code;
        setPairCode(formatted);
      } else {
        setError("No se pudo obtener el código. Intenta de nuevo.");
        setWaStatus("disconnected");
      }
    } catch {
      setError("Error al conectar. Intenta de nuevo.");
      setWaStatus("disconnected");
    }
  }

  async function disconnectWhatsApp() {
    if (!instanceName) return;
    await fetch("/api/evolution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout", instanceName }),
    });
    setWaStatus("disconnected");
    setQrCode(null);
    setPairCode(null);
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        {/* WhatsApp */}
        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Smartphone size={18} className="text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{t("whatsapp")}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {waStatus === "connected" ? (
                    <><CheckCircle2 size={10} className="text-green-400" /><p className="text-xs text-green-400">{t("connected")}</p></>
                  ) : waStatus === "connecting" ? (
                    <><Loader2 size={10} className="text-yellow-400 animate-spin" /><p className="text-xs text-yellow-400">{t("connecting")}</p></>
                  ) : (
                    <p className="text-xs text-[var(--dim)]">{t("disconnected")}</p>
                  )}
                </div>
              </div>
            </div>
            {waStatus === "connected" && (
              <button type="button" onClick={disconnectWhatsApp} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium">{t("disconnect")}</button>
            )}
          </div>

          {waStatus !== "connected" && (
            <>
              {/* Mode tabs: QR vs pairing code */}
              <div className="flex gap-2 mb-3 p-1 bg-[var(--bg3)] rounded-lg">
                <button
                  type="button"
                  onClick={() => { setMode("qr"); setPairCode(null); setError(""); }}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${mode === "qr" ? "bg-[var(--bg2)] text-white shadow" : "text-[var(--dim)]"}`}
                >
                  QR
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("code"); setQrCode(null); setError(""); }}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${mode === "code" ? "bg-[var(--bg2)] text-white shadow" : "text-[var(--dim)]"}`}
                >
                  Código
                </button>
              </div>

              {mode === "qr" ? (
                <>
                  {waStatus === "disconnected" && (
                    <button type="button" onClick={connectWhatsApp} className="w-full py-2.5 rounded-lg bg-green-600 text-white text-xs font-medium">
                      {t("connect")}
                    </button>
                  )}
                  {qrCode && waStatus === "connecting" && (
                    <div className="mt-4 flex flex-col items-center">
                      {qrCode.startsWith("data:") ? (
                        <img src={qrCode} alt="QR" className="w-56 h-56 rounded-lg bg-white p-2" />
                      ) : (
                        <div className="w-56 h-56 rounded-lg bg-white p-3 flex items-center justify-center">
                          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`} alt="QR" className="w-full h-full" />
                        </div>
                      )}
                      <p className="text-xs text-[var(--dim)] mt-3 text-center">{t("scanInstructions")}</p>
                    </div>
                  )}
                  <p className="text-[10px] text-[var(--dim)] mt-3 leading-relaxed">
                    💡 Escanea el QR desde un PC o tablet. Si solo tienes el móvil, usa la pestaña <b>Código</b> →
                  </p>
                </>
              ) : (
                <>
                  {!pairCode ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] text-[var(--dim)] block mb-1.5">Número con prefijo país (sin +)</label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          placeholder="34612345678"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg3)] border border-[var(--border)] text-sm outline-none focus:border-green-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={connectByCode}
                        disabled={waStatus === "connecting"}
                        className="w-full py-2.5 rounded-lg bg-green-600 text-white text-xs font-medium disabled:opacity-50"
                      >
                        {waStatus === "connecting" ? "Pidiendo código..." : "Obtener código"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4 text-center">
                        <p className="text-[10px] text-[var(--dim)] mb-2">Tu código de vinculación</p>
                        <p className="text-3xl font-black tracking-[0.3em] text-green-400 font-mono">{pairCode}</p>
                      </div>
                      <ol className="text-[11px] text-[var(--muted)] leading-relaxed space-y-1 list-decimal list-inside">
                        <li>Abre WhatsApp en tu móvil</li>
                        <li>Ve a <b>Ajustes → Dispositivos vinculados → Vincular un dispositivo</b></li>
                        <li>Toca <b>Vincular con número de teléfono</b></li>
                        <li>Introduce el código de arriba</li>
                      </ol>
                      <button
                        type="button"
                        onClick={() => { setPairCode(null); setWaStatus("disconnected"); }}
                        className="w-full py-2 rounded-lg bg-[var(--bg3)] text-[var(--muted)] text-xs"
                      >
                        Pedir otro código
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Telegram */}
        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Send size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{t("telegram")}</p>
                <p className="text-xs text-[var(--dim)]">{t("disconnected")}</p>
              </div>
            </div>
            <button type="button" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium">{t("connect")}</button>
          </div>
          <p className="text-xs text-[var(--dim)]">{t("telegramInstructions")}</p>
        </div>
      </div>
    </div>
  );
}
