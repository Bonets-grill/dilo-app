"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import {
  Phone,
  Video,
  PhoneMissed,
  PhoneOff,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  Loader2,
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

function formatCallDuration(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatCallTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffDays === 0) return time;
  if (diffDays === 1) return `${time}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function CallsPage() {
  const t = useTranslations("calls");
  const { initiateCall } = useCall();

  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      try {
        const res = await fetch(
          `/api/calls/history?userId=${encodeURIComponent(user.id)}`
        );
        if (res.ok) {
          const data = await res.json();
          setCalls(data.calls || []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function handleCallBack(call: CallRecord) {
    if (!userId) return;
    const isIncoming = call.callerId !== userId;
    const targetId = isIncoming ? call.callerId : call.calleeId;
    const targetName = isIncoming ? call.callerName : call.calleeName;
    initiateCall(targetId, targetName, call.callType);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold">{t("callHistory")}</h1>
      </div>

      {/* Call list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-[var(--dim)]" />
          </div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-[var(--dim)]">
            <Phone size={32} className="mb-3 opacity-40" />
            <p className="text-sm">{t("noCallsYet")}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {calls.map((call) => {
              const isIncoming = call.callerId !== userId;
              const isMissed = call.status === "missed";
              const isRejected = call.status === "rejected";
              const displayName = isIncoming
                ? call.callerName
                : call.calleeName;

              return (
                <button type="button"
                  key={call.id}
                  onClick={() => handleCallBack(call)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors active:bg-white/10"
                >
                  {/* Call type icon */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isMissed || isRejected
                        ? "bg-red-500/10"
                        : "bg-green-500/10"
                    }`}
                  >
                    {call.callType === "video" ? (
                      <Video
                        size={18}
                        className={
                          isMissed || isRejected
                            ? "text-red-400"
                            : "text-green-400"
                        }
                      />
                    ) : (
                      <Phone
                        size={18}
                        className={
                          isMissed || isRejected
                            ? "text-red-400"
                            : "text-green-400"
                        }
                      />
                    )}
                  </div>

                  {/* Call info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-medium truncate ${
                          isMissed ? "text-red-400" : "text-white"
                        }`}
                      >
                        {displayName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--dim)]">
                      {isIncoming ? (
                        <PhoneIncoming size={12} />
                      ) : (
                        <PhoneOutgoing size={12} />
                      )}
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

                  {/* Time */}
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
  );
}
