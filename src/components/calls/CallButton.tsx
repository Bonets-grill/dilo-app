"use client";

import { useTranslations } from "next-intl";
import { Phone, Video } from "lucide-react";
import { useCall } from "./CallProvider";

interface CallButtonProps {
  calleeId: string;
  calleeName: string;
}

export default function CallButton({ calleeId, calleeName }: CallButtonProps) {
  const t = useTranslations("calls");
  const { initiateCall } = useCall();

  return (
    <div className="flex items-center gap-2">
      <button type="button"
        onClick={() => initiateCall(calleeId, calleeName, "voice")}
        className="p-2 rounded-full bg-green-500/10 hover:bg-green-500/20 transition-colors active:scale-95"
        aria-label={`${t("voiceCall")} ${calleeName}`}
      >
        <Phone size={18} className="text-green-400" aria-hidden="true" />
      </button>
      <button type="button"
        onClick={() => initiateCall(calleeId, calleeName, "video")}
        className="p-2 rounded-full bg-blue-500/10 hover:bg-blue-500/20 transition-colors active:scale-95"
        aria-label={`${t("videoCall")} ${calleeName}`}
      >
        <Video size={18} className="text-blue-400" aria-hidden="true" />
      </button>
    </div>
  );
}
