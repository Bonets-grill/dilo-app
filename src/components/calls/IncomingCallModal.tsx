"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";

interface IncomingCallModalProps {
  callerName: string;
  callType: "voice" | "video";
  onAnswer: () => void;
  onReject: () => void;
}

export default function IncomingCallModal({
  callerName,
  callType,
  onAnswer,
  onReject,
}: IncomingCallModalProps) {
  const t = useTranslations("calls");

  // Auto-dismiss after 30s (missed call)
  useEffect(() => {
    const timeout = setTimeout(() => {
      onReject();
    }, 30000);
    return () => clearTimeout(timeout);
  }, [onReject]);

  return (
    <div role="alertdialog" aria-modal="true" aria-label={t("incomingCall")} aria-describedby="incoming-call-info" className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm">
      {/* Pulsing ring animation */}
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
        <div
          className="absolute -inset-4 rounded-full bg-green-500/10 animate-ping"
          style={{ animationDelay: "0.3s" }}
        />
        <div
          className="absolute -inset-8 rounded-full bg-green-500/5 animate-ping"
          style={{ animationDelay: "0.6s" }}
        />
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
          {callType === "video" ? (
            <Video size={40} className="text-white" />
          ) : (
            <Phone size={40} className="text-white" />
          )}
        </div>
      </div>

      {/* Call info */}
      <div id="incoming-call-info">
        <p className="text-sm text-[var(--dim)] mb-2">{t("incomingCall")}</p>
        <h2 className="text-2xl font-bold text-white mb-1">{callerName}</h2>
        <p className="text-sm text-[var(--dim)] mb-12">
          {callType === "video" ? t("videoCall") : t("voiceCall")}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-16">
        <button type="button"
          onClick={onReject}
          aria-label={t("decline")}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center active:scale-95 transition-transform">
            <PhoneOff size={28} className="text-white" aria-hidden="true" />
          </div>
          <span className="text-xs text-[var(--dim)]">{t("decline")}</span>
        </button>

        <button type="button"
          onClick={onAnswer}
          aria-label={t("accept")}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center active:scale-95 transition-transform">
            <Phone size={28} className="text-white" aria-hidden="true" />
          </div>
          <span className="text-xs text-[var(--dim)]">{t("accept")}</span>
        </button>
      </div>
    </div>
  );
}
