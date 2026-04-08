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

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        setInstanceName(`dilo_${data.user.id.slice(0, 8)}`);
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

  async function disconnectWhatsApp() {
    if (!instanceName) return;
    await fetch("/api/evolution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout", instanceName }),
    });
    setWaStatus("disconnected");
    setQrCode(null);
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
            {waStatus === "connected" ? (
              <button onClick={disconnectWhatsApp} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium">{t("disconnect")}</button>
            ) : waStatus === "disconnected" ? (
              <button onClick={connectWhatsApp} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium">{t("connect")}</button>
            ) : null}
          </div>

          {/* QR Code */}
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

          {waStatus === "disconnected" && !qrCode && (
            <p className="text-xs text-[var(--dim)]">{t("scanInstructions")}</p>
          )}

          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <p className="text-[10px] text-[var(--dim)] leading-relaxed">
              💡 Escanea el QR desde un PC o tablet. Si solo tienes el móvil, usa la opción de WhatsApp Cloud abajo — los mensajes salen desde el número de DILO.
            </p>
          </div>
        </div>

        {/* WhatsApp Cloud API (sin QR) */}
        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <span className="text-lg">☁️</span>
              </div>
              <div>
                <p className="text-sm font-medium">WhatsApp Cloud</p>
                <p className="text-xs text-[var(--dim)]">Sin QR — mensajes desde número DILO</p>
              </div>
            </div>
            <span className="px-2 py-1 rounded text-[10px] bg-yellow-500/10 text-yellow-400">Próximamente</span>
          </div>
          <p className="text-xs text-[var(--dim)] leading-relaxed">Los mensajes se envían desde el número oficial de DILO. No necesitas escanear QR. Solo pon tu número y listo.</p>
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
            <button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium">{t("connect")}</button>
          </div>
          <p className="text-xs text-[var(--dim)]">{t("telegramInstructions")}</p>
        </div>
      </div>
    </div>
  );
}
